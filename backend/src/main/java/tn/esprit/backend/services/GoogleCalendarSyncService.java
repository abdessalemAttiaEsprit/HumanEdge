package tn.esprit.backend.services;

import com.google.api.client.util.DateTime;
import com.google.api.services.calendar.Calendar;
import com.google.api.services.calendar.model.Event;
import com.google.api.services.calendar.model.EventDateTime;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import tn.esprit.backend.entities.Enum.SyncSourceType;
import tn.esprit.backend.entities.GoogleCalendarAccount;
import tn.esprit.backend.entities.GoogleCalendarEventLink;
import tn.esprit.backend.entities.User;
import tn.esprit.backend.repositories.GoogleCalendarAccountRepo;
import tn.esprit.backend.repositories.GoogleCalendarEventLinkRepo;

import java.io.IOException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;

/**
 * Traduit les absences/tâches/entretiens/paiements en événements sur le calendrier Google
 * secondaire "HumanEdge" de chaque utilisateur connecté (voir GoogleCalendarAccount). Ne lève
 * jamais d'exception vers l'appelant : un souci de synchronisation (compte non connecté, token
 * expiré, Google indisponible...) est loggé et ignoré plutôt que de faire échouer l'opération
 * métier (création d'absence, de tâche, ...) qui reste la source de vérité.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class GoogleCalendarSyncService {

    private static final String CALENDAR_NAME = "HumanEdge";

    private final GoogleCalendarAccountRepo accountRepo;
    private final GoogleCalendarEventLinkRepo linkRepo;
    private final GoogleOAuthService googleOAuthService;

    /** Événement journée(s) entière(s), ex: absence, tâche, échéance de paie. Pas d'effet si l'utilisateur n'est pas connecté. */
    public void syncAllDayEvent(User user, SyncSourceType type, Long sourceId, String title, String description, LocalDate startDate, LocalDate endDate, String location) {
        if (startDate == null || endDate == null) {
            return;
        }
        Event event = new Event().setSummary(title).setDescription(description).setLocation(location)
                .setStart(new EventDateTime().setDate(toGoogleDate(startDate)))
                // Google traite la date de fin d'un événement "journée entière" comme EXCLUSIVE.
                .setEnd(new EventDateTime().setDate(toGoogleDate(endDate.plusDays(1))));
        withCalendar(user, (account, service) -> upsert(service, account, user, type, sourceId, event));
    }

    /** Événement horodaté, ex: entretien de recrutement. */
    public void syncTimedEvent(User user, SyncSourceType type, Long sourceId, String title, String description, LocalDateTime start, LocalDateTime end, String location) {
        if (start == null || end == null) {
            return;
        }
        Event event = new Event().setSummary(title).setDescription(description).setLocation(location)
                .setStart(new EventDateTime().setDateTime(toGoogleDateTime(start)))
                .setEnd(new EventDateTime().setDateTime(toGoogleDateTime(end)));
        withCalendar(user, (account, service) -> upsert(service, account, user, type, sourceId, event));
    }

    /** Retire l'événement du calendrier d'UN utilisateur précis (ex: un employé retire sa propre demande). */
    public void deleteEventForUser(User user, SyncSourceType type, Long sourceId) {
        if (user == null) {
            return;
        }
        withCalendar(user, (account, service) -> deleteLink(service, account,
                linkRepo.findBySourceTypeAndSourceIdAndUser_IdUser(type, sourceId, user.getIdUser())));
    }

    /** Retire l'événement de TOUS les calendriers où il avait été synchronisé (ex: absence rejetée/supprimée). */
    public void deleteEventForAllUsers(SyncSourceType type, Long sourceId) {
        for (GoogleCalendarEventLink link : linkRepo.findBySourceTypeAndSourceId(type, sourceId)) {
            User linkUser = link.getUser();
            withCalendar(linkUser, (account, service) -> deleteLink(service, account, Optional.of(link)));
        }
    }

    private void deleteLink(Calendar service, GoogleCalendarAccount account, Optional<GoogleCalendarEventLink> linkOpt) throws IOException {
        if (linkOpt.isEmpty()) {
            return;
        }
        GoogleCalendarEventLink link = linkOpt.get();
        service.events().delete(account.getCalendarId(), link.getGoogleEventId()).execute();
        linkRepo.delete(link);
    }

    private void upsert(Calendar service, GoogleCalendarAccount account, User user, SyncSourceType type, Long sourceId, Event event) throws IOException {
        Optional<GoogleCalendarEventLink> existing = linkRepo.findBySourceTypeAndSourceIdAndUser_IdUser(type, sourceId, user.getIdUser());
        if (existing.isPresent()) {
            service.events().update(account.getCalendarId(), existing.get().getGoogleEventId(), event).execute();
        } else {
            Event created = service.events().insert(account.getCalendarId(), event).execute();
            linkRepo.save(GoogleCalendarEventLink.builder()
                    .sourceType(type).sourceId(sourceId).user(user).googleEventId(created.getId()).build());
        }
    }

    private void ensureCalendar(GoogleCalendarAccount account, Calendar service) throws IOException {
        if (account.getCalendarId() != null) {
            return;
        }
        com.google.api.services.calendar.model.Calendar calendar =
                new com.google.api.services.calendar.model.Calendar().setSummary(CALENDAR_NAME);
        com.google.api.services.calendar.model.Calendar created = service.calendars().insert(calendar).execute();
        account.setCalendarId(created.getId());
        accountRepo.save(account);
    }

    @FunctionalInterface
    private interface CalendarAction {
        void run(GoogleCalendarAccount account, Calendar service) throws IOException;
    }

    private void withCalendar(User user, CalendarAction action) {
        if (user == null) {
            return;
        }
        GoogleCalendarAccount account = accountRepo.findByUser_IdUser(user.getIdUser()).orElse(null);
        if (account == null) {
            return;
        }
        try {
            Calendar service = googleOAuthService.getCalendarService(account);
            ensureCalendar(account, service);
            action.run(account, service);
        } catch (Exception e) {
            log.warn("Google Calendar sync failed for user {}: {}", user.getIdUser(), e.getMessage());
        }
    }

    private static DateTime toGoogleDate(LocalDate date) {
        return new DateTime(true, date.atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli(), null);
    }

    private static DateTime toGoogleDateTime(LocalDateTime dateTime) {
        return new DateTime(dateTime.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli());
    }
}

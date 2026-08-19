package tn.esprit.backend.services;


import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tn.esprit.backend.entities.Application;
import tn.esprit.backend.entities.Enum.Role;
import tn.esprit.backend.entities.Enum.SyncSourceType;
import tn.esprit.backend.entities.Interview;
import tn.esprit.backend.entities.JobPosting;
import tn.esprit.backend.exceptions.ResourceNotFoundException;
import tn.esprit.backend.repositories.InterviewRepo;
import tn.esprit.backend.repositories.UserRepository;
import tn.esprit.backend.security.OwnershipGuard;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class InterviewService {

    private final InterviewRepo interviewRepository;
    private final ApplicationService applicationService;
    private final JobPostingService jobPostingService;
    private final CandidateServiceImpl candidateService;
    private final UserRepository userRepository;
    private final OwnershipGuard ownershipGuard;
    private final InterviewEmailNotificationService interviewEmailNotificationService;
    private final NotificationService notificationService;
    private final GoogleCalendarSyncService googleCalendarSyncService;

    @Transactional // Garantit que l'entretien ET la candidature sont mis à jour ensemble
    public Interview scheduleInterview(Long applicationId, LocalDateTime date, String location) {
        // getApplicationById vérifie déjà que l'application appartient à l'entreprise courante.
        Application app = applicationService.getApplicationById(applicationId);

        // Mettre à jour les données d'entretien dans la candidature
        app.setInterviewDate(date);
        app.setInterviewLocation(location);
        app.setStatus("SHORTLISTED");
        applicationService.updateApplicationStatus(applicationId, "SHORTLISTED");

        Interview interview = Interview.builder()
                .candidate(app.getCandidate())
                .application(app)
                .job(app.getJobPosting())
                .interviewDate(date)
                .interviewLocation(location)
                .status("SCHEDULED")
                .createdAt(LocalDateTime.now())
                .build();

        Interview saved = interviewRepository.save(interview);
        interviewEmailNotificationService.notifyInterviewScheduled(app.getCandidate(), app.getJobPosting(), saved);
        if (app.getCandidate() != null) {
            notificationService.notify(app.getCandidate().getUser(),
                    "Interview scheduled for \"" + app.getJobPosting().getTitle() + "\" on " + date + ".");
        }
        syncInterviewToGoogleCalendar(saved);
        return saved;
    }


    public Interview updateInterviewStatus(Long interviewId, String status) {
        Interview interview = getInterviewById(interviewId); // vérifie déjà la propriété
        interview.setStatus(status);

        // Si l'entretien est complété, on peut aussi basculer automatiquement le statut de l'application
        // et prévenir le candidat par email (voir InterviewEmailNotificationService).
        if ("COMPLETED".equals(status)) {
            applicationService.updateApplicationStatus(interview.getApplication().getId(), "UNDER_REVIEW");
            interviewEmailNotificationService.notifyInterviewCompleted(interview.getCandidate(), interview.getJob(), interview);
        }

        Interview saved = interviewRepository.save(interview);
        syncInterviewToGoogleCalendar(saved); // rafraîchit la description (statut) de l'événement existant
        return saved;
    }

    public Interview createInterview(Interview interview) {
        if (interview.getJob() != null && interview.getJob().getId() != null) {
            JobPosting job = jobPostingService.getJobById(interview.getJob().getId());
            checkCompanyOwnsJob(job);
        }
        if (interview.getCreatedAt() == null) {
            interview.setCreatedAt(LocalDateTime.now());
        }
        Interview saved = interviewRepository.save(interview);
        syncInterviewToGoogleCalendar(saved);
        return saved;
    }

    public Interview getInterviewById(Long id) {
        Interview interview = interviewRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Interview not found"));
        if (interview.getJob() != null) {
            checkCompanyOwnsJob(interview.getJob());
        }
        if (ownershipGuard.isGuestRole()) {
            ownershipGuard.checkCandidateAccess(interview.getCandidate());
        }
        return interview;
    }


    public List<Interview> getInterviewsByJob(Long jobPostingId) {
        JobPosting job = jobPostingService.getJobById(jobPostingId);
        checkCompanyOwnsJob(job);
        return interviewRepository.findByJobId(jobPostingId);
    }

    public List<Interview> getInterviewsByApplication(Long applicationId) {
        // getApplicationById vérifie qu'un GUEST ne consulte que ses propres entretiens.
        applicationService.getApplicationById(applicationId);
        List<Interview> interviews = interviewRepository.findByApplicationId(applicationId);
        return filterByCompanyIfNeeded(interviews);
    }

    public List<Interview> getInterviewsByCandidate(Long candidateId) {
        // getCandidateById vérifie qu'un GUEST ne consulte que ses propres entretiens.
        candidateService.getCandidateById(candidateId);
        List<Interview> interviews = interviewRepository.findByCandidateId(candidateId);
        return filterByCompanyIfNeeded(interviews);
    }

    public List<Interview> getAllInterviews() {
        if (ownershipGuard.isAdmin()) {
            return interviewRepository.findAll();
        }
        return interviewRepository.findByJob_CreatedByCompany_IdCompany(ownershipGuard.currentCompanyId());
    }

    public Interview updateInterview(Long id, Interview interviewDetails) {
        Interview interview = getInterviewById(id); // vérifie déjà la propriété
        interview.setInterviewDate(interviewDetails.getInterviewDate());
        interview.setInterviewLocation(interviewDetails.getInterviewLocation());
        interview.setStatus(interviewDetails.getStatus());
        Interview saved = interviewRepository.save(interview);
        syncInterviewToGoogleCalendar(saved);
        return saved;
    }

    public void deleteInterview(Long id) {
        Interview interview = getInterviewById(id); // vérifie déjà la propriété
        interviewRepository.delete(interview);
        googleCalendarSyncService.deleteEventForAllUsers(SyncSourceType.INTERVIEW, id);
    }

    /**
     * Synchronise un entretien vers Google Calendar, sur le calendrier de chaque compte COMPANY
     * de l'entreprise propriétaire de l'offre (pas l'employé : les entretiens ne concernent que
     * l'entreprise et le candidat, voir la page Interviews). Durée par défaut d'1h (l'entité
     * Interview ne porte pas de date de fin).
     */
    private void syncInterviewToGoogleCalendar(Interview interview) {
        JobPosting job = interview.getJob();
        if (job == null || job.getCreatedByCompany() == null || interview.getInterviewDate() == null) {
            return;
        }
        String candidateName = interview.getCandidate() != null
                ? (interview.getCandidate().getFirstName() + " " + interview.getCandidate().getLastName()).trim()
                : "Candidate";
        String title = "Interview: " + candidateName + " — " + job.getTitle();
        String description = "Status: " + interview.getStatus();
        LocalDateTime start = interview.getInterviewDate();
        LocalDateTime end = start.plusHours(1);
        userRepository.findByCompany_IdCompany(job.getCreatedByCompany().getIdCompany()).stream()
                .filter(u -> u.getRole() == Role.COMPANY)
                .forEach(u -> googleCalendarSyncService.syncTimedEvent(
                        u, SyncSourceType.INTERVIEW, interview.getId(), title, description, start, end, interview.getInterviewLocation()));
    }

    private void checkCompanyOwnsJob(JobPosting job) {
        if (!ownershipGuard.isCompanyRole()) {
            return; // ADMIN : accès total ; GUEST : vérifié séparément via le candidat (checkCandidateAccess)
        }
        Long ownerCompanyId = job.getCreatedByCompany() != null ? job.getCreatedByCompany().getIdCompany() : null;
        ownershipGuard.checkCompanyAccess(ownerCompanyId);
    }

    /** Empêche une entreprise de voir les entretiens d'une autre entreprise dans une liste agrégée. */
    private List<Interview> filterByCompanyIfNeeded(List<Interview> interviews) {
        if (!ownershipGuard.isCompanyRole()) {
            return interviews;
        }
        Long myCompanyId = ownershipGuard.currentCompanyId();
        interviews.removeIf(i -> i.getJob() == null || i.getJob().getCreatedByCompany() == null
                || !i.getJob().getCreatedByCompany().getIdCompany().equals(myCompanyId));
        return interviews;
    }
}
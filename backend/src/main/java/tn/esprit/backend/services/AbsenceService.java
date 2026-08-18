package tn.esprit.backend.services;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import tn.esprit.backend.entities.Absence;
import tn.esprit.backend.entities.Enum.AbsenceStatus;
import tn.esprit.backend.entities.Enum.Role;
import tn.esprit.backend.entities.Personnel;
import tn.esprit.backend.entities.User;
import tn.esprit.backend.exceptions.BadRequestException;
import tn.esprit.backend.exceptions.ResourceNotFoundException;
import tn.esprit.backend.repositories.AbsenceRepo;
import tn.esprit.backend.repositories.PersonnelRepo;
import tn.esprit.backend.repositories.UserRepository;
import tn.esprit.backend.security.OwnershipGuard;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AbsenceService {

    private final AbsenceRepo absenceRepository;
    private final PersonnelRepo personnelRepository;
    private final UserRepository userRepository;
    private final OwnershipGuard ownershipGuard;
    private final AbsenceQuotaCalculator absenceQuotaCalculator;
    private final FileStorageService fileStorageService;
    private final NotificationService notificationService;

    /**
     * Récupère toutes les absences enregistrées.
     */
    @Transactional(readOnly = true)
    public List<Absence> getAllAbsences() {
        List<Absence> absences = ownershipGuard.isAdmin()
                ? absenceRepository.findAll()
                : absenceRepository.findByPersonnel_User_Company_IdCompany(ownershipGuard.currentCompanyId());
        attachDepartmentOverlaps(absences);
        return absences;
    }

    /**
     * Récupère une absence par son ID.
     */
    @Transactional(readOnly = true)
    public Absence getAbsenceById(Long id) {
        Absence absence = absenceRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Absence non trouvée avec l'id : " + id));
        ownershipGuard.checkPersonnelAccess(absence.getPersonnel());
        return absence;
    }

    /**
     * Enregistre une nouvelle absence. Le statut n'est jamais pris depuis le corps de la requête
     * (un EMPLOYE pourrait sinon s'auto-approuver) : une demande soumise par l'employé lui-même
     * démarre PENDING et notifie l'entreprise ; une saisie par COMPANY/ADMIN (y compris
     * AttendancePage qui réutilise ce même endpoint) est immédiatement APPROVED, comme avant
     * l'introduction de ce workflow.
     */
    @Transactional
    public Absence createAbsence(Absence absence) {
        // Optionnel : Vous pouvez ajouter une validation ici (ex: startDate avant endDate)
        Personnel realPersonnel = resolveAndCheckTargetPersonnel(absence.getPersonnel());
        absence.setPersonnel(realPersonnel);

        boolean selfRequest = !ownershipGuard.isAdmin() && !ownershipGuard.isCompanyRole();
        absence.setStatus(selfRequest ? AbsenceStatus.PENDING : AbsenceStatus.APPROVED);

        Absence saved = absenceRepository.save(absence);
        if (selfRequest) {
            notifyCompanyOfNewRequest(saved);
        }
        return saved;
    }

    /**
     * Met à jour une absence existante. Le statut ne se change jamais ici (même si le corps de
     * la requête en contient un) : seuls approveAbsence/rejectAbsence peuvent le faire.
     */
    @Transactional
    public Absence updateAbsence(Long id, Absence absenceDetails) {
        Absence existingAbsence = getAbsenceById(id); // vérifie déjà la propriété

        // Mise à jour des champs (en s'adaptant à vos variables actuelles)
        existingAbsence.setDateAbsence(absenceDetails.getDateAbsence());
        existingAbsence.setStartDate(absenceDetails.getStartDate());
        existingAbsence.setEndDate(absenceDetails.getEndDate());
        existingAbsence.setReason(absenceDetails.getReason()); // Attention à la majuscule si conservée ainsi
        existingAbsence.setJustification(absenceDetails.getJustification());

        // Ne réassigne à un autre personnel que si explicitement fourni (sinon on préserverait
        // par erreur un null et on casserait le lien existant), et seulement après avoir vérifié
        // que la nouvelle cible appartient bien à l'appelant — jamais faire confiance à
        // l'entité imbriquée envoyée par le client sans la valider.
        if (absenceDetails.getPersonnel() != null) {
            existingAbsence.setPersonnel(resolveAndCheckTargetPersonnel(absenceDetails.getPersonnel()));
        }

        return absenceRepository.save(existingAbsence);
    }

    /** Approuve une demande d'absence PENDING : consomme le quota et notifie l'employé. */
    @Transactional
    public Absence approveAbsence(Long id) {
        return decideAbsence(id, AbsenceStatus.APPROVED, "approved");
    }

    /** Rejette une demande d'absence PENDING : ne compte jamais pour le quota ni la paie. */
    @Transactional
    public Absence rejectAbsence(Long id) {
        return decideAbsence(id, AbsenceStatus.REJECTED, "rejected");
    }

    private Absence decideAbsence(Long id, AbsenceStatus decision, String verbForNotification) {
        Absence absence = getAbsenceById(id); // vérifie déjà la propriété (ADMIN, ou COMPANY de la même entreprise)
        if (absence.getStatus() != AbsenceStatus.PENDING) {
            throw new BadRequestException("Only a pending leave request can be approved or rejected");
        }
        absence.setStatus(decision);
        Absence saved = absenceRepository.save(absence);

        if (absence.getPersonnel() != null && absence.getPersonnel().getUser() != null) {
            notificationService.notify(absence.getPersonnel().getUser(),
                    "Your leave request (" + describePeriod(absence) + ") has been " + verbForNotification + ".");
        }
        return saved;
    }

    /**
     * Calcule le quota de jours d'absence justifiée acquis par un employé, à une date donnée.
     */
    @Transactional(readOnly = true)
    public AbsenceQuotaCalculator.QuotaSnapshot getAbsenceQuota(Long personnelId, LocalDate asOfDate) {
        Personnel personnel = personnelRepository.findById(personnelId)
                .orElseThrow(() -> new ResourceNotFoundException("Personnel not found with id: " + personnelId));
        ownershipGuard.checkPersonnelAccess(personnel);
        return absenceQuotaCalculator.computeAsOf(personnel, asOfDate != null ? asOfDate : LocalDate.now());
    }

    /**
     * Supprime une absence.
     */
    @Transactional
    public void deleteAbsence(Long id) {
        Absence absence = getAbsenceById(id); // vérifie déjà la propriété
        absenceRepository.delete(absence);
    }

    /**
     * Dépose le justificatif (fichier) d'une absence — remplace tout justificatif précédent.
     */
    @Transactional
    public Absence uploadJustification(Long id, MultipartFile file) {
        Absence absence = getAbsenceById(id); // vérifie déjà la propriété
        String storedFilename = fileStorageService.store(file, "absence_" + id, false);
        absence.setJustification(storedFilename);
        return absenceRepository.save(absence);
    }

    /**
     * Ne fait jamais confiance au Personnel imbriqué envoyé par le client : recharge toujours
     * l'entité réelle depuis la base (y compris pour ADMIN, qui doit tout de même fournir un
     * personnel valide) et vérifie qu'elle appartient bien à l'appelant.
     */
    private Personnel resolveAndCheckTargetPersonnel(Personnel requestedPersonnel) {
        if (requestedPersonnel == null || requestedPersonnel.getIdPersonnel() == null) {
            throw new AccessDeniedException("An associated personnel record is required");
        }
        Personnel realPersonnel = personnelRepository.findById(requestedPersonnel.getIdPersonnel())
                .orElseThrow(() -> new ResourceNotFoundException("Personnel not found"));
        if (!ownershipGuard.isAdmin()) {
            ownershipGuard.checkPersonnelAccess(realPersonnel);
        }
        return realPersonnel;
    }

    /** Même pattern que ApplicationService#notifyCompanyOfNewApplication : notifie tous les comptes COMPANY de l'entreprise. */
    private void notifyCompanyOfNewRequest(Absence absence) {
        User owner = absence.getPersonnel() != null ? absence.getPersonnel().getUser() : null;
        if (owner == null || owner.getCompany() == null) {
            return;
        }
        String employeeName = (owner.getFirstname() + " " + owner.getLastname()).trim();
        userRepository.findByCompany_IdCompany(owner.getCompany().getIdCompany()).stream()
                .filter(u -> u.getRole() == Role.COMPANY)
                .forEach(u -> notificationService.notify(u,
                        employeeName + " requested a leave (" + describePeriod(absence) + ")."));
    }

    private static final DateTimeFormatter PERIOD_DATE_FORMAT = DateTimeFormatter.ISO_LOCAL_DATE;

    private static String describePeriod(Absence absence) {
        if (absence.getStartDate() != null && absence.getEndDate() != null) {
            return PERIOD_DATE_FORMAT.format(absence.getStartDate()) + " to " + PERIOD_DATE_FORMAT.format(absence.getEndDate());
        }
        if (absence.getDateAbsence() != null) {
            return PERIOD_DATE_FORMAT.format(absence.getDateAbsence());
        }
        return "unspecified date";
    }

    // ==================== Chevauchement de congés au sein d'un même département ====================
    // Calculé à la volée (jamais persisté, voir Absence.departmentOverlapNames) : sert d'alerte
    // visuelle côté frontend ("un autre employé de ce département est déjà absent sur ces dates"),
    // jamais utilisé pour bloquer une demande.

    /**
     * Annote chaque absence de la liste avec les collègues du même département (et de la même
     * entreprise) dont le congé chevauche. La liste passée doit déjà couvrir tous les employés à
     * comparer entre eux (ex: AbsenceService#getAllAbsences) - pour une liste ne couvrant qu'un
     * seul employé (ex: Personnel.absences), utiliser la variante avec companyId à la place.
     */
    private void attachDepartmentOverlaps(List<Absence> absences) {
        Map<Long, List<Absence>> byCompany = absences.stream()
                .filter(a -> companyIdOf(a) != null)
                .collect(Collectors.groupingBy(AbsenceService::companyIdOf));
        for (Absence absence : absences) {
            absence.setDepartmentOverlapNames(computeOverlapNames(absence, byCompany.getOrDefault(companyIdOf(absence), List.of())));
        }
    }

    /**
     * Variante pour une liste déjà scopée à un seul employé (ex: Personnel.absences côté
     * PersonnelService#getMyPersonnel) : ces absences-là n'incluent jamais celles des collègues,
     * donc on recharge tout le reste de l'entreprise pour pouvoir comparer.
     */
    @Transactional(readOnly = true)
    public void attachDepartmentOverlaps(List<Absence> absencesToAnnotate, Long companyId) {
        if (companyId == null) {
            return;
        }
        List<Absence> companyWide = absenceRepository.findByPersonnel_User_Company_IdCompany(companyId);
        for (Absence absence : absencesToAnnotate) {
            absence.setDepartmentOverlapNames(computeOverlapNames(absence, companyWide));
        }
    }

    private static Long companyIdOf(Absence absence) {
        Personnel personnel = absence.getPersonnel();
        if (personnel == null || personnel.getUser() == null || personnel.getUser().getCompany() == null) {
            return null;
        }
        return personnel.getUser().getCompany().getIdCompany();
    }

    private static boolean isRejected(Absence absence) {
        return absence.getStatus() == AbsenceStatus.REJECTED;
    }

    private static LocalDate[] effectiveRange(Absence absence) {
        if (absence.getDateAbsence() != null) {
            return new LocalDate[]{absence.getDateAbsence(), absence.getDateAbsence()};
        }
        return new LocalDate[]{absence.getStartDate(), absence.getEndDate()};
    }

    private static boolean rangesOverlap(LocalDate start1, LocalDate end1, LocalDate start2, LocalDate end2) {
        if (start1 == null || end1 == null || start2 == null || end2 == null) {
            return false;
        }
        return !end1.isBefore(start2) && !end2.isBefore(start1);
    }

    private static List<String> computeOverlapNames(Absence absence, List<Absence> candidatePool) {
        Personnel personnel = absence.getPersonnel();
        if (isRejected(absence) || personnel == null || personnel.getDepartment() == null || personnel.getDepartment().isBlank()) {
            return List.of();
        }
        LocalDate[] range = effectiveRange(absence);
        if (range[0] == null || range[1] == null) {
            return List.of();
        }

        List<String> names = new ArrayList<>();
        for (Absence other : candidatePool) {
            if (other.getIdAbsence() != null && other.getIdAbsence().equals(absence.getIdAbsence())) {
                continue;
            }
            if (isRejected(other)) {
                continue;
            }
            Personnel otherPersonnel = other.getPersonnel();
            if (otherPersonnel == null || otherPersonnel.getIdPersonnel() == null
                    || otherPersonnel.getIdPersonnel().equals(personnel.getIdPersonnel())) {
                continue;
            }
            if (otherPersonnel.getDepartment() == null || !personnel.getDepartment().equalsIgnoreCase(otherPersonnel.getDepartment())) {
                continue;
            }
            LocalDate[] otherRange = effectiveRange(other);
            if (!rangesOverlap(range[0], range[1], otherRange[0], otherRange[1])) {
                continue;
            }
            if (otherPersonnel.getUser() != null) {
                String name = (otherPersonnel.getUser().getFirstname() + " " + otherPersonnel.getUser().getLastname()).trim();
                if (!name.isEmpty() && !names.contains(name)) {
                    names.add(name);
                }
            }
        }
        return names;
    }
}

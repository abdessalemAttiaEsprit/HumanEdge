package tn.esprit.backend.services;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import tn.esprit.backend.entities.Absence;
import tn.esprit.backend.entities.Personnel;
import tn.esprit.backend.exceptions.ResourceNotFoundException;
import tn.esprit.backend.repositories.AbsenceRepo;
import tn.esprit.backend.repositories.PersonnelRepo;
import tn.esprit.backend.security.OwnershipGuard;

import java.time.LocalDate;
import java.util.List;

@Service
@RequiredArgsConstructor
public class AbsenceService {

    private final AbsenceRepo absenceRepository;
    private final PersonnelRepo personnelRepository;
    private final OwnershipGuard ownershipGuard;
    private final AbsenceQuotaCalculator absenceQuotaCalculator;
    private final FileStorageService fileStorageService;

    /**
     * Récupère toutes les absences enregistrées.
     */
    @Transactional(readOnly = true)
    public List<Absence> getAllAbsences() {
        if (ownershipGuard.isAdmin()) {
            return absenceRepository.findAll();
        }
        return absenceRepository.findByPersonnel_User_Company_IdCompany(ownershipGuard.currentCompanyId());
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
     * Enregistre une nouvelle absence.
     */
    @Transactional
    public Absence createAbsence(Absence absence) {
        // Optionnel : Vous pouvez ajouter une validation ici (ex: startDate avant endDate)
        checkTargetPersonnelAccess(absence.getPersonnel());
        return absenceRepository.save(absence);
    }

    /**
     * Met à jour une absence existante.
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
            checkTargetPersonnelAccess(absenceDetails.getPersonnel());
            existingAbsence.setPersonnel(absenceDetails.getPersonnel());
        }

        return absenceRepository.save(existingAbsence);
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
     * Ne fait jamais confiance au Personnel imbriqué envoyé par le client :
     * on recharge l'entité réelle depuis la base pour vérifier à qui elle appartient.
     */
    private void checkTargetPersonnelAccess(Personnel requestedPersonnel) {
        if (ownershipGuard.isAdmin()) {
            return;
        }
        if (requestedPersonnel == null || requestedPersonnel.getIdPersonnel() == null) {
            throw new AccessDeniedException("An associated personnel record is required");
        }
        Personnel realPersonnel = personnelRepository.findById(requestedPersonnel.getIdPersonnel())
                .orElseThrow(() -> new ResourceNotFoundException("Personnel not found"));
        ownershipGuard.checkPersonnelAccess(realPersonnel);
    }
}

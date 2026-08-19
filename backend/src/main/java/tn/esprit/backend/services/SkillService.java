package tn.esprit.backend.services;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import tn.esprit.backend.catalog.SkillCatalog;
import tn.esprit.backend.dto.SkillCreateRequest;
import tn.esprit.backend.dto.SkillSuggestions;
import tn.esprit.backend.entities.Enum.SkillStatus;
import tn.esprit.backend.entities.Personnel;
import tn.esprit.backend.entities.Skill;
import tn.esprit.backend.exceptions.BadRequestException;
import tn.esprit.backend.exceptions.ResourceNotFoundException;
import tn.esprit.backend.repositories.PersonnelRepo;
import tn.esprit.backend.repositories.SkillRepo;
import tn.esprit.backend.security.OwnershipGuard;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Compétences déclarées par un employé (statut PENDING, à valider) ou ajoutées directement par
 * une COMPANY (auto-APPROVED) - même séparation que AbsenceService entre createAbsence
 * (self-service) et approveAbsence/rejectAbsence.
 */
@Service
@RequiredArgsConstructor
public class SkillService {

    private final SkillRepo skillRepository;
    private final PersonnelRepo personnelRepository;
    private final OwnershipGuard ownershipGuard;

    @Transactional(readOnly = true)
    public SkillSuggestions getSuggestions(Long personnelId) {
        Personnel personnel = resolvePersonnel(personnelId);
        return SkillCatalog.suggest(personnel.getDepartment(),
                personnel.getContract() != null ? personnel.getContract().getWork() : null);
    }

    @Transactional
    public Skill createMySkill(SkillCreateRequest request) {
        Personnel me = myPersonnel();
        return saveSkill(me, request, SkillStatus.PENDING, false);
    }

    @Transactional
    public Skill companyAddSkill(Long personnelId, SkillCreateRequest request) {
        Personnel personnel = personnelRepository.findById(personnelId)
                .orElseThrow(() -> new ResourceNotFoundException("Personnel not found"));
        ownershipGuard.checkPersonnelAccess(personnel);
        return saveSkill(personnel, request, SkillStatus.APPROVED, true);
    }

    @Transactional(readOnly = true)
    public List<Skill> getMySkills() {
        Personnel me = myPersonnel();
        return skillRepository.findByPersonnel_IdPersonnelOrderByCreatedAtDesc(me.getIdPersonnel());
    }

    @Transactional(readOnly = true)
    public List<Skill> getForPersonnel(Long personnelId) {
        Personnel personnel = resolvePersonnel(personnelId);
        return skillRepository.findByPersonnel_IdPersonnelOrderByCreatedAtDesc(personnel.getIdPersonnel());
    }

    @Transactional
    public Skill updateStatus(Long id, SkillStatus status) {
        if (status == SkillStatus.PENDING) {
            throw new BadRequestException("Status must be APPROVED or REJECTED");
        }
        Skill skill = getSkillById(id);
        if (skill.getStatus() != SkillStatus.PENDING) {
            throw new BadRequestException("Only a pending skill can be approved or rejected");
        }
        skill.setStatus(status);
        return skillRepository.save(skill);
    }

    @Transactional
    public void deleteSkill(Long id) {
        Skill skill = getSkillById(id);
        skillRepository.delete(skill);
    }

    private Skill getSkillById(Long id) {
        Skill skill = skillRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Skill not found with id: " + id));
        ownershipGuard.checkPersonnelAccess(skill.getPersonnel());
        return skill;
    }

    private Skill saveSkill(Personnel personnel, SkillCreateRequest request, SkillStatus status, boolean addedByCompany) {
        Skill skill = Skill.builder()
                .label(request.getLabel())
                .category(request.getCategory())
                .status(status)
                .addedByCompany(addedByCompany)
                .personnel(personnel)
                .createdAt(LocalDateTime.now())
                .build();
        return skillRepository.save(skill);
    }

    /** Résout la fiche personnel ciblée : soi-même pour un EMPLOYE, param vérifié pour COMPANY/ADMIN. */
    private Personnel resolvePersonnel(Long personnelId) {
        if (personnelId == null) {
            return myPersonnel();
        }
        Personnel personnel = personnelRepository.findById(personnelId)
                .orElseThrow(() -> new ResourceNotFoundException("Personnel not found"));
        ownershipGuard.checkPersonnelAccess(personnel);
        return personnel;
    }

    private Personnel myPersonnel() {
        Long userId = ownershipGuard.currentUser().getIdUser();
        return personnelRepository.findByUser_IdUser(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Personnel record not found"));
    }
}

package tn.esprit.backend.entities.Enum;

/**
 * Cycle de vie d'une compétence rattachée à un employé. PENDING est réservé aux compétences que
 * l'employé déclare lui-même (voir SkillService#createMySkill) : une compétence ajoutée
 * directement par une COMPANY est immédiatement APPROVED, même principe que AbsenceStatus.
 */
public enum SkillStatus {
    PENDING,
    APPROVED,
    REJECTED
}

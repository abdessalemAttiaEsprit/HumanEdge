package tn.esprit.backend.entities.Enum;

/**
 * Cycle de vie d'une demande d'absence. PENDING est réservé aux demandes que l'employé
 * soumet lui-même (voir AbsenceService#createAbsence) : une absence créée par un
 * COMPANY/ADMIN (saisie manuelle, pointage via AttendancePage) est immédiatement APPROVED,
 * exactement comme avant l'introduction de ce statut.
 */
public enum AbsenceStatus {
    PENDING,
    APPROVED,
    REJECTED
}

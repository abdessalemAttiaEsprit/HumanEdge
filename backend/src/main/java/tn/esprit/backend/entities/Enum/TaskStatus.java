package tn.esprit.backend.entities.Enum;

/**
 * Cycle de vie d'une tâche assignée à un employé. TODO à la création (jamais accepté depuis le
 * client, voir TaskService#createTask) ; IN_PROGRESS/DONE ne sont mis à jour que par
 * TaskService#updateStatus, jamais par la mise à jour générale des détails de la tâche.
 */
public enum TaskStatus {
    TODO,
    IN_PROGRESS,
    DONE
}

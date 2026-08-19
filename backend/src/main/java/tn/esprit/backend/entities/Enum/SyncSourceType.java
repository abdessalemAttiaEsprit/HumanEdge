package tn.esprit.backend.entities.Enum;

/**
 * Type de l'enregistrement source d'un événement synchronisé vers Google Calendar (voir
 * GoogleCalendarEventLink) — permet de retrouver/mettre à jour/supprimer l'événement Google
 * correspondant quand l'absence/tâche/entretien/paiement change côté application.
 */
public enum SyncSourceType {
    ABSENCE,
    TASK,
    INTERVIEW,
    PAYMENT
}

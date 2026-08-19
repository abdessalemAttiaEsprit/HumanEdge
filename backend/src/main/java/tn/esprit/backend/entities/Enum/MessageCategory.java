package tn.esprit.backend.entities.Enum;

/**
 * Catégorie d'un message initié par un EMPLOYE (voir MessageService#sendMessageToCompany) —
 * aide l'entreprise à trier/filtrer sa boîte de réception (ReceivedMessagesPage.tsx). Jamais
 * renseignée sur une réponse de l'entreprise (voir MessageService#replyToEmployee).
 */
public enum MessageCategory {
    DOCUMENT_REQUEST,
    WORK_ORGANIZATION,
    CAREER_DEVELOPMENT,
    OTHER
}

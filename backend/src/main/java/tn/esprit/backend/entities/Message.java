package tn.esprit.backend.entities;

import jakarta.persistence.*;
import lombok.*;
import tn.esprit.backend.entities.Enum.MessageCategory;

import java.time.LocalDateTime;

/**
 * Message échangé entre un EMPLOYE et son entreprise (espace de messagerie du dashboard
 * employé + boîte de réception côté entreprise, voir MessageController). Un message initié par
 * l'employé n'a pas de destinataire précis ({@code recipient == null}, notifie tous les comptes
 * COMPANY de l'entreprise) ; une réponse de l'entreprise cible toujours un employé précis
 * (voir MessageService#replyToEmployee). `sender`/`recipient` sont sérialisés (pas de
 * LazyInitializationException : User.company est @ManyToOne donc EAGER par défaut).
 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "messages")
public class Message {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(nullable = false)
    private User sender;

    // Null pour un message initié par l'employé (diffusé à toute l'entreprise, voir
    // sendMessageToCompany) ; renseigné pour une réponse de l'entreprise à un employé précis.
    @ManyToOne
    @JoinColumn(name = "recipient_id")
    private User recipient;

    @Column(nullable = false, length = 1000)
    private String content;

    // Renseignée uniquement sur un message initié par l'employé (jamais sur une réponse
    // d'entreprise) - aide l'entreprise à trier/filtrer sa boîte de réception.
    @Enumerated(EnumType.STRING)
    private MessageCategory category;

    // Nom de fichier stocké (voir FileStorageService), jamais l'URL/chemin brut - null si aucune
    // pièce jointe. Téléchargeable via GET /api/messages/{id}/attachment (jamais via /uploads/**
    // directement : un PDF/Word y est explicitement bloqué, voir SecurityConfig).
    private String attachment;

    @Column(nullable = false)
    private LocalDateTime createdAt;
}

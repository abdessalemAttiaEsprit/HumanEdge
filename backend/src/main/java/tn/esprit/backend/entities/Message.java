package tn.esprit.backend.entities;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * Message envoyé par un EMPLOYE à son entreprise (espace de messagerie du dashboard employé).
 * Déclenche une notification à la création (voir NotificationService#notify), et reste
 * consultable en détail par l'entreprise via GET /api/messages/received (MessageController) -
 * donc `sender` doit être sérialisé ici (pas de LazyInitializationException : User.company est
 * @ManyToOne donc EAGER par défaut).
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

    @Column(nullable = false, length = 1000)
    private String content;

    @Column(nullable = false)
    private LocalDateTime createdAt;
}

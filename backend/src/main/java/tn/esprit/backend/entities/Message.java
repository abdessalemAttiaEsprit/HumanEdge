package tn.esprit.backend.entities;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * Message envoyé par un EMPLOYE à son entreprise (espace de messagerie du dashboard employé).
 * Toujours consulté "de soi vers l'entreprise" côté frontend (endpoints scopés à l'expéditeur
 * courant) - jamais de fil de discussion bidirectionnel : côté entreprise, le message n'est
 * consultable que via la notification qu'il déclenche (voir NotificationService#notify).
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

    // JsonIgnore : toujours "moi" côté frontend (endpoint scopé à l'expéditeur courant), et
    // éviter une LazyInitializationException sur company si sérialisé (même raison que
    // Notification.recipient).
    @JsonIgnore
    @ManyToOne
    @JoinColumn(nullable = false)
    private User sender;

    @Column(nullable = false, length = 1000)
    private String content;

    @Column(nullable = false)
    private LocalDateTime createdAt;
}

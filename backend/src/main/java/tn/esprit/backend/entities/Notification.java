package tn.esprit.backend.entities;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * Notification in-app affichée dans la cloche du header. Canal complémentaire aux emails
 * transactionnels existants (OTP, reset password, entretien planifié) - ne les remplace pas,
 * sert surtout à avoir un historique consultable dans l'appli sans devoir rouvrir sa boîte mail.
 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "notifications")
public class Notification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Jamais sérialisé : une notification est toujours "la mienne" côté frontend (endpoints
    // scopés à l'utilisateur courant), et exposer le destinataire risquerait en plus une
    // LazyInitializationException sur ses relations chargées paresseusement (company...).
    @JsonIgnore
    @ManyToOne
    @JoinColumn(nullable = false)
    private User recipient;

    @Column(nullable = false, length = 500)
    private String message;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    @Builder.Default
    private boolean read = false;
}

package tn.esprit.backend.entities;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * Connexion Google Calendar d'un utilisateur (ADMIN/COMPANY/EMPLOYE, un compte au plus par
 * utilisateur). Le token n'est jamais sérialisé (@JsonIgnore) - seul GoogleOAuthController#status
 * expose un simple booléen "connecté". Pas de chiffrement au repos (budget étudiant, voir
 * docs/deployment) : accepté comme limitation connue plutôt qu'ajouter une gestion de clé de
 * chiffrement dédiée pour ce projet.
 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "google_calendar_accounts")
public class GoogleCalendarAccount {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @JsonIgnore
    @OneToOne
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private User user;

    @JsonIgnore
    @Column(length = 2048, nullable = false)
    private String accessToken;

    @JsonIgnore
    @Column(length = 2048, nullable = false)
    private String refreshToken;

    @JsonIgnore
    @Column(nullable = false)
    private LocalDateTime accessTokenExpiry;

    // Id du calendrier secondaire "HumanEdge" créé au premier événement synchronisé (voir
    // GoogleCalendarSyncService#ensureCalendar) - null tant qu'aucun événement n'a encore été créé.
    private String calendarId;

    @Column(nullable = false)
    private LocalDateTime connectedAt;
}

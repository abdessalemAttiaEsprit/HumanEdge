package tn.esprit.backend.entities;

import jakarta.persistence.*;
import lombok.*;
import tn.esprit.backend.entities.Enum.SyncSourceType;

/**
 * Associe un enregistrement source (absence/tâche/entretien/paiement) à l'événement Google
 * Calendar correspondant, sur le calendrier "HumanEdge" d'UN utilisateur précis. Un même
 * enregistrement source peut avoir plusieurs liens (ex: une absence apparaît à la fois sur le
 * calendrier de l'employé et sur celui de chaque compte COMPANY de son entreprise) - d'où la
 * contrainte d'unicité sur le triplet (sourceType, sourceId, user) plutôt qu'un simple champ
 * googleEventId directement sur Absence/Task/Interview/Payment.
 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "google_calendar_event_links",
        uniqueConstraints = @UniqueConstraint(columnNames = {"source_type", "source_id", "user_id"}))
public class GoogleCalendarEventLink {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "source_type", nullable = false)
    private SyncSourceType sourceType;

    @Column(name = "source_id", nullable = false)
    private Long sourceId;

    @ManyToOne
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false)
    private String googleEventId;
}

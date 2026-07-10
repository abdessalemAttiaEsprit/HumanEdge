package tn.esprit.backend.entities;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * Abonnement plateforme d'une entreprise, souscrit et "payé" à l'inscription (voir
 * PaymentSimulatorService — aucune charge réelle n'a lieu tant qu'aucune passerelle de
 * paiement réelle n'est intégrée).
 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "subscriptions")
public class Subscription {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne
    @JoinColumn(name = "company_id", nullable = false, unique = true)
    @JsonIgnore
    private Company company;

    private String plan;
    private Double amount;
    private String currency;
    private String status;

    // Traçabilité de la simulation de paiement (voir PaymentSimulatorService) — jamais de
    // numéro de carte complet stocké, uniquement les 4 derniers chiffres.
    private String cardLast4;
    private String transactionRef;

    private LocalDateTime paidAt;
    private LocalDateTime periodEnd;

    /**
     * Expose uniquement l'id de l'entreprise (jamais l'objet Company, ignoré ci-dessus pour
     * casser le cycle JSON) — nécessaire pour la vue globale ADMIN (voir SubscriptionController)
     * qui doit pouvoir rattacher chaque abonnement à son entreprise sans recharger Company.
     */
    public Long getCompanyId() {
        return company != null ? company.getIdCompany() : null;
    }
}

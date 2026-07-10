package tn.esprit.backend.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;

/**
 * Paiement (simulé — voir PaymentSimulatorService) pour souscrire/renouveler/changer de plan
 * d'abonnement. Le même endpoint sert à la fois le renouvellement (plan identique) et le
 * changement de plan (upgrade/downgrade) : c'est toujours "payer pour ce plan".
 */
@Getter
@Setter
public class SubscriptionPaymentRequest {

    @NotBlank(message = "A subscription plan is required")
    private String plan;

    private String cardHolder;
    private String cardNumber;
    private String cardExpiry;
    private String cardCvv;
}

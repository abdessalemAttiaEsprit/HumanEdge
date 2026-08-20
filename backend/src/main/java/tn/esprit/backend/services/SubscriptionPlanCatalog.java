package tn.esprit.backend.services;

import org.springframework.stereotype.Service;
import tn.esprit.backend.entities.Subscription;
import tn.esprit.backend.exceptions.BadRequestException;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Catalogue fixe des offres d'abonnement plateforme, proposées à l'inscription d'une
 * entreprise (voir AuthService.registerWithFiles / PaymentSimulatorService).
 */
@Service
public class SubscriptionPlanCatalog {

    public record Plan(String code, String label, double monthlyPrice, String description,
                        int maxEmployees, boolean recruitmentEnabled) {}

    private static final Map<String, Plan> PLANS = buildPlans();

    public Plan getOrThrow(String code) {
        if (code == null || code.isBlank()) {
            throw new BadRequestException("A subscription plan is required");
        }
        Plan plan = PLANS.get(code.trim().toUpperCase());
        if (plan == null) {
            throw new BadRequestException("Invalid subscription plan \"" + code + "\". Available plans: "
                    + String.join(", ", PLANS.keySet()));
        }
        return plan;
    }

    public Map<String, Plan> getAll() {
        return PLANS;
    }

    /**
     * Résout le plan réellement applicable pour les vérifications de quota (nombre d'employés,
     * accès au recrutement) : un abonnement absent, annulé, ou dont periodEnd est dépassé
     * retombe sur les limites de STARTER plutôt que de bloquer totalement l'entreprise — même
     * logique de "ne jamais créer d'impasse" que OwnershipGuard.checkCompanyOperational.
     */
    public Plan resolveEffectivePlan(Subscription subscription) {
        boolean active = subscription != null
                && "ACTIVE".equals(subscription.getStatus())
                && (subscription.getPeriodEnd() == null || subscription.getPeriodEnd().isAfter(LocalDateTime.now()));
        return active ? getOrThrow(subscription.getPlan()) : getOrThrow("STARTER");
    }

    private static Map<String, Plan> buildPlans() {
        Map<String, Plan> plans = new LinkedHashMap<>();
        plans.put("STARTER", new Plan("STARTER", "Starter", 49.0,
                "Up to 10 employees — payroll, absences and contracts", 10, false));
        plans.put("PRO", new Plan("PRO", "Pro", 99.0,
                "Up to 50 employees — recruitment tools included", 50, true));
        plans.put("BUSINESS", new Plan("BUSINESS", "Business", 199.0,
                "Unlimited employees — priority support", Integer.MAX_VALUE, true));
        return plans;
    }
}

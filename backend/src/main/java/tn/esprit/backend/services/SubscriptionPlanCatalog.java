package tn.esprit.backend.services;

import org.springframework.stereotype.Service;
import tn.esprit.backend.exceptions.BadRequestException;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Catalogue fixe des offres d'abonnement plateforme, proposées à l'inscription d'une
 * entreprise (voir AuthService.registerWithFiles / PaymentSimulatorService).
 */
@Service
public class SubscriptionPlanCatalog {

    public record Plan(String code, String label, double monthlyPrice, String description) {}

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

    private static Map<String, Plan> buildPlans() {
        Map<String, Plan> plans = new LinkedHashMap<>();
        plans.put("STARTER", new Plan("STARTER", "Starter", 49.0,
                "Up to 10 employees — payroll, absences and contracts"));
        plans.put("PRO", new Plan("PRO", "Pro", 99.0,
                "Up to 50 employees — recruitment tools included"));
        plans.put("BUSINESS", new Plan("BUSINESS", "Business", 199.0,
                "Unlimited employees — priority support"));
        return plans;
    }
}

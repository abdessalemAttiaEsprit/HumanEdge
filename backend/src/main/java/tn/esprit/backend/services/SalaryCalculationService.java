package tn.esprit.backend.services;

import org.springframework.stereotype.Service;

/**
 * Calcul de la paie mensuelle à partir d'un contrat : cotisation CNSS (taux salarié fixe,
 * 9,18%, comme déjà affiché sur la fiche de paie dans PdfService) puis IRPP selon le barème
 * progressif tunisien (loi de finances 2023) appliqué au revenu annualisé, avec l'abattement
 * forfaitaire de 10% (plafonné à 2000 TND/an) pour frais professionnels. Ne tient pas compte
 * des déductions pour situation familiale/enfants à charge ni de la CSS à 1% : comme pour le
 * taux CNSS, le résultat reste un DRAFT éditable manuellement si un ajustement est nécessaire.
 */
@Service
public class SalaryCalculationService {

    public static final double CNSS_RATE = 0.0918;

    private static final int WORKING_DAYS_PER_MONTH = 22;
    private static final double PROFESSIONAL_ALLOWANCE_RATE = 0.10;
    private static final double PROFESSIONAL_ALLOWANCE_ANNUAL_CAP = 2000.0;

    // Bornes annuelles (TND) et taux marginal de chaque tranche du barème IRPP.
    private static final double[] BRACKET_CEILINGS = {5000, 20000, 30000, 50000};
    private static final double[] BRACKET_RATES = {0.0, 0.26, 0.28, 0.32, 0.35};

    public record SalaryBreakdown(double gross, double unjustifiedDeduction, double montantCnss,
                                   double montantIrpp, double net) {}

    /**
     * @param salaireBase salaire de base du contrat (grille salariale)
     * @param avantages avantages en nature/numéraire du contrat
     * @param unjustifiedDays jours d'absence non justifiée sur le mois concerné
     */
    public SalaryBreakdown compute(double salaireBase, double avantages, double unjustifiedDays) {
        // Même assiette que PdfService/le formulaire manuel : salaireBase + avantages
        // (SalaireComplementaire n'est ni cotisable ni affiché sur la fiche de paie actuelle).
        double gross = salaireBase + avantages;
        double dailyRate = salaireBase / WORKING_DAYS_PER_MONTH;
        double deduction = round3(dailyRate * unjustifiedDays);
        double montantCnss = round3(gross * CNSS_RATE);

        double monthlyTaxableBeforeAllowance = Math.max(0, gross - montantCnss - deduction);
        double annualBeforeAllowance = monthlyTaxableBeforeAllowance * 12;
        double allowance = Math.min(annualBeforeAllowance * PROFESSIONAL_ALLOWANCE_RATE, PROFESSIONAL_ALLOWANCE_ANNUAL_CAP);
        double annualTaxable = Math.max(0, annualBeforeAllowance - allowance);
        double montantIrpp = round3(annualBareme(annualTaxable) / 12.0);

        double net = round3(gross - deduction - montantCnss - montantIrpp);
        return new SalaryBreakdown(gross, deduction, montantCnss, montantIrpp, net);
    }

    private double annualBareme(double annualTaxable) {
        double tax = 0;
        double previousCeiling = 0;
        for (int i = 0; i < BRACKET_CEILINGS.length; i++) {
            double ceiling = BRACKET_CEILINGS[i];
            if (annualTaxable <= ceiling) {
                return tax + (annualTaxable - previousCeiling) * BRACKET_RATES[i];
            }
            tax += (ceiling - previousCeiling) * BRACKET_RATES[i];
            previousCeiling = ceiling;
        }
        return tax + (annualTaxable - previousCeiling) * BRACKET_RATES[BRACKET_RATES.length - 1];
    }

    private static double round3(double value) {
        return Math.round(value * 1000) / 1000.0;
    }
}

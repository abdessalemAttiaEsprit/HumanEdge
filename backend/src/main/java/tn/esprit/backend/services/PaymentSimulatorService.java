package tn.esprit.backend.services;

import org.springframework.stereotype.Service;
import tn.esprit.backend.exceptions.BadRequestException;

import java.time.YearMonth;
import java.util.UUID;

/**
 * Simulateur de passerelle de paiement, utilisé tant que ce projet n'a pas d'intégration
 * bancaire réelle (voir la demande utilisateur : pas de données bancaires réelles disponibles).
 * Reproduit le comportement d'un vrai mode test (Stripe, etc.) : tout numéro de carte bien
 * formé et valide au sens de Luhn est "débité" avec succès (ex. carte de test classique
 * 4242 4242 4242 4242), à l'exception de deux numéros réservés qui simulent un refus — utile
 * pour exercer le chemin d'échec sans vrai prestataire de paiement. Aucun mouvement d'argent
 * réel n'a jamais lieu ; aucun numéro de carte complet n'est conservé (voir Subscription).
 */
@Service
public class PaymentSimulatorService {

    private static final String DECLINED_SUFFIX = "0002";
    private static final String INSUFFICIENT_FUNDS_SUFFIX = "9995";

    public record SimulatedCharge(String transactionRef, String cardLast4) {}

    public SimulatedCharge charge(String cardHolder, String cardNumber, String expiry, String cvv, double amount) {
        if (cardHolder == null || cardHolder.isBlank()) {
            throw new BadRequestException("Cardholder name is required");
        }

        String digits = cardNumber == null ? "" : cardNumber.replaceAll("[\\s-]", "");
        if (digits.length() < 12 || digits.length() > 19 || !digits.chars().allMatch(Character::isDigit)) {
            throw new BadRequestException("Invalid card number");
        }
        if (!passesLuhn(digits)) {
            throw new BadRequestException("Invalid card number (failed checksum)");
        }
        if (cvv == null || !cvv.matches("\\d{3,4}")) {
            throw new BadRequestException("Invalid CVV");
        }
        if (parseExpiry(expiry).isBefore(YearMonth.now())) {
            throw new BadRequestException("This card has expired");
        }

        String last4 = digits.substring(digits.length() - 4);
        if (last4.equals(DECLINED_SUFFIX)) {
            throw new BadRequestException(
                    "Payment declined by the test card ending in " + DECLINED_SUFFIX + ". Try a different card number.");
        }
        if (last4.equals(INSUFFICIENT_FUNDS_SUFFIX)) {
            throw new BadRequestException(
                    "Insufficient funds on the test card ending in " + INSUFFICIENT_FUNDS_SUFFIX + ". Try a different card number.");
        }

        return new SimulatedCharge("SIM-" + UUID.randomUUID().toString().substring(0, 12).toUpperCase(), last4);
    }

    private YearMonth parseExpiry(String expiry) {
        if (expiry == null || !expiry.matches("(0[1-9]|1[0-2])/\\d{2}")) {
            throw new BadRequestException("Expiry date must be in MM/YY format");
        }
        String[] parts = expiry.split("/");
        int month = Integer.parseInt(parts[0]);
        int year = 2000 + Integer.parseInt(parts[1]);
        return YearMonth.of(year, month);
    }

    private boolean passesLuhn(String digits) {
        int sum = 0;
        boolean alternate = false;
        for (int i = digits.length() - 1; i >= 0; i--) {
            int n = digits.charAt(i) - '0';
            if (alternate) {
                n *= 2;
                if (n > 9) n -= 9;
            }
            sum += n;
            alternate = !alternate;
        }
        return sum % 10 == 0;
    }
}

package tn.esprit.backend.services;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import tn.esprit.backend.entities.Payment;
import tn.esprit.backend.entities.Personnel;

import java.time.Month;

@Service
@RequiredArgsConstructor
@Slf4j
public class PaymentEmailNotificationService {

    private final JavaMailSender mailSender;

    @Value("${notifications.mail.enabled:true}")
    private boolean mailEnabled;

    @Value("${spring.mail.username:}")
    private String fromAddress;

    @Value("${spring.mail.host:}")
    private String mailHost;

    public void notifyPaymentValidated(Personnel personnel, Payment payment) {
        if (!mailEnabled) {
            return;
        }
        if (personnel == null || payment == null) {
            return;
        }
        if (mailHost == null || mailHost.isBlank()) {
            log.warn("Mail not configured (spring.mail.host missing). Skipping payment validation email.");
            return;
        }

        String to = personnel.getUser() != null ? personnel.getUser().getEmail() : null;
        if (to == null || to.isBlank()) {
            log.warn("Personnel email missing for matricule {}. Skipping payment validation email.", personnel.getMatricule());
            return;
        }

        String fullName = "";
        if (personnel.getUser() != null) {
            fullName = (personnel.getUser().getFirstname() != null ? personnel.getUser().getFirstname() : "")
                    + (personnel.getUser().getLastname() != null ? (" " + personnel.getUser().getLastname()) : "");
            fullName = fullName.trim();
        }
        if (fullName.isBlank()) {
            fullName = personnel.getMatricule();
        }

        Month month = payment.getMonth();
        String periodLabel = (month != null ? month.toString() : "") + " " + payment.getYear();

        String subject = "Payment validated - " + periodLabel;
        String net = payment.getPayed() != null ? String.format("%.3f", payment.getPayed()) : "0";
        String companyName = resolveCompanyName(personnel, payment);

        String body = "Hello " + fullName + ",\n\n"
                + "Your payment for the period " + periodLabel + " has been successfully validated.\n"
                + "Net salary: " + net + " TND\n\n"
                + "You can contact your HR manager for your pay slip.\n\n"
                + "Best regards,\n"
                + companyName;

        try {
            SimpleMailMessage message = new SimpleMailMessage();
            if (fromAddress != null && !fromAddress.isBlank()) {
                message.setFrom(fromAddress);
            }
            message.setTo(to);
            message.setSubject(subject);
            message.setText(body);

            mailSender.send(message);
            log.info("Payment validation email sent to {} for matricule {} ({})", to, personnel.getMatricule(), periodLabel);
        } catch (Exception e) {
            // On ne bloque pas la validation du paiement si l'email échoue.
            log.warn("Failed to send payment validation email to {} (matricule {}). Cause: {}",
                    to, personnel.getMatricule(), e.getMessage());
        }
    }

    private String resolveCompanyName(Personnel personnel, Payment payment) {
        if (payment.getCompany() != null && payment.getCompany().getCompanyName() != null) {
            return payment.getCompany().getCompanyName();
        }
        if (personnel.getUser() != null && personnel.getUser().getCompany() != null
                && personnel.getUser().getCompany().getCompanyName() != null) {
            return personnel.getUser().getCompany().getCompanyName();
        }
        return "The HR team";
    }
}

package tn.esprit.backend.services;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tn.esprit.backend.entities.Enum.Role;
import tn.esprit.backend.entities.LoginOtp;
import tn.esprit.backend.exceptions.BadRequestException;
import tn.esprit.backend.repositories.LoginOtpRepo;

import java.security.SecureRandom;
import java.time.LocalDateTime;

/**
 * Email-based MFA for login (see AuthService.login/verifyOtp). Only COMPANY accounts are
 * gated behind a verification code — see {@link #requiresMfa}. ADMIN is exempt: there is a
 * single trusted operator account per deployment, so the extra email round-trip only adds
 * friction without a meaningful security benefit.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class OtpService {

    private static final long EXPIRY_MINUTES = 5;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final LoginOtpRepo loginOtpRepo;
    private final JavaMailSender mailSender;

    @Value("${notifications.mail.enabled:true}")
    private boolean mailEnabled;

    @Value("${spring.mail.username:}")
    private String fromAddress;

    @Value("${spring.mail.host:}")
    private String mailHost;

    public static boolean requiresMfa(Role role) {
        return role == Role.COMPANY;
    }

    /**
     * Generates a fresh code, stores it (invalidating any previous unconsumed code for
     * this email), and emails it. Unlike other notification emails in this codebase,
     * failure to send here must fail the request: MFA cannot fail open.
     */
    @Transactional
    public void generateAndSendOtp(String email) {
        if (!mailEnabled || mailHost == null || mailHost.isBlank()) {
            log.error("Cannot send OTP: mail is not configured (notifications.mail.enabled / spring.mail.host).");
            throw new BadRequestException("Email verification is currently unavailable. Please contact an administrator.");
        }

        loginOtpRepo.deleteUnconsumedByEmail(email);

        String code = generateCode();
        LoginOtp otp = LoginOtp.builder()
                .email(email)
                .code(code)
                .expiresAt(LocalDateTime.now().plusMinutes(EXPIRY_MINUTES))
                .consumed(false)
                .build();
        loginOtpRepo.save(otp);

        sendEmail(email, code);
    }

    public void verifyOtp(String email, String code) {
        LoginOtp otp = loginOtpRepo.findTopByEmailAndConsumedFalseOrderByIdDesc(email)
                .filter(o -> !o.isConsumed())
                .filter(o -> o.getExpiresAt().isAfter(LocalDateTime.now()))
                .filter(o -> o.getCode().equals(code))
                .orElseThrow(() -> new BadRequestException("Invalid or expired verification code"));

        otp.setConsumed(true);
        loginOtpRepo.save(otp);
    }

    private String generateCode() {
        int n = RANDOM.nextInt(1_000_000);
        return String.format("%06d", n);
    }

    private void sendEmail(String to, String code) {
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            if (fromAddress != null && !fromAddress.isBlank()) {
                message.setFrom(fromAddress);
            }
            message.setTo(to);
            message.setSubject("Your HumanEdge verification code");
            message.setText("Your verification code is: " + code
                    + "\n\nThis code expires in " + EXPIRY_MINUTES + " minutes.\n\n"
                    + "If you did not request this, you can safely ignore this email.");
            mailSender.send(message);
            log.info("OTP email sent to {}", to);
        } catch (Exception e) {
            log.error("Failed to send OTP email to {}. Cause: {}", to, e.getMessage());
            throw new BadRequestException("Unable to send the verification code. Please try again later.");
        }
    }
}

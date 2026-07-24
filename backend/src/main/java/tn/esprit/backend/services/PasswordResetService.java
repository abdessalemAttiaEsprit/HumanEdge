package tn.esprit.backend.services;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tn.esprit.backend.entities.PasswordResetToken;
import tn.esprit.backend.entities.User;
import tn.esprit.backend.exceptions.BadRequestException;
import tn.esprit.backend.repositories.PasswordResetTokenRepo;
import tn.esprit.backend.repositories.UserRepository;
import tn.esprit.backend.security.RateLimiterService;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;

/**
 * Email-a-link password reset, independent of the OTP-based login MFA (OtpService).
 * Token lifecycle mirrors LoginOtp (single-use, superseded on re-request) but carries an
 * opaque URL-safe token instead of a 6-digit code since it's embedded in a link.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PasswordResetService {

    private static final long EXPIRY_MINUTES = 45;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final PasswordResetTokenRepo tokenRepo;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JavaMailSender mailSender;
    private final RateLimiterService rateLimiterService;

    @Value("${notifications.mail.enabled:true}")
    private boolean mailEnabled;

    @Value("${spring.mail.username:}")
    private String fromAddress;

    @Value("${spring.mail.host:}")
    private String mailHost;

    @Value("${app.frontend-base-url}")
    private String frontendBaseUrl;

    /**
     * Always behaves identically whether or not the email is registered, and whether or
     * not the email actually sends: the caller must not be able to distinguish "unknown
     * account" from "known account, mail send failed" from timing/response shape, or this
     * endpoint becomes an account-existence oracle (same reasoning as AuthService#resendOtp).
     */
    @Transactional
    public void forgotPassword(String email) {
        rateLimiterService.checkAllowed("forgot-password:" + email.toLowerCase());

        userRepository.findByEmail(email).ifPresent(user -> {
            tokenRepo.deleteUnconsumedByEmail(email);

            String token = generateToken();
            PasswordResetToken resetToken = PasswordResetToken.builder()
                    .email(email)
                    .token(token)
                    .expiresAt(LocalDateTime.now().plusMinutes(EXPIRY_MINUTES))
                    .consumed(false)
                    .build();
            tokenRepo.save(resetToken);

            sendResetEmail(email, token);
        });

        // Always "recordFailure", never "recordSuccess": there is no success/failure
        // distinction from the caller's point of view (see class doc) - this is pure flood
        // control, so the counter must climb on every call and never reset to 0.
        rateLimiterService.recordFailure("forgot-password:" + email.toLowerCase());
    }

    @Transactional
    public void resetPassword(String token, String newPassword) {
        PasswordResetToken resetToken = tokenRepo.findByTokenAndConsumedFalse(token)
                .filter(t -> t.getExpiresAt().isAfter(LocalDateTime.now()))
                .orElseThrow(() -> new BadRequestException("Invalid or expired reset link"));

        User user = userRepository.findByEmail(resetToken.getEmail())
                .orElseThrow(() -> new BadRequestException("Invalid or expired reset link"));

        user.setPassword(passwordEncoder.encode(newPassword));
        userRepository.save(user);

        resetToken.setConsumed(true);
        tokenRepo.save(resetToken);
        // Any other still-valid link for this email (e.g. an older request) must die with it.
        tokenRepo.deleteUnconsumedByEmail(resetToken.getEmail());
    }

    private String generateToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private void sendResetEmail(String to, String token) {
        if (!mailEnabled || mailHost == null || mailHost.isBlank()) {
            log.error("Cannot send password reset email: mail is not configured (notifications.mail.enabled / spring.mail.host).");
            return;
        }

        String link = frontendBaseUrl + "/reset-password?token=" + token;
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            if (fromAddress != null && !fromAddress.isBlank()) {
                message.setFrom(fromAddress);
            }
            message.setTo(to);
            message.setSubject("Reset your HumanEdge password");
            message.setText("We received a request to reset your password.\n\n"
                    + "Click the link below to choose a new password. It expires in " + EXPIRY_MINUTES + " minutes:\n"
                    + link + "\n\n"
                    + "If you did not request this, you can safely ignore this email.");
            mailSender.send(message);
            log.info("Password reset email sent to {}", to);
        } catch (Exception e) {
            log.error("Failed to send password reset email to {}. Cause: {}", to, e.getMessage());
        }
    }
}

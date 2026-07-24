package tn.esprit.backend.entities;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * Single-use token emailed to reset a forgotten password (see PasswordResetService).
 * Mirrors LoginOtp's lifecycle (short-lived, consumed on use, superseded on re-request)
 * but carries an opaque token instead of a 6-digit code since it's embedded in a link.
 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "password_reset_tokens")
public class PasswordResetToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String email;

    @Column(nullable = false, unique = true)
    private String token;

    @Column(nullable = false)
    private LocalDateTime expiresAt;

    @Column(nullable = false)
    @Builder.Default
    private boolean consumed = false;
}

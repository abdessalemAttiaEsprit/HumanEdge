package tn.esprit.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Response of POST /api/auth/login. Either the login completes immediately
 * (auth populated, mfaRequired = false), or it requires a verification code
 * emailed to the user (mfaRequired = true, auth left null) — see
 * POST /api/auth/verify-otp to complete the flow.
 */
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LoginResponse {
    private boolean mfaRequired;
    private String maskedEmail; // set only when mfaRequired = true
    private AuthResponse auth;  // set only when mfaRequired = false
}

package tn.esprit.backend.controllers;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import tn.esprit.backend.dto.AuthResponse;
import tn.esprit.backend.dto.ForgotPasswordRequest;
import tn.esprit.backend.dto.LoginRequest;
import tn.esprit.backend.dto.LoginResponse;
import tn.esprit.backend.dto.RegisterRequest;
import tn.esprit.backend.dto.ResendOtpRequest;
import tn.esprit.backend.dto.ResetPasswordRequest;
import tn.esprit.backend.dto.VerifyOtpRequest;
import tn.esprit.backend.services.AuthService;
import tn.esprit.backend.services.PasswordResetService;
import tn.esprit.backend.services.SubscriptionPlanCatalog;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final SubscriptionPlanCatalog subscriptionPlanCatalog;
    private final PasswordResetService passwordResetService;

    /** Public catalog of platform subscription plans, shown on the company registration form. */
    @GetMapping("/subscription-plans")
    public ResponseEntity<Map<String, SubscriptionPlanCatalog.Plan>> getSubscriptionPlans() {
        return ResponseEntity.ok(subscriptionPlanCatalog.getAll());
    }

    /**
     * Registration endpoint with plain JSON (no files)
     */
    @PostMapping(value = "/register", consumes = MediaType.APPLICATION_JSON_VALUE)
    public AuthResponse registerJson(@Valid @RequestBody RegisterRequest request) {
        return authService.registerWithFiles(request, null, null, null);
    }

    /**
     * Registration endpoint with files (multipart/form-data)
     */
    @PostMapping(value = "/register", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public AuthResponse registerWithFiles(
            @Valid @RequestPart("data") RegisterRequest request,
            @RequestPart(value = "logo", required = false) MultipartFile logo,
            @RequestPart(value = "signature", required = false) MultipartFile signature,
            @RequestPart(value = "userImage", required = false) MultipartFile userImage
    ) {
        return authService.registerWithFiles(request, logo, signature, userImage);
    }

    /**
     * Validates credentials. For COMPANY/ADMIN accounts this does not return a token
     * directly — it emails a verification code and responds with mfaRequired=true;
     * the client must then call /verify-otp to complete the login.
     */
    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }

    @PostMapping("/verify-otp")
    public AuthResponse verifyOtp(@Valid @RequestBody VerifyOtpRequest request) {
        return authService.verifyOtp(request);
    }

    @PostMapping("/resend-otp")
    public ResponseEntity<Map<String, String>> resendOtp(@Valid @RequestBody ResendOtpRequest request) {
        authService.resendOtp(request);
        return ResponseEntity.ok(Map.of("message", "If this account requires verification, a new code has been sent."));
    }

    /** Always responds the same way regardless of whether the email is registered - see PasswordResetService. */
    @PostMapping("/forgot-password")
    public ResponseEntity<Map<String, String>> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        passwordResetService.forgotPassword(request.getEmail());
        return ResponseEntity.ok(Map.of("message", "If an account exists for this email, a reset link has been sent."));
    }

    @PostMapping("/reset-password")
    public ResponseEntity<Map<String, String>> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        passwordResetService.resetPassword(request.getToken(), request.getNewPassword());
        return ResponseEntity.ok(Map.of("message", "Password updated successfully."));
    }
}

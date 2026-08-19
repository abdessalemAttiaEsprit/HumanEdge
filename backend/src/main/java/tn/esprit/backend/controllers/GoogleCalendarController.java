package tn.esprit.backend.controllers;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import tn.esprit.backend.entities.User;
import tn.esprit.backend.exceptions.ResourceNotFoundException;
import tn.esprit.backend.repositories.GoogleCalendarAccountRepo;
import tn.esprit.backend.repositories.UserRepository;
import tn.esprit.backend.security.GoogleOAuthStateService;
import tn.esprit.backend.security.OwnershipGuard;
import tn.esprit.backend.services.GoogleOAuthService;

import java.net.URI;
import java.util.Map;

/**
 * Connexion Google Calendar (ADMIN/COMPANY/EMPLOYE, un compte Google au plus par utilisateur).
 * Le flux d'autorisation traverse le navigateur (redirection Google), donc /oauth/callback est
 * public (voir SecurityConfig) - la sécurité vient du state signé (GoogleOAuthStateService), pas
 * d'un header Authorization qui n'existe plus à ce stade.
 */
@RestController
@RequestMapping("/api/google")
@RequiredArgsConstructor
@Slf4j
public class GoogleCalendarController {

    private final GoogleOAuthService googleOAuthService;
    private final GoogleOAuthStateService stateService;
    private final GoogleCalendarAccountRepo accountRepo;
    private final UserRepository userRepository;
    private final OwnershipGuard ownershipGuard;

    @Value("${app.frontend-base-url}")
    private String frontendBaseUrl;

    @GetMapping("/oauth/authorize")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'EMPLOYE')")
    public ResponseEntity<Map<String, String>> authorize() {
        User me = ownershipGuard.currentUser();
        String state = stateService.createState(me.getIdUser());
        String url = googleOAuthService.buildAuthorizationUrl(state);
        return ResponseEntity.ok(Map.of("url", url));
    }

    /** Point de retour de Google - jamais appelé par le frontend directement, toujours par une redirection navigateur. */
    @GetMapping("/oauth/callback")
    public ResponseEntity<Void> callback(
            @RequestParam(value = "code", required = false) String code,
            @RequestParam(value = "state", required = false) String state,
            @RequestParam(value = "error", required = false) String error) {
        if (error != null || code == null || state == null) {
            log.warn("Google OAuth callback returned an error or missing params: {}", error);
            return redirectTo(frontendBaseUrl + "/profile?google=error");
        }
        try {
            Long userId = stateService.verifyState(state);
            User user = userRepository.findById(userId)
                    .orElseThrow(() -> new ResourceNotFoundException("User not found"));
            googleOAuthService.connect(user, code);
            return redirectTo(frontendBaseUrl + "/profile?google=connected");
        } catch (Exception e) {
            log.warn("Google OAuth callback failed: {}", e.getMessage());
            return redirectTo(frontendBaseUrl + "/profile?google=error");
        }
    }

    @GetMapping("/status")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'EMPLOYE')")
    public ResponseEntity<Map<String, Object>> status() {
        Long userId = ownershipGuard.currentUser().getIdUser();
        boolean connected = accountRepo.findByUser_IdUser(userId).isPresent();
        return ResponseEntity.ok(Map.of("connected", connected));
    }

    @DeleteMapping("/disconnect")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'EMPLOYE')")
    public ResponseEntity<Void> disconnect() {
        Long userId = ownershipGuard.currentUser().getIdUser();
        googleOAuthService.disconnect(userId);
        return ResponseEntity.noContent().build();
    }

    private ResponseEntity<Void> redirectTo(String location) {
        return ResponseEntity.status(HttpStatus.FOUND).location(URI.create(location)).build();
    }
}

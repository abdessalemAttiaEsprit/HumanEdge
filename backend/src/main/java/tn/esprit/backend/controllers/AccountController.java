package tn.esprit.backend.controllers;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import tn.esprit.backend.dto.ChangePasswordRequest;
import tn.esprit.backend.entities.User;
import tn.esprit.backend.services.AccountService;

/** Self-service "my account" actions — available to any authenticated role. */
@RestController
@RequestMapping("/api/account")
@RequiredArgsConstructor
public class AccountController {

    private final AccountService accountService;

    @PutMapping("/password")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> changePassword(@Valid @RequestBody ChangePasswordRequest request) {
        accountService.changePassword(request);
        return ResponseEntity.noContent().build();
    }

    /** Uploads/replaces the caller's own avatar. Served back publicly under /uploads/{filename}. */
    @PostMapping("/avatar")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<User> uploadAvatar(@RequestParam("file") MultipartFile file) {
        return ResponseEntity.ok(accountService.uploadAvatar(file));
    }
}

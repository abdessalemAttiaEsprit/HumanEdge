package tn.esprit.backend.services;

import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import tn.esprit.backend.dto.ChangePasswordRequest;
import tn.esprit.backend.entities.User;
import tn.esprit.backend.exceptions.BadRequestException;
import tn.esprit.backend.exceptions.ResourceNotFoundException;
import tn.esprit.backend.repositories.UserRepository;
import tn.esprit.backend.security.OwnershipGuard;

/** Self-service account actions available to any authenticated role (change password, avatar). */
@Service
@RequiredArgsConstructor
public class AccountService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final OwnershipGuard ownershipGuard;
    private final FileStorageService fileStorageService;

    @Transactional
    public void changePassword(ChangePasswordRequest request) {
        User user = currentManagedUser();
        if (!passwordEncoder.matches(request.getCurrentPassword(), user.getPassword())) {
            throw new BadRequestException("Current password is incorrect");
        }
        user.setPassword(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);
    }

    @Transactional
    public User uploadAvatar(MultipartFile file) {
        User user = currentManagedUser();
        String filename = fileStorageService.store(file, "user_" + user.getIdUser() + "_avatar", true);
        user.setImg(filename);
        return userRepository.save(user);
    }

    // Re-fetches within the current transaction rather than trusting the OwnershipGuard-provided
    // instance (loaded by the JWT filter in a separate context) — same class of bug fixed in
    // PersonnelService.deletePersonnel: mutating a detached entity and saving it can misbehave.
    private User currentManagedUser() {
        Long userId = ownershipGuard.currentUser().getIdUser();
        return userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
    }
}

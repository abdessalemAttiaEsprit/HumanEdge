package tn.esprit.backend.services;


import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import tn.esprit.backend.entities.Candidate;
import tn.esprit.backend.entities.Enum.Role;
import tn.esprit.backend.entities.User;
import tn.esprit.backend.exceptions.BadRequestException;
import tn.esprit.backend.exceptions.ResourceNotFoundException;
import tn.esprit.backend.repositories.CondidateRepo;
import tn.esprit.backend.repositories.UserRepository;
import tn.esprit.backend.security.OwnershipGuard;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class CandidateServiceImpl  {

    private final CondidateRepo candidateRepository;
    private final UserRepository userRepository;
    private final OwnershipGuard ownershipGuard;

    public Candidate registerCandidate(Candidate candidate) {
        // Un GUEST ne peut créer que son propre profil candidat : on ignore le champ
        // "user" envoyé par le client et on impose le compte de l'appelant.
        if (ownershipGuard.isGuestRole()) {
            candidate.setUser(ownershipGuard.currentUser());
        } else if (candidate.getUser() != null && candidate.getUser().getIdUser() != null) {
            // ADMIN/COMPANY peuvent lier un profil candidat à un compte existant, mais jamais
            // faire confiance à l'entité imbriquée du client sans la recharger : on vérifie que
            // la cible existe bien et est un compte candidat (GUEST), pas un compte ADMIN/
            // COMPANY/EMPLOYE qu'on hijackerait sinon silencieusement.
            User targetUser = userRepository.findById(candidate.getUser().getIdUser())
                    .orElseThrow(() -> new ResourceNotFoundException("User not found"));
            if (targetUser.getRole() != Role.GUEST) {
                throw new BadRequestException("A candidate profile can only be linked to a candidate account");
            }
            candidate.setUser(targetUser);
        } else {
            candidate.setUser(null);
        }
        candidate.setRegistrationDate(LocalDateTime.now());
        return candidateRepository.save(candidate);
    }


    public Candidate updateCandidate(Long id, Candidate candidate) {
        Candidate existing = getCandidateById(id); // vérifie déjà la propriété
        existing.setFirstName(candidate.getFirstName());
        existing.setLastName(candidate.getLastName());
        existing.setEmail(candidate.getEmail());
        existing.setPhoneNumber(candidate.getPhoneNumber());
        existing.setCin(candidate.getCin());
        existing.setDateOfBirth(candidate.getDateOfBirth());
        existing.setYearsOfExperience(candidate.getYearsOfExperience());
        existing.setCvFileId(candidate.getCvFileId());
        return candidateRepository.save(existing);
    }


    public Candidate getCandidateById(Long id) {
        Candidate candidate = candidateRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Candidate not found"));
        ownershipGuard.checkCandidateAccess(candidate);
        return candidate;
    }

    /** Self-service : retrouve le profil candidat du compte GUEST actuellement connecté. */
    public Candidate getMyCandidate() {
        Long userId = ownershipGuard.currentUser().getIdUser();
        return candidateRepository.findByUser_IdUser(userId)
                .orElseThrow(() -> new ResourceNotFoundException("No candidate profile yet"));
    }


    /** Réservé à ADMIN/COMPANY par @PreAuthorize : pas de filtrage par propriétaire nécessaire. */
    public List<Candidate> getAllCandidates() { return candidateRepository.findAll(); }


    public void deleteCandidate(Long id) {
        Candidate candidate = getCandidateById(id); // vérifie déjà la propriété
        candidateRepository.delete(candidate);
    }
}

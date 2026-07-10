package tn.esprit.backend.security;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import tn.esprit.backend.entities.Candidate;
import tn.esprit.backend.entities.Enum.Role;
import tn.esprit.backend.entities.Personnel;
import tn.esprit.backend.entities.User;

/**
 * Vérifie qu'un utilisateur authentifié a le droit d'accéder à une ressource précise
 * (au-delà du simple contrôle par rôle fait par {@code @PreAuthorize}) : une entreprise
 * ne doit voir/modifier que ses propres données, un salarié uniquement les siennes.
 */
@Component
public class OwnershipGuard {

    public User currentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof SecurityUser securityUser)) {
            throw new AccessDeniedException("Unauthenticated user");
        }
        return securityUser.getUser();
    }

    public boolean isAdmin() {
        return currentUser().getRole() == Role.ADMIN;
    }

    public Long currentCompanyId() {
        User me = currentUser();
        return me.getCompany() != null ? me.getCompany().getIdCompany() : null;
    }

    /**
     * ADMIN : accès total. COMPANY : uniquement sa propre entreprise.
     * Tout autre cas : accès refusé.
     */
    public void checkCompanyAccess(Long companyId) {
        User me = currentUser();
        if (me.getRole() == Role.ADMIN) {
            return;
        }
        if (me.getRole() == Role.COMPANY && companyId != null && companyId.equals(currentCompanyId())) {
            return;
        }
        throw new AccessDeniedException("You do not have access to this company");
    }

    /**
     * ADMIN : accès total. COMPANY : uniquement le personnel de sa propre entreprise.
     * EMPLOYE : uniquement sa propre fiche personnel.
     */
    public void checkPersonnelAccess(Personnel personnel) {
        User me = currentUser();
        if (me.getRole() == Role.ADMIN) {
            return;
        }

        User owner = personnel != null ? personnel.getUser() : null;

        if (me.getRole() == Role.COMPANY) {
            Long ownerCompanyId = (owner != null && owner.getCompany() != null) ? owner.getCompany().getIdCompany() : null;
            if (ownerCompanyId != null && ownerCompanyId.equals(currentCompanyId())) {
                return;
            }
        }

        if (me.getRole() == Role.EMPLOYE && owner != null && owner.getIdUser().equals(me.getIdUser())) {
            return;
        }

        throw new AccessDeniedException("You do not have access to this resource");
    }

    /** true si l'utilisateur courant a le rôle COMPANY (utile pour filtrer des listes plutôt que de tout rejeter). */
    public boolean isCompanyRole() {
        return currentUser().getRole() == Role.COMPANY;
    }

    /**
     * ADMIN et COMPANY (recruteurs) : accès total aux profils candidats.
     * GUEST : uniquement son propre profil candidat (lié via Candidate.user).
     */
    public void checkCandidateAccess(Candidate candidate) {
        User me = currentUser();
        if (me.getRole() == Role.ADMIN || me.getRole() == Role.COMPANY) {
            return;
        }
        User owner = candidate != null ? candidate.getUser() : null;
        if (me.getRole() == Role.GUEST && owner != null && owner.getIdUser().equals(me.getIdUser())) {
            return;
        }
        throw new AccessDeniedException("You do not have access to this candidate profile");
    }

    public boolean isGuestRole() {
        return currentUser().getRole() == Role.GUEST;
    }
}

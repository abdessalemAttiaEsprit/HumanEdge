package tn.esprit.backend.security;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import tn.esprit.backend.entities.Candidate;
import tn.esprit.backend.entities.Company;
import tn.esprit.backend.entities.Enum.Role;
import tn.esprit.backend.entities.Personnel;
import tn.esprit.backend.entities.User;
import tn.esprit.backend.repositories.SubscriptionRepo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

/**
 * Couvre la matrice d'autorisation utilisée par tous les services métier (Payment, Personnel,
 * Contract, Candidate...) au-delà du simple @PreAuthorize par rôle : une COMPANY ne doit voir
 * que ses propres données, un EMPLOYE/GUEST uniquement les siennes.
 */
class OwnershipGuardTest {

    // mock() plutôt que MockitoExtension : aucun test ici n'exerce checkCompanyOperational
    // (donc jamais réellement appelé), seul un constructeur valide est nécessaire.
    private final OwnershipGuard guard = new OwnershipGuard(mock(SubscriptionRepo.class));

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    private void authenticateAs(User user) {
        SecurityUser securityUser = new SecurityUser(user);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(securityUser, null, securityUser.getAuthorities()));
    }

    private User userWithRole(Role role, Long userId, Company company) {
        return User.builder().idUser(userId).role(role).company(company).build();
    }

    @Test
    void currentUserThrowsWhenNoOneIsAuthenticated() {
        assertThatThrownBy(guard::currentUser).isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void isAdminReflectsTheAuthenticatedUserRole() {
        authenticateAs(userWithRole(Role.ADMIN, 1L, null));
        assertThat(guard.isAdmin()).isTrue();

        authenticateAs(userWithRole(Role.COMPANY, 2L, null));
        assertThat(guard.isAdmin()).isFalse();
    }

    @Test
    void currentCompanyIdIsNullWhenUserHasNoCompany() {
        authenticateAs(userWithRole(Role.GUEST, 1L, null));
        assertThat(guard.currentCompanyId()).isNull();
    }

    @Test
    void adminHasAccessToAnyCompany() {
        authenticateAs(userWithRole(Role.ADMIN, 1L, null));

        guard.checkCompanyAccess(999L); // ne doit pas lever d'exception
    }

    @Test
    void companyCanOnlyAccessItsOwnCompany() {
        Company myCompany = Company.builder().idCompany(10L).build();
        authenticateAs(userWithRole(Role.COMPANY, 1L, myCompany));

        guard.checkCompanyAccess(10L); // ne doit pas lever d'exception
        assertThatThrownBy(() -> guard.checkCompanyAccess(20L)).isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void employeCanNeverAccessACompanyDirectly() {
        authenticateAs(userWithRole(Role.EMPLOYE, 1L, Company.builder().idCompany(10L).build()));

        assertThatThrownBy(() -> guard.checkCompanyAccess(10L)).isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void adminHasAccessToAnyPersonnel() {
        authenticateAs(userWithRole(Role.ADMIN, 1L, null));

        guard.checkPersonnelAccess(Personnel.builder().build());
    }

    @Test
    void companyCanAccessPersonnelBelongingToItsOwnEmployees() {
        Company myCompany = Company.builder().idCompany(10L).build();
        authenticateAs(userWithRole(Role.COMPANY, 1L, myCompany));

        Personnel ownPersonnel = Personnel.builder()
                .user(User.builder().idUser(5L).company(myCompany).build())
                .build();

        guard.checkPersonnelAccess(ownPersonnel); // ne doit pas lever d'exception
    }

    @Test
    void companyCannotAccessPersonnelFromAnotherCompany() {
        authenticateAs(userWithRole(Role.COMPANY, 1L, Company.builder().idCompany(10L).build()));

        Personnel otherCompanyPersonnel = Personnel.builder()
                .user(User.builder().idUser(5L).company(Company.builder().idCompany(99L).build()).build())
                .build();

        assertThatThrownBy(() -> guard.checkPersonnelAccess(otherCompanyPersonnel))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void employeCanOnlyAccessItsOwnPersonnelRecord() {
        authenticateAs(userWithRole(Role.EMPLOYE, 5L, null));

        Personnel ownPersonnel = Personnel.builder().user(User.builder().idUser(5L).build()).build();
        guard.checkPersonnelAccess(ownPersonnel); // ne doit pas lever d'exception

        Personnel someoneElsePersonnel = Personnel.builder().user(User.builder().idUser(6L).build()).build();
        assertThatThrownBy(() -> guard.checkPersonnelAccess(someoneElsePersonnel))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void guestCanNeverAccessAPersonnelRecord() {
        authenticateAs(userWithRole(Role.GUEST, 1L, null));

        assertThatThrownBy(() -> guard.checkPersonnelAccess(Personnel.builder().build()))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void isCompanyRoleReflectsTheAuthenticatedUserRole() {
        authenticateAs(userWithRole(Role.COMPANY, 1L, null));
        assertThat(guard.isCompanyRole()).isTrue();

        authenticateAs(userWithRole(Role.EMPLOYE, 1L, null));
        assertThat(guard.isCompanyRole()).isFalse();
    }

    @Test
    void isGuestRoleReflectsTheAuthenticatedUserRole() {
        authenticateAs(userWithRole(Role.GUEST, 1L, null));
        assertThat(guard.isGuestRole()).isTrue();

        authenticateAs(userWithRole(Role.EMPLOYE, 1L, null));
        assertThat(guard.isGuestRole()).isFalse();
    }

    @Test
    void adminAndCompanyHaveFullAccessToCandidateProfiles() {
        Candidate candidate = Candidate.builder().user(User.builder().idUser(42L).build()).build();

        authenticateAs(userWithRole(Role.ADMIN, 1L, null));
        guard.checkCandidateAccess(candidate);

        authenticateAs(userWithRole(Role.COMPANY, 2L, null));
        guard.checkCandidateAccess(candidate);
    }

    @Test
    void guestCanOnlyAccessItsOwnCandidateProfile() {
        authenticateAs(userWithRole(Role.GUEST, 42L, null));

        Candidate ownProfile = Candidate.builder().user(User.builder().idUser(42L).build()).build();
        guard.checkCandidateAccess(ownProfile); // ne doit pas lever d'exception

        Candidate someoneElseProfile = Candidate.builder().user(User.builder().idUser(43L).build()).build();
        assertThatThrownBy(() -> guard.checkCandidateAccess(someoneElseProfile))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void employeCanNeverAccessACandidateProfile() {
        authenticateAs(userWithRole(Role.EMPLOYE, 1L, null));

        assertThatThrownBy(() -> guard.checkCandidateAccess(Candidate.builder().build()))
                .isInstanceOf(AccessDeniedException.class);
    }
}

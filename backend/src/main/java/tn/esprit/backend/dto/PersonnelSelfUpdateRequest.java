package tn.esprit.backend.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Self-service update available to an EMPLOYE for their own Personnel record — only the
 * fields an employee would plausibly need to correct themselves (phone, bank account).
 * Administrative identifiers (cin, matricule, cnssNumber) stay company/admin-controlled,
 * see {@link tn.esprit.backend.controllers.PersonnelController#updatePersonnel}.
 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PersonnelSelfUpdateRequest {
    private String telephone;

    @NotBlank(message = "Bank account number (RIB) is required")
    private String rib;
}

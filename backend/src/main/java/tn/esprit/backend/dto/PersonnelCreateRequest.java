package tn.esprit.backend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Creates a brand new EMPLOYE user account together with its Personnel record in one
 * transaction. Needed because {@link tn.esprit.backend.services.PersonnelService#createPersonnel}
 * requires an already-existing User, and there is no other endpoint that lets a COMPANY
 * provision an employee account attached to their own company.
 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PersonnelCreateRequest {

    @NotBlank
    private String firstname;

    @NotBlank
    private String lastname;

    @NotBlank
    @Email
    private String email;

    @NotBlank
    private String password;

    private String telephone;

    @NotBlank
    private String cin;

    @NotBlank
    private String cnssNumber;

    @NotBlank
    private String rib;

    /** Required for ADMIN callers only; COMPANY callers are always attached to their own company. */
    private Long companyId;
}

package tn.esprit.backend.entities;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.*;
import tn.esprit.backend.entities.Enum.Role;

@Getter
@Setter
@Builder // Changed from SuperBuilder since we aren't using inheritance
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long idUser;

    @NotBlank
    private String firstname;

    @NotBlank
    private String lastname;

    @Column(unique = true, nullable = false)
    @Email
    private String email;

    @NotBlank
    @JsonIgnore
    private String password;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role;

    @Builder.Default
    private boolean enabled = true;

    private String img;

    // Many-to-one: a company has one COMPANY-role owner account plus any number of
    // EMPLOYE-role accounts, all sharing the same company_id. Null for GUEST users.
    @ManyToOne
    @JoinColumn(name = "company_id", referencedColumnName = "idCompany")
    private Company company;
}
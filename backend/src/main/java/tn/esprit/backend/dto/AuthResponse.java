package tn.esprit.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import tn.esprit.backend.entities.Enum.Role;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AuthResponse {

    private String token;
    private Long idUser;
    private String firstname;
    private String lastname;
    private String email;
    private Role role;
    private Long companyId;  // null for non-company users
    private String img;// URL or filename of user avatar
}
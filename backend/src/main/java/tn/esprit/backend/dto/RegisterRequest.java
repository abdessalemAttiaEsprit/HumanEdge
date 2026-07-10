package tn.esprit.backend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;
import tn.esprit.backend.entities.Enum.Role;

@Getter
@Setter
public class RegisterRequest {

    @NotBlank(message = "First name is required")
    private String firstname;

    @NotBlank(message = "Last name is required")
    private String lastname;

    @NotBlank(message = "Email is required")
    @Email(message = "Invalid email format")
    private String email;

    @NotBlank(message = "Password is required")
    private String password;

    @NotNull(message = "Role is required")
    private Role role;

    private String companyName;
    private String fiscalNumber;
    private String cnssNumber;
    private String rib;

    // Optional company fields
    private String phone;
    private String address;
    private String city;
    private String state;
    private String country;
    private String postalCode;

    // Abonnement plateforme + paiement simulé (COMPANY uniquement — voir
    // SubscriptionPlanCatalog / PaymentSimulatorService). Aucune vraie charge n'a lieu.
    private String subscriptionPlan;
    private String cardHolder;
    private String cardNumber;
    private String cardExpiry;
    private String cardCvv;

    // User profile image
    private String img;
}

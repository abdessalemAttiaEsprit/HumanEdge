package tn.esprit.backend.entities;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import lombok.*;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "companies")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder // Changed from SuperBuilder
public class Company {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long idCompany;

    @NotBlank
    @Column(nullable = false)
    private String companyName;

    private String phone;
    private String address;
    private String city;
    private String state;
    private String country;
    private String postalCode;
    private String logoUrl;

    @Column(unique = true, nullable = false)
    private String fiscalNumber;

    @Column(unique = true, nullable = false)
    private String cnssNumber;

    private String signatureFileName;

    @Column(unique = true, nullable = false)
    private String rib;

    @Builder.Default
    @Column(nullable = false)
    private Boolean verified = false;

    @Builder.Default
    @Column(nullable = false)
    private Boolean active = true;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    @PrePersist
    public void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    public void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    // Bidirectional mapping back to User (the COMPANY owner account plus any EMPLOYE
    // accounts) — @JsonIgnore breaks the circular reference.
    @JsonIgnore
    @OneToMany(mappedBy = "company")
    @Builder.Default
    private List<User> users = new ArrayList<>();
}
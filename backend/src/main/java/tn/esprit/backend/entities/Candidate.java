package tn.esprit.backend.entities;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "candidates")
public class Candidate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String firstName;
    private String lastName;
    private String email;
    private String phoneNumber;
    private String cin;
    private LocalDate dateOfBirth;
    private Integer yearsOfExperience;
    private String cvFileId;
    private LocalDateTime registrationDate;

    // Compte associé au candidat (rôle GUEST), pour vérifier la propriété de son propre profil.
    // Nullable : les candidats créés manuellement par une entreprise/un admin n'ont pas forcément de compte.
    @OneToOne
    @JoinColumn(name = "user_id")
    private User user;

    // Ignorées en JSON : Application/Interview référencent déjà ce Candidate (ManyToOne),
    // et le rechargent entier -> sans @JsonIgnore ici, ça boucle à l'infini (StackOverflow).
    // Utiliser GET /api/application/candidate/{id} et /api/interview/candidate/{id} à la place.
    @OneToMany(mappedBy = "candidate", cascade = CascadeType.ALL, orphanRemoval = true)
    @JsonIgnore
    private List<Application> applications;

    @OneToMany(mappedBy = "candidate", cascade = CascadeType.ALL, orphanRemoval = true)
    @JsonIgnore
    private List<Interview> interviews;
}
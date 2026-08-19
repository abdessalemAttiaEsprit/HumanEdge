package tn.esprit.backend.entities;

import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.*;
import lombok.*;

import java.util.ArrayList;
import java.util.List;
@Getter
@Setter
@Builder // Changed from SuperBuilder since we aren't using inheritance
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "personnels")
public class Personnel{

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long idPersonnel;

    private String telephone;

    @Column(unique = true, nullable = false)
    private String cin;

    private String matricule;
    @Column(unique = true, nullable = false)
    private String cnssNumber;
    @Column(unique = true, nullable = false)
    private String rib;

    private String image;

    // Libre (pas d'enum) : varie trop d'une entreprise à l'autre pour une liste fermée. Sert de
    // clé au dépistage de chevauchement de congés (voir AbsenceService#attachDepartmentOverlaps).
    private String department;

    @OneToOne
    @JoinColumn(name = "user_id")
    private User user;

    @OneToOne
    @JoinColumn(name = "contract_id") // Optionnel mais recommandé pour nommer la clé étrangère
    @JsonManagedReference // Option A : Personnel affichera le contrat
    private Contract contract;

    // Remplacer votre @ManyToOne par un @OneToMany car un employé a plusieurs absences
    @OneToMany(mappedBy = "personnel", cascade = CascadeType.ALL)
    @JsonManagedReference // Personnel affichera sa liste d'absences
    private List<Absence> absences = new ArrayList<>();

    @OneToMany(mappedBy = "personnel", cascade = CascadeType.ALL)
    @JsonManagedReference // Personnel affichera sa liste de tâches (voir Task.personnel)
    private List<Task> tasks = new ArrayList<>();

    @OneToMany(mappedBy = "personnel", cascade = CascadeType.ALL)
    @JsonManagedReference // Personnel affichera sa liste de compétences (voir Skill.personnel)
    private List<Skill> skills = new ArrayList<>();

    @OneToMany(mappedBy = "personnel", cascade = CascadeType.ALL)
    @JsonManagedReference // Personnel affichera sa liste de diplômes (voir Diploma.personnel)
    private List<Diploma> diplomas = new ArrayList<>();
}


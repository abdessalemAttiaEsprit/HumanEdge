package tn.esprit.backend.entities;

import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.*;
import lombok.*;
import tn.esprit.backend.entities.Enum.SkillCategory;
import tn.esprit.backend.entities.Enum.SkillStatus;

import java.time.LocalDateTime;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "skills")
public class Skill {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long idSkill;

    @Column(nullable = false, length = 100)
    private String label;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private SkillCategory category;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private SkillStatus status = SkillStatus.PENDING;

    // true si ajoutée directement par la COMPANY (alors auto-APPROVED) plutôt qu'auto-déclarée
    // par l'employé (alors PENDING) - voir SkillService#createMySkill / companyAddSkill.
    @Column(nullable = false)
    @Builder.Default
    private boolean addedByCompany = false;

    // Même pattern que Task.personnel : jamais sérialisé en lecture directe (JsonBackReference),
    // l'employé d'une compétence se retrouve via Personnel.skills côté frontend.
    @ManyToOne
    @JoinColumn(name = "personnel_id")
    @JsonBackReference
    private Personnel personnel;

    @Column(nullable = false)
    private LocalDateTime createdAt;
}

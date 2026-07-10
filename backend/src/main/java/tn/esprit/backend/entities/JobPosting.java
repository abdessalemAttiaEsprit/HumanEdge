package tn.esprit.backend.entities;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;
import tn.esprit.backend.entities.Enum.TypeContrat;

import java.time.LocalDateTime;
import java.util.List;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "job_postings")
public class JobPosting {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String title;

    @Column(columnDefinition = "TEXT")
    private String description;

    private String department;

    @ElementCollection
    @CollectionTable(name = "job_required_skills", joinColumns = @JoinColumn(name = "job_posting_id"))
    private List<String> requiredSkills;

    @Enumerated(EnumType.STRING)
    private TypeContrat jobType;

    private LocalDateTime datePosted;
    private LocalDateTime deadline;
    private String status;

    @ManyToOne
    @JoinColumn(name = "company_id")
    private Company createdByCompany;

    // Ignorées en JSON : Application/Interview référencent déjà ce JobPosting (ManyToOne) ->
    // cycle sans ça. Utiliser GET /api/application/job/{id} et /api/interview/job/{id}.
    @OneToMany(mappedBy = "jobPosting", cascade = CascadeType.ALL, orphanRemoval = true)
    @JsonIgnore
    private List<Application> applications;

    @OneToMany(mappedBy = "job", cascade = CascadeType.ALL, orphanRemoval = true)
    @JsonIgnore
    private List<Interview> interviews;
}
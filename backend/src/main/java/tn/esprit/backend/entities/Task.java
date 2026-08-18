package tn.esprit.backend.entities;

import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.*;
import lombok.*;
import tn.esprit.backend.entities.Enum.TaskStatus;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "tasks")
public class Task {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long idTask;

    @Column(nullable = false, length = 150)
    private String title;

    @Column(length = 2000)
    private String description;

    @Column(nullable = false)
    private LocalDate startDate;

    @Column(nullable = false)
    private LocalDate endDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private TaskStatus status = TaskStatus.TODO;

    // Même pattern que Absence.personnel / Contract.personnel : jamais sérialisé en lecture
    // directe (JsonBackReference), l'employé d'une tâche se retrouve via Personnel.tasks côté
    // frontend (voir personnelByTaskId sur TasksPage.tsx).
    @ManyToOne
    @JoinColumn(name = "personnel_id")
    @JsonBackReference
    private Personnel personnel;

    @Column(nullable = false)
    private LocalDateTime createdAt;
}

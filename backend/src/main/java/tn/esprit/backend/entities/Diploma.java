package tn.esprit.backend.entities;

import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "diplomas")
public class Diploma {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long idDiploma;

    @Column(nullable = false, length = 150)
    private String name;

    // Nom de fichier stocké (voir FileStorageService), jamais l'URL/chemin brut. Toujours une
    // image (restrictToImages=true à l'upload) donc affichable directement via /uploads/**.
    @Column(nullable = false)
    private String image;

    @ManyToOne
    @JoinColumn(name = "personnel_id")
    @JsonBackReference
    private Personnel personnel;

    @Column(nullable = false)
    private LocalDateTime createdAt;
}

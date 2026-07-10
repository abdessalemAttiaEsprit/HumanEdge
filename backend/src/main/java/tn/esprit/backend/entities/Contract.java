package tn.esprit.backend.entities;

import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.*;
import lombok.*;
import tn.esprit.backend.entities.Enum.TypeContrat;

import java.time.LocalDate;

@Getter
@Setter
@Builder // Changed from SuperBuilder since we aren't using inheritance
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "Contracts")
public class Contract {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long idContract;
    private  String  Work ;
    @Enumerated(EnumType.STRING)
    private TypeContrat typeContrat;
    private LocalDate dateDebut;
    private LocalDate dateFin;

    /**
     * Catégorie de la grille salariale (A1, A2, A3, B, C, D) — obligatoire pour tout nouveau
     * contrat (voir ContractService). Peut être null uniquement pour des contrats créés avant
     * l'introduction de cette règle ; leur salaire reste alors géré manuellement.
     */
    private String categorie;
    /** Échelon dans la catégorie, avancé automatiquement selon l'ancienneté (voir PaymentSuggestionService). */
    private Integer echelon;

    /** Toujours déduit de categorie/echelon via la grille salariale, jamais saisi à la main. */
    private Double  salaireBase;
    /** Complément de salaire saisi manuellement, en plus de salaireBase. */
    private Double SalaireComplementaire ;
    private Double tauxHoraireSup;
    private Double Avantages;


    @OneToOne(mappedBy = "contract")
    @JsonBackReference // Option A : Le contrat n'affichera pas le personnel pour éviter la boucle
    // OU : @JsonIgnore (Option B)
    private Personnel personnel;
}

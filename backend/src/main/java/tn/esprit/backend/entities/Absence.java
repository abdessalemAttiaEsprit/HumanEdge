package tn.esprit.backend.entities;

import com.fasterxml.jackson.annotation.JsonBackReference;
import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.util.List;

@Getter
@Setter
@Builder // Changed from SuperBuilder since we aren't using inheritance
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "absences")
public class Absence {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long idAbsence;

    private LocalDate dateAbsence;
    private LocalDate startDate;
    private LocalDate endDate ;
    private String Reason ;
    private String justification;
    @ManyToOne
    @JoinColumn(name = "personnel_id")
    @JsonBackReference // L'absence n'affichera pas les détails complets du personnel en boucle
    private Personnel personnel;
    // LAZY (pas de valeur par défaut EAGER) : sans ça, charger la liste "absences" d'un Personnel
    // (ex. pour la cascade REMOVE lors d'une suppression) chargeait aussi en cascade le Payment lié
    // et, via Payment.personnel (EAGER), un second graphe Personnel en pleine transaction de
    // suppression — Hibernate levait alors un TransientObjectException au flush.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "payment_id")
    @JsonBackReference(value = "payment-absences") // Nommer la référence pour ne pas la confondre avec celle du Personnel
    private Payment payment;
}

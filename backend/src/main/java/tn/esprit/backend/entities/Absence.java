package tn.esprit.backend.entities;

import com.fasterxml.jackson.annotation.JsonBackReference;
import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.*;
import lombok.*;
import tn.esprit.backend.entities.Enum.AbsenceStatus;

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

    // Nullable (pas de contrainte NOT NULL) : les lignes déjà en base avant l'introduction de ce
    // statut n'ont pas de valeur ici. AbsenceQuotaCalculator#isApproved traite un statut null
    // comme APPROVED pour rester rétro-compatible avec ces anciennes lignes et avec les absences
    // saisies directement par un COMPANY/ADMIN (jamais PENDING, voir AbsenceService#createAbsence).
    // @Builder.Default (pas un simple '=') : sans ça le builder Lombok ignorerait l'initialiseur.
    @Enumerated(EnumType.STRING)
    @Builder.Default
    private AbsenceStatus status = AbsenceStatus.APPROVED;

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

    // Calculé à la volée par AbsenceService#attachDepartmentOverlaps, jamais persisté : noms des
    // collègues du même département dont le congé chevauche celui-ci (liste vide/absente si
    // aucun chevauchement). @Transient = ignoré par Hibernate, mais Jackson le sérialise quand
    // même normalement (@Transient est une annotation JPA, pas une annotation Jackson).
    @Transient
    private List<String> departmentOverlapNames;
}

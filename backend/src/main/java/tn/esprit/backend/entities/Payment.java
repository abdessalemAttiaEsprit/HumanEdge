package tn.esprit.backend.entities;

import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;
import java.time.Month;
import java.util.List;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "payment")
public class Payment {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id; // Changé en Long pour correspondre à GenerationType.IDENTITY

    private LocalDate paymentDate;

    // "month"/"year" sont des mots réservés H2 (littéraux de date type EXTRACT(MONTH FROM ...))
    // - les noms de colonne par défaut faisaient échouer le CREATE TABLE sous le profil de
    // test H2 (silencieux, Hibernate logue et continue), sans affecter MySQL où ils ne sont
    // pas réservés.
    @Enumerated(EnumType.STRING)
    @Column(name = "pay_month")
    private Month month;

    @Column(name = "pay_year")
    private int year;

    @OneToMany(mappedBy = "payment")
    @JsonManagedReference(value = "payment-absences")
    private List<Absence> absences;

    private Double montantCnss;
    private Double montantIrpp;
    private String status;

    private Double payed;

    @ManyToOne
    private Company company;

    @ManyToOne
    private Personnel personnel;

    @ManyToOne
    private Contract contrat;
}
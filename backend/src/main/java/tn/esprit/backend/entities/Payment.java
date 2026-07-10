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

    @Enumerated(EnumType.STRING)
    private Month month;
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
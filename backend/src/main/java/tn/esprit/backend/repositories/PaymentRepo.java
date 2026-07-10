package tn.esprit.backend.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import tn.esprit.backend.entities.Payment;

import java.time.Month;
import java.util.List;

@Repository
public interface PaymentRepo extends JpaRepository<Payment,Long> {
    List<Payment> findByCompany_IdCompany(Long companyId);

    // Self-service : retrouver les fiches de paie de l'utilisateur connecté (EMPLOYE).
    // Trié par année seulement (le mois est un enum stocké en STRING : un ORDER BY SQL
    // sur cette colonne serait alphabétique, pas chronologique — le tri fin par mois se
    // fait côté frontend).
    List<Payment> findByPersonnel_User_IdUserOrderByYearDesc(Long userId);

    boolean existsByPersonnel_IdPersonnel(Long idPersonnel);

    // Suppression en cascade (voir CompanyService.deleteCompanyCascade) : nettoie aussi les
    // paiements rattachés à un personnel dont le champ "company" serait absent/incohérent —
    // ne jamais se fier uniquement à findByCompany_IdCompany pour ce nettoyage.
    List<Payment> findByPersonnel_IdPersonnel(Long idPersonnel);

    // Génération automatique de la paie : évite de dupliquer un paiement déjà généré pour
    // ce salarié sur ce mois/année (idempotent — voir PaymentService.generateMonthlyPayroll).
    boolean existsByPersonnel_IdPersonnelAndMonthAndYear(Long idPersonnel, Month month, int year);
}

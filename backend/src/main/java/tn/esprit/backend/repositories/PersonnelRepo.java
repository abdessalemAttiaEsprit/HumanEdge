package tn.esprit.backend.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import tn.esprit.backend.entities.Personnel;

import java.util.List;
import java.util.Optional;

@Repository
public interface PersonnelRepo extends JpaRepository<Personnel, Long> {

    // Trouver par CIN unique
    Optional<Personnel> findByCin(String cin);

    // Trouver par RIB unique (vérification d'unicité lors du self-service update)
    Optional<Personnel> findByRib(String rib);

    // Vérification d'unicité lors de la génération automatique du matricule (voir ContractService).
    boolean existsByMatricule(String matricule);

    // Trouver tous les personnels liés à une entreprise via User → Company
    List<Personnel> findByUser_Company_IdCompany(Long companyId);

    // Retrouver la fiche personnel d'un utilisateur connecté (self-service EMPLOYE)
    Optional<Personnel> findByUser_IdUser(Long userId);
}

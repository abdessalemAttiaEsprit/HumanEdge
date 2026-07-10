package tn.esprit.backend.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import tn.esprit.backend.entities.User;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User,Long> {
    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);

    // Garde-fou avant suppression d'une entreprise (voir CompanyService.deleteCompany) : une
    // company a toujours au moins son compte COMPANY propriétaire, et souvent des comptes
    // EMPLOYE — les supprimer en cascade via un simple DELETE laisserait des User orphelins
    // ou ferait échouer la contrainte de clé étrangère avec une erreur 500 non explicite.
    boolean existsByCompany_IdCompany(Long companyId);

    // Suppression en cascade (voir CompanyService.deleteCompanyCascade) : tous les comptes
    // (COMPANY propriétaire + EMPLOYE) rattachés à cette entreprise.
    List<User> findByCompany_IdCompany(Long companyId);

}

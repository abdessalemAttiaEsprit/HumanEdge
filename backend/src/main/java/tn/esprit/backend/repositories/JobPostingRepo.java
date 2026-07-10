package tn.esprit.backend.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import tn.esprit.backend.entities.JobPosting;

import java.util.List;

@Repository
public interface JobPostingRepo extends JpaRepository<JobPosting,Long> {
     List<JobPosting> findByDepartment(String Dep);
     List<JobPosting> findByStatusOrderByDatePostedDesc(String status);

     // Utilisé pour la génération idempotente des données de démo (voir DemoDataSeeder) : ne
     // seede des offres pour une entreprise que si elle n'en a encore aucune.
     List<JobPosting> findByCreatedByCompany_IdCompany(Long companyId);
}

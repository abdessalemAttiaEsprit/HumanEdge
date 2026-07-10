package tn.esprit.backend.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import tn.esprit.backend.entities.Application;

import java.util.List;

@Repository
public interface ApplicationRepo extends JpaRepository<Application,Long> {
    List<Application> findByJobPostingId(Long id);
    List<Application> findByCandidateId(Long id);
    List<Application> findByJobPosting_CreatedByCompany_IdCompany(Long companyId);
}

package tn.esprit.backend.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import tn.esprit.backend.entities.Interview;

import java.util.List;

@Repository
public interface InterviewRepo extends JpaRepository<Interview,Long> {
    List<Interview> findByJobId(Long id);
    List<Interview> findByApplicationId(Long applicationId);
    List<Interview> findByCandidateId(Long candidateId);
    List<Interview> findByJob_CreatedByCompany_IdCompany(Long companyId);
}


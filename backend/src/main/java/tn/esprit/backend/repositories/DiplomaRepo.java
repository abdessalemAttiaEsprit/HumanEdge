package tn.esprit.backend.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import tn.esprit.backend.entities.Diploma;

import java.util.List;

@Repository
public interface DiplomaRepo extends JpaRepository<Diploma, Long> {
    List<Diploma> findByPersonnel_IdPersonnelOrderByCreatedAtDesc(Long personnelId);

    List<Diploma> findByPersonnel_User_Company_IdCompanyOrderByCreatedAtDesc(Long companyId);
}

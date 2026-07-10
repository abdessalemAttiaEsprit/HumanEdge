package tn.esprit.backend.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import tn.esprit.backend.entities.Absence;

import java.util.List;

@Repository
public interface AbsenceRepo extends JpaRepository<Absence, Long> {
    List<Absence> findByPersonnel_User_Company_IdCompany(Long companyId);
}

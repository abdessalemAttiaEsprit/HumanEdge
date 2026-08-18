package tn.esprit.backend.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import tn.esprit.backend.entities.Task;

import java.util.List;

@Repository
public interface TaskRepo extends JpaRepository<Task, Long> {
    List<Task> findByPersonnel_IdPersonnelOrderByStartDateDesc(Long personnelId);

    List<Task> findByPersonnel_User_Company_IdCompanyOrderByStartDateDesc(Long companyId);
}

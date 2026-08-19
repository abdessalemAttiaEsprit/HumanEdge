package tn.esprit.backend.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import tn.esprit.backend.entities.Skill;

import java.util.List;

@Repository
public interface SkillRepo extends JpaRepository<Skill, Long> {
    List<Skill> findByPersonnel_IdPersonnelOrderByCreatedAtDesc(Long personnelId);

    List<Skill> findByPersonnel_User_Company_IdCompanyOrderByCreatedAtDesc(Long companyId);
}

package tn.esprit.backend.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import tn.esprit.backend.entities.Message;

import java.util.List;

@Repository
public interface MessageRepo extends JpaRepository<Message, Long> {
    List<Message> findBySender_IdUserOrderByCreatedAtDesc(Long userId);

    List<Message> findBySender_Company_IdCompanyOrderByCreatedAtDesc(Long companyId);
}

package tn.esprit.backend.repositories;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import tn.esprit.backend.entities.Notification;

import java.util.List;

@Repository
public interface NotificationRepo extends JpaRepository<Notification, Long> {
    List<Notification> findByRecipient_IdUserOrderByCreatedAtDesc(Long userId);

    Page<Notification> findByRecipient_IdUserOrderByCreatedAtDesc(Long userId, Pageable pageable);

    long countByRecipient_IdUserAndReadFalse(Long userId);
}

package tn.esprit.backend.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import tn.esprit.backend.entities.Message;

import java.util.List;

@Repository
public interface MessageRepo extends JpaRepository<Message, Long> {
    /** Toute la conversation d'un utilisateur (messages envoyés OU reçus), plus récents d'abord. */
    List<Message> findBySender_IdUserOrRecipient_IdUserOrderByCreatedAtDesc(Long senderId, Long recipientId);

    /** Tous les échanges impliquant une entreprise (envoyés par un employé OU reçus par un employé), plus récents d'abord. */
    List<Message> findBySender_Company_IdCompanyOrRecipient_Company_IdCompanyOrderByCreatedAtDesc(
            Long senderCompanyId, Long recipientCompanyId);
}

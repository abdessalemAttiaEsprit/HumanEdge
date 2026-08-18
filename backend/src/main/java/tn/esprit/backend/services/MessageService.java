package tn.esprit.backend.services;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tn.esprit.backend.entities.Enum.Role;
import tn.esprit.backend.entities.Message;
import tn.esprit.backend.entities.User;
import tn.esprit.backend.exceptions.BadRequestException;
import tn.esprit.backend.exceptions.ResourceNotFoundException;
import tn.esprit.backend.repositories.MessageRepo;
import tn.esprit.backend.repositories.UserRepository;
import tn.esprit.backend.security.OwnershipGuard;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Messagerie EMPLOYE <-> entreprise : un message initié par l'employé est diffusé à tous les
 * comptes COMPANY de son entreprise (pas de destinataire précis) ; l'entreprise peut ensuite
 * répondre à un employé précis via {@link #replyToEmployee}. Chaque échange déclenche une
 * notification côté destinataire.
 */
@Service
@RequiredArgsConstructor
public class MessageService {

    private static final int NOTIFICATION_PREVIEW_LENGTH = 120;

    private final MessageRepo messageRepo;
    private final UserRepository userRepository;
    private final OwnershipGuard ownershipGuard;
    private final NotificationService notificationService;

    @Transactional
    public Message sendMessageToCompany(String content) {
        User me = ownershipGuard.currentUser();
        if (me.getCompany() == null) {
            throw new BadRequestException("No company associated with this account");
        }

        Message message = Message.builder()
                .sender(me)
                .content(content.trim())
                .createdAt(LocalDateTime.now())
                .build();
        Message saved = messageRepo.save(message);

        String employeeName = (me.getFirstname() + " " + me.getLastname()).trim();
        userRepository.findByCompany_IdCompany(me.getCompany().getIdCompany()).stream()
                .filter(u -> u.getRole() == Role.COMPANY)
                .forEach(u -> notificationService.notify(u, employeeName + ": " + preview(saved.getContent())));

        return saved;
    }

    /**
     * Répond à un employé précis (COMPANY uniquement) - vérifie que cet employé appartient bien
     * à l'entreprise de l'appelant avant d'envoyer, comme tout accès scopé par entreprise ailleurs
     * dans le codebase (voir OwnershipGuard#checkCompanyAccess).
     */
    @Transactional
    public Message replyToEmployee(Long employeeUserId, String content) {
        User target = userRepository.findById(employeeUserId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        if (target.getRole() != Role.EMPLOYE) {
            throw new BadRequestException("Can only reply to an employee");
        }
        if (target.getCompany() == null) {
            throw new BadRequestException("This employee has no associated company");
        }
        ownershipGuard.checkCompanyAccess(target.getCompany().getIdCompany());

        User me = ownershipGuard.currentUser();
        Message reply = Message.builder()
                .sender(me)
                .recipient(target)
                .content(content.trim())
                .createdAt(LocalDateTime.now())
                .build();
        Message saved = messageRepo.save(reply);

        String companyName = me.getCompany() != null ? me.getCompany().getCompanyName() : "HR";
        notificationService.notify(target, companyName + ": " + preview(saved.getContent()));

        return saved;
    }

    /** Toute la conversation de l'appelant (messages envoyés et reçus), plus récents d'abord. */
    @Transactional(readOnly = true)
    public List<Message> getMyConversation() {
        Long userId = ownershipGuard.currentUser().getIdUser();
        return messageRepo.findBySender_IdUserOrRecipient_IdUserOrderByCreatedAtDesc(userId, userId);
    }

    /** Tous les échanges de l'entreprise courante avec ses employés, plus récents d'abord. */
    @Transactional(readOnly = true)
    public List<Message> getReceivedMessages() {
        Long companyId = ownershipGuard.currentCompanyId();
        return messageRepo.findBySender_Company_IdCompanyOrRecipient_Company_IdCompanyOrderByCreatedAtDesc(companyId, companyId);
    }

    private static String preview(String content) {
        return content.length() > NOTIFICATION_PREVIEW_LENGTH
                ? content.substring(0, NOTIFICATION_PREVIEW_LENGTH - 1) + "…"
                : content;
    }
}

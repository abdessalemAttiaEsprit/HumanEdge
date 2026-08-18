package tn.esprit.backend.services;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tn.esprit.backend.entities.Enum.Role;
import tn.esprit.backend.entities.Message;
import tn.esprit.backend.entities.User;
import tn.esprit.backend.exceptions.BadRequestException;
import tn.esprit.backend.repositories.MessageRepo;
import tn.esprit.backend.repositories.UserRepository;
import tn.esprit.backend.security.OwnershipGuard;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Espace de messagerie du dashboard EMPLOYE : un message ne va que de l'employé vers son
 * entreprise, jamais l'inverse - côté entreprise, il n'existe qu'en tant que notification
 * (même pattern que AbsenceService#notifyCompanyOfNewRequest / ApplicationService#notifyCompanyOfNewApplication).
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

    @Transactional(readOnly = true)
    public List<Message> getMySentMessages() {
        Long userId = ownershipGuard.currentUser().getIdUser();
        return messageRepo.findBySender_IdUserOrderByCreatedAtDesc(userId);
    }

    /** Messages reçus par l'entreprise courante (tous ses employés confondus), plus récents d'abord. */
    @Transactional(readOnly = true)
    public List<Message> getReceivedMessages() {
        return messageRepo.findBySender_Company_IdCompanyOrderByCreatedAtDesc(ownershipGuard.currentCompanyId());
    }

    private static String preview(String content) {
        return content.length() > NOTIFICATION_PREVIEW_LENGTH
                ? content.substring(0, NOTIFICATION_PREVIEW_LENGTH - 1) + "…"
                : content;
    }
}

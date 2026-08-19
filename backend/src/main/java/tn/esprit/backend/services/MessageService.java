package tn.esprit.backend.services;

import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import tn.esprit.backend.entities.Enum.MessageCategory;
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
    private final FileStorageService fileStorageService;

    @Transactional
    public Message sendMessageToCompany(String content, MessageCategory category) {
        User me = ownershipGuard.currentUser();
        if (me.getCompany() == null) {
            throw new BadRequestException("No company associated with this account");
        }

        Message message = Message.builder()
                .sender(me)
                .content(content.trim())
                .category(category != null ? category : MessageCategory.OTHER)
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
     * Répond à un employé précis (COMPANY uniquement), avec pièce jointe optionnelle - vérifie
     * que cet employé appartient bien à l'entreprise de l'appelant avant d'envoyer, comme tout
     * accès scopé par entreprise ailleurs dans le codebase (voir OwnershipGuard#checkCompanyAccess).
     */
    @Transactional
    public Message replyToEmployee(Long employeeUserId, String content, MultipartFile file) {
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
        // Pas restreint aux images (contrairement à un logo/signature) : une réponse RH peut
        // légitimement joindre un PDF/Word (ex: modèle de document demandé par l'employé).
        String attachment = file != null && !file.isEmpty()
                ? fileStorageService.store(file, "message_" + employeeUserId, false)
                : null;

        Message reply = Message.builder()
                .sender(me)
                .recipient(target)
                .content(content.trim())
                .attachment(attachment)
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

    /** Résout un message pour téléchargement de pièce jointe - vérifie que l'appelant est bien l'une des deux parties. */
    @Transactional(readOnly = true)
    public Message getMessageForAttachment(Long id) {
        Message message = messageRepo.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Message not found"));
        checkMessageAccess(message);
        return message;
    }

    private void checkMessageAccess(Message message) {
        User me = ownershipGuard.currentUser();
        if (me.getRole() == Role.ADMIN) {
            return;
        }
        if (isParty(message.getSender(), me) || isParty(message.getRecipient(), me)) {
            return;
        }
        if (me.getRole() == Role.COMPANY) {
            Long myCompanyId = me.getCompany() != null ? me.getCompany().getIdCompany() : null;
            if (myCompanyId != null
                    && (myCompanyId.equals(companyIdOf(message.getSender())) || myCompanyId.equals(companyIdOf(message.getRecipient())))) {
                return;
            }
        }
        throw new AccessDeniedException("You do not have access to this message");
    }

    private static boolean isParty(User user, User me) {
        return user != null && user.getIdUser().equals(me.getIdUser());
    }

    private static Long companyIdOf(User user) {
        return user != null && user.getCompany() != null ? user.getCompany().getIdCompany() : null;
    }

    private static String preview(String content) {
        return content.length() > NOTIFICATION_PREVIEW_LENGTH
                ? content.substring(0, NOTIFICATION_PREVIEW_LENGTH - 1) + "…"
                : content;
    }
}

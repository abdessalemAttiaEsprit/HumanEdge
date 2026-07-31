package tn.esprit.backend.services;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import tn.esprit.backend.entities.Notification;
import tn.esprit.backend.entities.User;
import tn.esprit.backend.exceptions.ResourceNotFoundException;
import tn.esprit.backend.repositories.NotificationRepo;
import tn.esprit.backend.security.OwnershipGuard;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Notifications in-app (cloche du header) - canal complémentaire aux emails transactionnels
 * déjà en place (OTP, reset password, entretien planifié), pas un remplacement : {@link #notify}
 * est appelé en plus de l'email existant à chaque point d'appel, jamais à sa place.
 */
@Service
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationRepo notificationRepo;
    private final OwnershipGuard ownershipGuard;

    /** Appelé par les autres services (entretien planifié, entreprise vérifiée, nouvelle candidature...). */
    public void notify(User recipient, String message) {
        if (recipient == null) {
            return;
        }
        Notification notification = Notification.builder()
                .recipient(recipient)
                .message(message)
                .createdAt(LocalDateTime.now())
                .read(false)
                .build();
        notificationRepo.save(notification);
    }

    /** Historique paginé (le plus récent d'abord) — la cloche charge par pages de {@code size} via "Load more". */
    public List<Notification> getMyNotifications(int page, int size) {
        Long userId = ownershipGuard.currentUser().getIdUser();
        return notificationRepo.findByRecipient_IdUserOrderByCreatedAtDesc(userId, PageRequest.of(page, size)).getContent();
    }

    public long unreadCount() {
        Long userId = ownershipGuard.currentUser().getIdUser();
        return notificationRepo.countByRecipient_IdUserAndReadFalse(userId);
    }

    public void markAsRead(Long id) {
        Notification notification = notificationRepo.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Notification not found"));
        Long userId = ownershipGuard.currentUser().getIdUser();
        if (!notification.getRecipient().getIdUser().equals(userId)) {
            throw new ResourceNotFoundException("Notification not found");
        }
        notification.setRead(true);
        notificationRepo.save(notification);
    }

    public void markAllAsRead() {
        Long userId = ownershipGuard.currentUser().getIdUser();
        List<Notification> unread = notificationRepo.findByRecipient_IdUserOrderByCreatedAtDesc(userId).stream()
                .filter(n -> !n.isRead())
                .toList();
        unread.forEach(n -> n.setRead(true));
        notificationRepo.saveAll(unread);
    }

    public void deleteNotification(Long id) {
        Notification notification = notificationRepo.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Notification not found"));
        Long userId = ownershipGuard.currentUser().getIdUser();
        if (!notification.getRecipient().getIdUser().equals(userId)) {
            throw new ResourceNotFoundException("Notification not found");
        }
        notificationRepo.delete(notification);
    }
}

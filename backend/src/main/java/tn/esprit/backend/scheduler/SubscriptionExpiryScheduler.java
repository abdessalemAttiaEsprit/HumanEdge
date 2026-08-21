package tn.esprit.backend.scheduler;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tn.esprit.backend.entities.Enum.Role;
import tn.esprit.backend.entities.Subscription;
import tn.esprit.backend.entities.User;
import tn.esprit.backend.repositories.SubscriptionRepo;
import tn.esprit.backend.repositories.UserRepository;
import tn.esprit.backend.services.NotificationService;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Fait avancer automatiquement le cycle de vie d'un abonnement expiré : notifie l'entreprise
 * dès que periodEnd est dépassé, puis bloque le compte 24h plus tard si personne n'a renouvelé
 * (voir OwnershipGuard.checkCompanyOperational pour l'application du blocage, et AuthService
 * pour la redirection au login). Même principe que ContractEchelonScheduler : findAll() +
 * filtrage en mémoire, la table des abonnements restant de taille modeste.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class SubscriptionExpiryScheduler {

    private final SubscriptionRepo subscriptionRepo;
    private final UserRepository userRepository;
    private final NotificationService notificationService;

    @Scheduled(cron = "0 0 * * * *")
    @Transactional
    public void processExpiredSubscriptions() {
        LocalDateTime now = LocalDateTime.now();
        int notified = 0;
        int blocked = 0;

        for (Subscription subscription : subscriptionRepo.findAll()) {
            // "Vient d'expirer" : la lecture paresseuse (SubscriptionService.applyExpiryIfNeeded)
            // peut déjà avoir basculé le statut en EXPIRED avant notre passage - on se fie donc à
            // expiryNotifiedAt == null (jamais notifiée), pas au statut ACTIVE seul, sinon ces
            // abonnements ne seraient jamais ni notifiés ni bloqués.
            boolean justExpired = ("ACTIVE".equals(subscription.getStatus()) || "EXPIRED".equals(subscription.getStatus()))
                    && subscription.getPeriodEnd() != null
                    && subscription.getPeriodEnd().isBefore(now)
                    && subscription.getExpiryNotifiedAt() == null;

            if (justExpired) {
                subscription.setStatus("EXPIRED");
                subscription.setExpiryNotifiedAt(now);
                subscriptionRepo.save(subscription);
                notifyCompany(subscription,
                        "Your subscription has expired. You have 24 hours to renew it before your account is blocked.");
                notified++;
                continue;
            }

            boolean shouldBlock = "EXPIRED".equals(subscription.getStatus())
                    && subscription.getExpiryNotifiedAt() != null
                    && subscription.getExpiryNotifiedAt().isBefore(now.minusHours(24));

            if (shouldBlock) {
                subscription.setStatus("BLOCKED");
                subscriptionRepo.save(subscription);
                notifyCompany(subscription,
                        "Your account has been blocked because your subscription was not renewed in time. Please renew your subscription to regain access.");
                blocked++;
            }
        }

        if (notified > 0 || blocked > 0) {
            log.info("Abonnements : {} nouvellement expiré(s) notifié(s), {} bloqué(s) pour non-renouvellement", notified, blocked);
        }
    }

    private void notifyCompany(Subscription subscription, String message) {
        Long companyId = subscription.getCompanyId();
        if (companyId == null) {
            return;
        }
        List<User> companyUsers = userRepository.findByCompany_IdCompany(companyId);
        for (User user : companyUsers) {
            if (user.getRole() == Role.COMPANY) {
                notificationService.notify(user, message);
            }
        }
    }
}

package tn.esprit.backend.scheduler;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import tn.esprit.backend.entities.Company;
import tn.esprit.backend.entities.Enum.Role;
import tn.esprit.backend.entities.Subscription;
import tn.esprit.backend.entities.User;
import tn.esprit.backend.repositories.SubscriptionRepo;
import tn.esprit.backend.repositories.UserRepository;
import tn.esprit.backend.services.NotificationService;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Couvre les deux transitions du cycle de vie d'un abonnement expiré : notification à
 * l'expiration (avec le piège de la lecture paresseuse déjà EXPIRED mais jamais notifiée),
 * puis blocage 24h après la notification si personne n'a renouvelé.
 */
@ExtendWith(MockitoExtension.class)
class SubscriptionExpirySchedulerTest {

    @Mock private SubscriptionRepo subscriptionRepo;
    @Mock private UserRepository userRepository;
    @Mock private NotificationService notificationService;

    @InjectMocks
    private SubscriptionExpiryScheduler scheduler;

    private Company company(Long id) {
        return Company.builder().idCompany(id).build();
    }

    private User companyUser(Company company) {
        return User.builder().idUser(1L).role(Role.COMPANY).company(company).build();
    }

    @Test
    void activeSubscriptionPastPeriodEndGetsNotifiedAndFlippedToExpired() {
        Company company = company(1L);
        Subscription subscription = Subscription.builder()
                .company(company)
                .status("ACTIVE")
                .periodEnd(LocalDateTime.now().minusHours(2))
                .expiryNotifiedAt(null)
                .build();

        when(subscriptionRepo.findAll()).thenReturn(List.of(subscription));
        when(userRepository.findByCompany_IdCompany(1L)).thenReturn(List.of(companyUser(company)));

        scheduler.processExpiredSubscriptions();

        assertThat(subscription.getStatus()).isEqualTo("EXPIRED");
        assertThat(subscription.getExpiryNotifiedAt()).isNotNull();
        verify(notificationService, times(1)).notify(any(User.class), eq(
                "Your subscription has expired. You have 24 hours to renew it before your account is blocked."));
        verify(subscriptionRepo).save(subscription);
    }

    @Test
    void alreadyLazilyExpiredSubscriptionStillGetsNotified() {
        // Simule SubscriptionService.applyExpiryIfNeeded ayant déjà basculé le statut via une
        // lecture, avant le passage du scheduler - c'est le piège documenté dans le plan : si on
        // ne cherchait que status == ACTIVE, ce cas ne serait jamais notifié ni jamais bloqué.
        Company company = company(2L);
        Subscription subscription = Subscription.builder()
                .company(company)
                .status("EXPIRED")
                .periodEnd(LocalDateTime.now().minusMinutes(5))
                .expiryNotifiedAt(null)
                .build();

        when(subscriptionRepo.findAll()).thenReturn(List.of(subscription));
        when(userRepository.findByCompany_IdCompany(2L)).thenReturn(List.of(companyUser(company)));

        scheduler.processExpiredSubscriptions();

        assertThat(subscription.getExpiryNotifiedAt()).isNotNull();
        verify(notificationService, times(1)).notify(any(User.class), any());
    }

    @Test
    void expiredSubscriptionPast24hSinceNotificationGetsBlocked() {
        Company company = company(3L);
        Subscription subscription = Subscription.builder()
                .company(company)
                .status("EXPIRED")
                .periodEnd(LocalDateTime.now().minusDays(2))
                .expiryNotifiedAt(LocalDateTime.now().minusHours(25))
                .build();

        when(subscriptionRepo.findAll()).thenReturn(List.of(subscription));
        when(userRepository.findByCompany_IdCompany(3L)).thenReturn(List.of(companyUser(company)));

        scheduler.processExpiredSubscriptions();

        assertThat(subscription.getStatus()).isEqualTo("BLOCKED");
        verify(notificationService, times(1)).notify(any(User.class), eq(
                "Your account has been blocked because your subscription was not renewed in time. Please renew your subscription to regain access."));
    }

    @Test
    void expiredSubscriptionWithinGracePeriodIsUntouched() {
        Subscription subscription = Subscription.builder()
                .company(company(4L))
                .status("EXPIRED")
                .periodEnd(LocalDateTime.now().minusHours(10))
                .expiryNotifiedAt(LocalDateTime.now().minusHours(10))
                .build();

        when(subscriptionRepo.findAll()).thenReturn(List.of(subscription));

        scheduler.processExpiredSubscriptions();

        assertThat(subscription.getStatus()).isEqualTo("EXPIRED");
        verify(subscriptionRepo, never()).save(any());
        verify(notificationService, never()).notify(any(), any());
    }

    @Test
    void activeSubscriptionNotYetPastPeriodEndIsUntouched() {
        Subscription subscription = Subscription.builder()
                .company(company(5L))
                .status("ACTIVE")
                .periodEnd(LocalDateTime.now().plusDays(10))
                .build();

        when(subscriptionRepo.findAll()).thenReturn(List.of(subscription));

        scheduler.processExpiredSubscriptions();

        assertThat(subscription.getStatus()).isEqualTo("ACTIVE");
        verify(notificationService, never()).notify(any(), any());
    }

    @Test
    void canceledSubscriptionIsNeverTouchedEvenIfPeriodEndIsPast() {
        Subscription subscription = Subscription.builder()
                .company(company(6L))
                .status("CANCELED")
                .periodEnd(LocalDateTime.now().minusDays(30))
                .expiryNotifiedAt(null)
                .build();

        when(subscriptionRepo.findAll()).thenReturn(List.of(subscription));

        scheduler.processExpiredSubscriptions();

        assertThat(subscription.getStatus()).isEqualTo("CANCELED");
        verify(subscriptionRepo, never()).save(any());
        verify(notificationService, never()).notify(any(), any());
    }
}

package tn.esprit.backend.services;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tn.esprit.backend.dto.SubscriptionPaymentRequest;
import tn.esprit.backend.entities.Subscription;
import tn.esprit.backend.exceptions.ResourceNotFoundException;
import tn.esprit.backend.repositories.SubscriptionRepo;
import tn.esprit.backend.security.OwnershipGuard;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Cycle de vie de l'abonnement plateforme d'une entreprise : consultation (avec passage
 * automatique à EXPIRED si la période est dépassée, même principe que le recalcul d'échelon
 * dans ContractService), renouvellement/changement de plan (un seul et même paiement simulé —
 * voir PaymentSimulatorService) et résiliation.
 */
@Service
@RequiredArgsConstructor
public class SubscriptionService {

    private final SubscriptionRepo subscriptionRepo;
    private final SubscriptionPlanCatalog subscriptionPlanCatalog;
    private final PaymentSimulatorService paymentSimulatorService;
    private final OwnershipGuard ownershipGuard;

    @Transactional
    public Subscription getSubscription(Long companyId) {
        ownershipGuard.checkCompanyAccess(companyId);
        Subscription subscription = findByCompanyOrThrow(companyId);
        return applyExpiryIfNeeded(subscription);
    }

    /**
     * Renouvelle (même plan) ou change de plan (upgrade/downgrade) : dans les deux cas, un
     * nouveau paiement est simulé pour le plan demandé, et la période est prolongée d'un mois —
     * à partir d'aujourd'hui si l'abonnement est déjà expiré/résilié, sinon à partir de la fin
     * de la période en cours (pour ne pas faire perdre de jours déjà payés).
     */
    @Transactional
    public Subscription updateSubscription(Long companyId, SubscriptionPaymentRequest request) {
        ownershipGuard.checkCompanyAccess(companyId);
        Subscription subscription = findByCompanyOrThrow(companyId);

        SubscriptionPlanCatalog.Plan plan = subscriptionPlanCatalog.getOrThrow(request.getPlan());
        PaymentSimulatorService.SimulatedCharge charge = paymentSimulatorService.charge(
                request.getCardHolder(), request.getCardNumber(), request.getCardExpiry(),
                request.getCardCvv(), plan.monthlyPrice());

        LocalDateTime now = LocalDateTime.now();
        LocalDateTime base = subscription.getPeriodEnd() != null && subscription.getPeriodEnd().isAfter(now)
                ? subscription.getPeriodEnd()
                : now;

        subscription.setPlan(plan.code());
        subscription.setAmount(plan.monthlyPrice());
        subscription.setStatus("ACTIVE");
        subscription.setCardLast4(charge.cardLast4());
        subscription.setTransactionRef(charge.transactionRef());
        subscription.setPaidAt(now);
        subscription.setPeriodEnd(base.plusMonths(1));

        return subscriptionRepo.save(subscription);
    }

    @Transactional
    public Subscription cancelSubscription(Long companyId) {
        ownershipGuard.checkCompanyAccess(companyId);
        Subscription subscription = findByCompanyOrThrow(companyId);
        subscription.setStatus("CANCELED");
        return subscriptionRepo.save(subscription);
    }

    /** Vue globale (ADMIN uniquement, voir SubscriptionController) : tous les abonnements,
     * statuts EXPIRED recalculés au passage. */
    @Transactional
    public List<Subscription> getAllSubscriptions() {
        return subscriptionRepo.findAll().stream().map(this::applyExpiryIfNeeded).toList();
    }

    private Subscription findByCompanyOrThrow(Long companyId) {
        return subscriptionRepo.findByCompany_IdCompany(companyId)
                .orElseThrow(() -> new ResourceNotFoundException("No subscription found for this company"));
    }

    private Subscription applyExpiryIfNeeded(Subscription subscription) {
        if ("ACTIVE".equals(subscription.getStatus())
                && subscription.getPeriodEnd() != null
                && subscription.getPeriodEnd().isBefore(LocalDateTime.now())) {
            subscription.setStatus("EXPIRED");
            return subscriptionRepo.save(subscription);
        }
        return subscription;
    }
}

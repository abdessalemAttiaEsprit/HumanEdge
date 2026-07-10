package tn.esprit.backend.controllers;

import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tn.esprit.backend.entities.Subscription;
import tn.esprit.backend.services.SubscriptionService;

import java.util.List;

/**
 * Vue globale des abonnements, réservée à l'ADMIN (voir dashboard). Les opérations scopées à
 * une entreprise (consulter/renouveler/résilier) restent sous /api/companies/{id}/subscription.
 */
@RestController
@RequestMapping("/api/subscriptions")
@RequiredArgsConstructor
public class SubscriptionController {

    private final SubscriptionService subscriptionService;

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public List<Subscription> getAllSubscriptions() {
        return subscriptionService.getAllSubscriptions();
    }
}

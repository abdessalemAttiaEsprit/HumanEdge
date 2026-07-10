package tn.esprit.backend.scheduler;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tn.esprit.backend.entities.Contract;
import tn.esprit.backend.repositories.ContractRepo;
import tn.esprit.backend.services.PaymentSuggestionService;

import java.util.List;

/**
 * Fait avancer automatiquement l'échelon (et le salaire de base associé) de tous les contrats
 * rattachés à une catégorie de la grille salariale, au fil de l'ancienneté acquise. S'exécute
 * indépendamment des consultations via l'API, pour que les contrats jamais rouverts par un
 * utilisateur restent quand même à jour (ex: lus directement via Personnel.getContract()).
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ContractEchelonScheduler {

    private final ContractRepo contractRepository;
    private final PaymentSuggestionService paymentSuggestionService;

    @Scheduled(cron = "0 0 2 * * *")
    @Transactional
    public void recalculateEchelons() {
        List<Contract> contracts = contractRepository.findAll();
        int updated = 0;
        for (Contract contract : contracts) {
            if (paymentSuggestionService.applyAutomaticEchelon(contract)) {
                contractRepository.save(contract);
                updated++;
            }
        }
        if (updated > 0) {
            log.info("Échelons recalculés automatiquement pour {} contrat(s)", updated);
        }
    }
}

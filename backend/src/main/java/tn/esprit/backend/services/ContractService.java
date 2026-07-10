package tn.esprit.backend.services;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tn.esprit.backend.entities.Contract;
import tn.esprit.backend.entities.Personnel;
import tn.esprit.backend.exceptions.BadRequestException;
import tn.esprit.backend.exceptions.ResourceNotFoundException;
import tn.esprit.backend.repositories.ContractRepo;
import tn.esprit.backend.repositories.PersonnelRepo;
import tn.esprit.backend.security.OwnershipGuard;

import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

@Service
@RequiredArgsConstructor
public class ContractService {
    private final ContractRepo contractRepository;
    private final PersonnelRepo personnelRepository;
    private final OwnershipGuard ownershipGuard;
    private final PaymentSuggestionService paymentSuggestionService;

    /**
     * Récupère tous les contrats. Recalcule au passage l'échelon des contrats rattachés à
     * une catégorie de la grille salariale (voir {@link #applyAutoEchelon}).
     */
    @Transactional
    public List<Contract> getAllContracts() {
        List<Contract> contracts = ownershipGuard.isAdmin()
                ? contractRepository.findAll()
                : contractRepository.findByPersonnel_User_Company_IdCompany(ownershipGuard.currentCompanyId());
        contracts.forEach(this::applyAutoEchelon);
        return contracts;
    }

    /**
     * Récupère un contrat par son ID. Recalcule au passage son échelon s'il est rattaché à
     * une catégorie de la grille salariale (voir {@link #applyAutoEchelon}).
     */
    @Transactional
    public Contract getContractById(Long id) {
        Contract contract = contractRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Contrat non trouvé avec l'id : " + id));
        ownershipGuard.checkPersonnelAccess(contract.getPersonnel());
        applyAutoEchelon(contract);
        return contract;
    }

    /**
     * Crée un nouveau contrat. La catégorie (grille salariale) et la date de début sont
     * obligatoires : salaireBase en est toujours déduit automatiquement, il ne se saisit
     * jamais à la main (un complément éventuel se saisit dans salaireComplementaire).
     */
    @Transactional
    public Contract createContract(Contract contract) {
        Personnel targetPersonnel = resolveTargetPersonnel(contract.getPersonnel());
        requireCategorieEtDateDebut(contract);

        // Contract.personnel is the inverse (mappedBy) side and is never persisted from
        // here — the FK column (personnels.contract_id) only exists on Personnel, so the
        // link has to be written from that side, below.
        contract.setPersonnel(null);
        Contract saved = contractRepository.save(contract);

        if (targetPersonnel != null) {
            targetPersonnel.setContract(saved);
            assignMatriculeIfMissing(targetPersonnel, saved);
            personnelRepository.save(targetPersonnel);
        }

        applyAutoEchelon(saved);
        return saved;
    }

    /**
     * Matricule employé : 4 chiffres aléatoires, suivis de l'initiale du nom puis du prénom,
     * suivis de l'année de début de ce contrat (ex. pour Jane Martin embauchée en 2026 :
     * "2567JM2026"). Généré une seule fois, au premier contrat du salarié : un renouvellement/
     * second contrat ne le régénère pas, comme un vrai matricule qui reste stable toute la
     * carrière du salarié dans l'entreprise. N'est jamais accepté depuis le client (voir
     * PersonnelService.updatePersonnel), au même titre que salaireBase.
     */
    private void assignMatriculeIfMissing(Personnel personnel, Contract contract) {
        if (personnel.getMatricule() != null && !personnel.getMatricule().isBlank()) {
            return;
        }
        String lastInitial = initial(personnel.getUser() != null ? personnel.getUser().getLastname() : null);
        String firstInitial = initial(personnel.getUser() != null ? personnel.getUser().getFirstname() : null);
        int year = contract.getDateDebut().getYear();

        String matricule;
        int attempts = 0;
        do {
            int randomPart = ThreadLocalRandom.current().nextInt(10_000);
            matricule = String.format("%04d%s%s%d", randomPart, lastInitial, firstInitial, year);
            attempts++;
        } while (personnelRepository.existsByMatricule(matricule) && attempts < 20);

        personnel.setMatricule(matricule);
    }

    private static String initial(String name) {
        return (name == null || name.isBlank()) ? "X" : name.trim().substring(0, 1).toUpperCase();
    }

    /**
     * Met à jour un contrat existant. Mêmes règles qu'à la création : catégorie et date de
     * début obligatoires, salaireBase toujours recalculé (jamais accepté depuis le client).
     */
    @Transactional
    public Contract updateContract(Long id, Contract contractDetails) {
        Contract existingContract = getContractById(id); // vérifie déjà la propriété
        requireCategorieEtDateDebut(contractDetails);

        // Mise à jour des champs en respectant vos variables (et en corrigeant les majuscules)
        existingContract.setWork(contractDetails.getWork());
        existingContract.setTypeContrat(contractDetails.getTypeContrat());
        existingContract.setDateDebut(contractDetails.getDateDebut());
        existingContract.setDateFin(contractDetails.getDateFin());
        existingContract.setCategorie(contractDetails.getCategorie());
        existingContract.setSalaireComplementaire(contractDetails.getSalaireComplementaire());
        existingContract.setTauxHoraireSup(contractDetails.getTauxHoraireSup());
        existingContract.setAvantages(contractDetails.getAvantages());

        // Personnel assignment is only done at creation time (see createContract) — the
        // FK lives on Personnel.contract, not here, so re-assignment isn't supported by
        // this endpoint.

        // echelon et salaireBase ne sont jamais acceptés depuis le client : ils sont
        // recalculés automatiquement ci-dessous à partir de la catégorie et de l'ancienneté.
        Contract saved = contractRepository.save(existingContract);
        applyAutoEchelon(saved);
        return saved;
    }

    /**
     * Recalcule l'échelon du contrat (et le salaire de base associé) à partir de l'ancienneté
     * écoulée depuis dateDebut, et persiste le changement. Ne fait rien si le contrat n'a pas
     * encore de catégorie/dateDebut (contrats créés avant l'introduction de la grille salariale).
     */
    private void applyAutoEchelon(Contract contract) {
        if (paymentSuggestionService.applyAutomaticEchelon(contract)) {
            contractRepository.save(contract);
        }
    }

    private void requireCategorieEtDateDebut(Contract contract) {
        if (contract.getCategorie() == null || contract.getCategorie().isBlank()) {
            throw new BadRequestException("Category is required: base salary is derived from the salary grid.");
        }
        if (contract.getDateDebut() == null) {
            throw new BadRequestException("Contract start date is required to compute the salary step.");
        }
    }

    /**
     * Supprime un contrat par son ID.
     */
    @Transactional
    public void deleteContract(Long id) {
        Contract contract = getContractById(id); // vérifie déjà la propriété
        // Même cycle bidirectionnel EAGER que côté PersonnelService.deletePersonnel : il faut
        // le casser en mémoire avant le DELETE pour éviter le TransientObjectException de
        // Hibernate, et pour que personnels.contract_id soit bien remis à NULL au flush plutôt
        // que de rester une clé étrangère orpheline vers un contrat supprimé.
        Personnel linkedPersonnel = contract.getPersonnel();
        if (linkedPersonnel != null) {
            linkedPersonnel.setContract(null);
            contract.setPersonnel(null);
        }
        contractRepository.delete(contract);
    }

    /**
     * Ne fait jamais confiance au Personnel imbriqué envoyé par le client : recharge
     * l'entité réelle depuis la base, vérifie à qui elle appartient, et la renvoie (pour
     * que l'appelant puisse ensuite écrire le lien depuis le côté propriétaire).
     * ADMIN peut créer un contrat non assigné (retourne {@code null} si aucun personnel
     * n'est fourni) ; les autres rôles doivent obligatoirement en fournir un.
     */
    private Personnel resolveTargetPersonnel(Personnel requestedPersonnel) {
        if (requestedPersonnel == null || requestedPersonnel.getIdPersonnel() == null) {
            if (ownershipGuard.isAdmin()) {
                return null;
            }
            throw new AccessDeniedException("An associated personnel record is required");
        }
        Personnel realPersonnel = personnelRepository.findById(requestedPersonnel.getIdPersonnel())
                .orElseThrow(() -> new ResourceNotFoundException("Personnel not found"));
        ownershipGuard.checkPersonnelAccess(realPersonnel);
        return realPersonnel;
    }
}

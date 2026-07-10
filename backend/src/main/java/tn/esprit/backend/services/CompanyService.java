package tn.esprit.backend.services;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import tn.esprit.backend.entities.Company;
import tn.esprit.backend.entities.Contract;
import tn.esprit.backend.entities.Personnel;
import tn.esprit.backend.exceptions.BadRequestException;
import tn.esprit.backend.exceptions.ResourceNotFoundException;
import tn.esprit.backend.repositories.CompanyRepo;
import tn.esprit.backend.repositories.ContractRepo;
import tn.esprit.backend.repositories.JobPostingRepo;
import tn.esprit.backend.repositories.PaymentRepo;
import tn.esprit.backend.repositories.PersonnelRepo;
import tn.esprit.backend.repositories.SubscriptionRepo;
import tn.esprit.backend.repositories.UserRepository;
import tn.esprit.backend.security.OwnershipGuard;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class CompanyService {

    private final CompanyRepo companyRepository;
    private final SubscriptionRepo subscriptionRepo;
    private final UserRepository userRepository;
    private final PersonnelRepo personnelRepo;
    private final ContractRepo contractRepo;
    private final PaymentRepo paymentRepo;
    private final JobPostingRepo jobPostingRepo;
    private final OwnershipGuard ownershipGuard;
    private final FileStorageService fileStorageService;

    public Company createCompany(Company company) {
        // Email/password belong to User, not Company — no email check here.

        if (company.getFiscalNumber() != null
                && companyRepository.existsByFiscalNumber(company.getFiscalNumber())) {
            throw new BadRequestException("This fiscal number is already in use");
        }

        if (company.getCnssNumber() != null
                && companyRepository.existsByCnssNumber(company.getCnssNumber())) {
            throw new BadRequestException("This CNSS number is already in use");
        }

        company.setVerified(false);
        company.setActive(true);
        return companyRepository.save(company);
    }

    public Company updateCompany(Long id, Company company) {
        ownershipGuard.checkCompanyAccess(id);
        Company existing = findCompanyOrThrow(id);

        // Update only fields that belong to Company (no email/password — those are on User)
        existing.setCompanyName(company.getCompanyName());
        existing.setPhone(company.getPhone());
        existing.setAddress(company.getAddress());
        existing.setCity(company.getCity());
        existing.setState(company.getState());
        existing.setCountry(company.getCountry());
        existing.setPostalCode(company.getPostalCode());
        existing.setLogoUrl(company.getLogoUrl());
        existing.setFiscalNumber(company.getFiscalNumber());
        existing.setCnssNumber(company.getCnssNumber());
        existing.setSignatureFileName(company.getSignatureFileName());
        existing.setRib(company.getRib());

        return companyRepository.save(existing);
    }

    @Transactional
    public Company uploadLogo(Long id, MultipartFile file) {
        ownershipGuard.checkCompanyAccess(id);
        Company company = findCompanyOrThrow(id);
        String filename = fileStorageService.store(file, "company_" + id + "_logo", true);
        company.setLogoUrl(filename);
        return companyRepository.save(company);
    }

    public void deleteCompany(Long id) {
        if (!companyRepository.existsById(id)) {
            throw new ResourceNotFoundException("Company not found with id: " + id);
        }
        // Une entreprise a toujours au moins son compte COMPANY propriétaire (créé à
        // l'inscription), et souvent des comptes EMPLOYE — les supprimer en cascade ferait
        // échouer la contrainte de clé étrangère avec une erreur 500 non explicite (même
        // classe de bug que la suppression d'un Personnel ayant des paiements). Utiliser
        // "Deactivate" pour bloquer l'accès sans perdre l'historique.
        if (userRepository.existsByCompany_IdCompany(id)) {
            throw new BadRequestException(
                    "Cannot delete this company: it still has linked user accounts. Deactivate it instead.");
        }
        companyRepository.deleteById(id);
    }

    /**
     * Suppression en cascade, réservée à l'ADMIN (voir CompanyController) : contrairement à
     * {@link #deleteCompany}, celle-ci supprime aussi tout ce qui est rattaché à l'entreprise —
     * paiements, personnel, contrats (avec leurs absences en cascade), abonnement, offres
     * d'emploi (avec candidatures/entretiens en cascade) et enfin les comptes utilisateurs.
     * Irréversible. Ne touche jamais aux profils Candidate : ils ne sont pas la propriété d'une
     * entreprise (un candidat peut postuler chez plusieurs), seules leurs Application liées aux
     * offres de CETTE entreprise disparaissent (via la cascade déjà déclarée sur JobPosting).
     */
    @Transactional
    public void deleteCompanyCascade(Long id) {
        Company company = findCompanyOrThrow(id);

        // Paiements référençant directement company (couvre le cas courant en un seul aller).
        paymentRepo.deleteAll(paymentRepo.findByCompany_IdCompany(id));

        // Personnel + contrats : même casse du cycle bidirectionnel EAGER Personnel<->Contract
        // que PersonnelService.deletePersonnel/ContractService.deleteContract, sinon Hibernate
        // lève un TransientObjectException au flush. Les absences de chaque Personnel sont
        // supprimées automatiquement (cascade ALL déjà déclarée sur Personnel.absences).
        List<Personnel> staff = personnelRepo.findByUser_Company_IdCompany(id);
        for (Personnel personnel : staff) {
            // Filet de sécurité : un paiement peut référencer ce personnel sans que son champ
            // "company" soit renseigné/cohérent (données historiques) — sans ça, le DELETE sur
            // personnels échoue avec une contrainte de clé étrangère (déjà rencontré en prod).
            paymentRepo.deleteAll(paymentRepo.findByPersonnel_IdPersonnel(personnel.getIdPersonnel()));

            Contract contract = personnel.getContract();
            if (contract != null) {
                personnel.setContract(null);
                contract.setPersonnel(null);
            }
            personnelRepo.delete(personnel);
            if (contract != null) {
                contractRepo.delete(contract);
            }
        }

        // Offres d'emploi de l'entreprise : cascade déjà déclarée vers Application/Interview
        // (CascadeType.ALL + orphanRemoval sur JobPosting).
        jobPostingRepo.deleteAll(jobPostingRepo.findByCreatedByCompany_IdCompany(id));

        // Abonnement plateforme.
        subscriptionRepo.findByCompany_IdCompany(id).ifPresent(subscriptionRepo::delete);

        // Comptes utilisateurs (COMPANY propriétaire + EMPLOYE) — après le personnel, pour ne
        // pas violer la contrainte de clé étrangère personnels.user_id.
        userRepository.deleteAll(userRepository.findByCompany_IdCompany(id));

        // L'entreprise elle-même.
        companyRepository.delete(company);
    }

    public Optional<Company> getCompanyById(Long id) {
        ownershipGuard.checkCompanyAccess(id);
        return companyRepository.findById(id);
    }

    public List<Company> getAllCompanies() {
        return companyRepository.findAll();
    }

    public Company verifyCompany(Long id) {
        Company company = findCompanyOrThrow(id);
        company.setVerified(true);
        return companyRepository.save(company);
    }

    public Company activateCompany(Long id) {
        Company company = findCompanyOrThrow(id);
        company.setActive(true);
        return companyRepository.save(company);
    }

    public Company deactivateCompany(Long id) {
        Company company = findCompanyOrThrow(id);
        company.setActive(false);
        return companyRepository.save(company);
    }

    private Company findCompanyOrThrow(Long id) {
        return companyRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Company not found with id: " + id));
    }
}

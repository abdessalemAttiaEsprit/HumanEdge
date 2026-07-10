package tn.esprit.backend.services;

import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import tn.esprit.backend.dto.PersonnelCreateRequest;
import tn.esprit.backend.dto.PersonnelSelfUpdateRequest;
import tn.esprit.backend.entities.Company;
import tn.esprit.backend.entities.Contract;
import tn.esprit.backend.entities.Enum.Role;
import tn.esprit.backend.entities.Personnel;
import tn.esprit.backend.entities.User;
import tn.esprit.backend.exceptions.BadRequestException;
import tn.esprit.backend.exceptions.ResourceNotFoundException;
import tn.esprit.backend.repositories.CompanyRepo;
import tn.esprit.backend.repositories.PaymentRepo;
import tn.esprit.backend.repositories.PersonnelRepo;
import tn.esprit.backend.repositories.UserRepository;
import tn.esprit.backend.security.OwnershipGuard;

import java.util.List;

@Service
@RequiredArgsConstructor // Automatically injects the PersonnelRepository bean via constructor
public class PersonnelService {

    private final PersonnelRepo personnelRepository;
    private final UserRepository userRepository;
    private final CompanyRepo companyRepo;
    private final PasswordEncoder passwordEncoder;
    private final OwnershipGuard ownershipGuard;
    private final FileStorageService fileStorageService;
    private final PaymentRepo paymentRepo;

    public List<Personnel> getAllPersonnel() {
        if (ownershipGuard.isAdmin()) {
            return personnelRepository.findAll();
        }
        // COMPANY : uniquement le personnel de sa propre entreprise (ADMIN seul voit tout le monde).
        return personnelRepository.findByUser_Company_IdCompany(ownershipGuard.currentCompanyId());
    }

    public List<Personnel> getPersonnelByCompanyId(Long companyId) {
        ownershipGuard.checkCompanyAccess(companyId);
        return personnelRepository.findByUser_Company_IdCompany(companyId);
    }

    /** Returns the calling user's own Personnel record (self-service, mainly for EMPLOYE). */
    public Personnel getMyPersonnel() {
        Long userId = ownershipGuard.currentUser().getIdUser();
        return personnelRepository.findByUser_IdUser(userId)
                .orElseThrow(() -> new ResourceNotFoundException("No personnel record found for your account"));
    }

    public Personnel getPersonnelById(Long id) {
        Personnel personnel = personnelRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Personnel not found with id: " + id));
        ownershipGuard.checkPersonnelAccess(personnel);
        return personnel;
    }

    public Personnel createPersonnel(Personnel personnel) {
        if (personnel.getCin() != null &&
                personnelRepository.findByCin(personnel.getCin()).isPresent()) {
            throw new BadRequestException("A personnel record with this CIN already exists: " + personnel.getCin());
        }
        // Ne jamais faire confiance à l'utilisateur imbriqué envoyé par le client :
        // on recharge le User réel depuis la base pour vérifier à qui il appartient.
        if (!ownershipGuard.isAdmin()) {
            if (personnel.getUser() == null || personnel.getUser().getIdUser() == null) {
                throw new AccessDeniedException("An associated user is required");
            }
            User targetUser = userRepository.findById(personnel.getUser().getIdUser())
                    .orElseThrow(() -> new ResourceNotFoundException("User not found"));
            Personnel probe = new Personnel();
            probe.setUser(targetUser);
            ownershipGuard.checkPersonnelAccess(probe);
        }
        return personnelRepository.save(personnel);
    }

    /**
     * Creates a brand new EMPLOYE user account together with its Personnel record.
     * COMPANY callers are always attached to their own company; ADMIN callers must
     * supply a companyId explicitly.
     */
    public Personnel createPersonnelWithNewUser(PersonnelCreateRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new BadRequestException("An account already exists with this email");
        }
        if (personnelRepository.findByCin(request.getCin()).isPresent()) {
            throw new BadRequestException("A personnel record with this CIN already exists: " + request.getCin());
        }

        Long targetCompanyId = ownershipGuard.isAdmin() ? request.getCompanyId() : ownershipGuard.currentCompanyId();
        if (targetCompanyId == null) {
            throw new BadRequestException(ownershipGuard.isAdmin()
                    ? "companyId is required"
                    : "Your account is not linked to a company");
        }
        Company company = companyRepo.findById(targetCompanyId)
                .orElseThrow(() -> new ResourceNotFoundException("Company not found with id: " + targetCompanyId));

        User user = new User();
        user.setFirstname(request.getFirstname());
        user.setLastname(request.getLastname());
        user.setEmail(request.getEmail());
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        user.setRole(Role.EMPLOYE);
        user.setEnabled(true);
        user.setCompany(company);
        User savedUser = userRepository.save(user);

        Personnel personnel = new Personnel();
        personnel.setTelephone(request.getTelephone());
        personnel.setCin(request.getCin());
        // matricule n'est jamais saisi ici : il est auto-généré au premier contrat du salarié
        // (voir ContractService.assignMatriculeIfMissing).
        personnel.setCnssNumber(request.getCnssNumber());
        personnel.setRib(request.getRib());
        personnel.setUser(savedUser);

        return personnelRepository.save(personnel);
    }

    public Personnel updatePersonnel(Long id, Personnel personnelDetails) {
        Personnel personnel = getPersonnelById(id); // vérifie déjà la propriété

        personnel.setTelephone(personnelDetails.getTelephone());
        personnel.setCin(personnelDetails.getCin());
        // matricule n'est jamais accepté depuis le client : auto-généré au premier contrat
        // (voir ContractService.assignMatriculeIfMissing), au même titre que salaireBase.
        personnel.setCnssNumber(personnelDetails.getCnssNumber());
        personnel.setRib(personnelDetails.getRib());
        personnel.setImage(personnelDetails.getImage());

        // Ne réassigne à un autre utilisateur que si explicitement fourni, et seulement après
        // avoir vérifié que ce compte appartient bien à l'appelant — jamais faire confiance à
        // l'entité imbriquée envoyée par le client sans la recharger (même pattern que createPersonnel).
        if (personnelDetails.getUser() != null && personnelDetails.getUser().getIdUser() != null) {
            User targetUser = userRepository.findById(personnelDetails.getUser().getIdUser())
                    .orElseThrow(() -> new ResourceNotFoundException("User not found"));
            Personnel probe = new Personnel();
            probe.setUser(targetUser);
            ownershipGuard.checkPersonnelAccess(probe);
            personnel.setUser(targetUser);
        }

        return personnelRepository.save(personnel);
    }

    @Transactional
    public void deletePersonnel(Long id) {
        Personnel personnel = getPersonnelById(id); // vérifie déjà la propriété
        // Payment n'a pas de cascade depuis Personnel : sans ce garde-fou, la suppression
        // échouait avec une contrainte de clé étrangère SQL non explicite (500 générique)
        // dès qu'un bulletin de paie existait pour cet employé.
        if (paymentRepo.existsByPersonnel_IdPersonnel(id)) {
            throw new BadRequestException(
                    "Cannot delete this employee: payment records exist for them. Remove or reassign their payments first.");
        }
        // Personnel.contract et Contract.personnel sont tous les deux chargés EAGER sans
        // cascade : ce cycle bidirectionnel fait paniquer la validation de flush de Hibernate
        // (TransientObjectException) au moment du DELETE si on ne le casse pas explicitement
        // en mémoire avant. Le contrat lui-même n'est pas supprimé, juste détaché.
        Contract linkedContract = personnel.getContract();
        if (linkedContract != null) {
            personnel.setContract(null);
            linkedContract.setPersonnel(null);
        }
        personnelRepository.delete(personnel);
    }

    public Personnel uploadImage(Long id, MultipartFile file) {
        Personnel personnel = getPersonnelById(id); // vérifie déjà la propriété
        String storedFilename = fileStorageService.store(file, "personnel_" + id, false);
        personnel.setImage(storedFilename);
        return personnelRepository.save(personnel);
    }

    /**
     * Self-service (EMPLOYE) : ne permet de modifier que le téléphone et le RIB — les
     * identifiants administratifs (cin, matricule, cnssNumber) restent réservés à
     * ADMIN/COMPANY via {@link #updatePersonnel}.
     */
    @Transactional
    public Personnel updateMyPersonnel(PersonnelSelfUpdateRequest request) {
        Personnel personnel = myPersonnel();
        if (!request.getRib().equals(personnel.getRib())
                && personnelRepository.findByRib(request.getRib()).isPresent()) {
            throw new BadRequestException("This bank account number (RIB) is already in use");
        }
        personnel.setTelephone(request.getTelephone());
        personnel.setRib(request.getRib());
        return personnelRepository.save(personnel);
    }

    @Transactional
    public Personnel uploadMyImage(MultipartFile file) {
        Personnel personnel = myPersonnel();
        String storedFilename = fileStorageService.store(file, "personnel_" + personnel.getIdPersonnel(), false);
        personnel.setImage(storedFilename);
        return personnelRepository.save(personnel);
    }

    private Personnel myPersonnel() {
        Long userId = ownershipGuard.currentUser().getIdUser();
        return personnelRepository.findByUser_IdUser(userId)
                .orElseThrow(() -> new ResourceNotFoundException("No personnel record found for your account"));
    }
}
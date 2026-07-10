package tn.esprit.backend.seed;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import tn.esprit.backend.dto.AuthResponse;
import tn.esprit.backend.dto.PersonnelCreateRequest;
import tn.esprit.backend.dto.RegisterRequest;
import tn.esprit.backend.entities.Absence;
import tn.esprit.backend.entities.Candidate;
import tn.esprit.backend.entities.Company;
import tn.esprit.backend.entities.Contract;
import tn.esprit.backend.entities.Enum.Role;
import tn.esprit.backend.entities.Enum.TypeContrat;
import tn.esprit.backend.entities.JobPosting;
import tn.esprit.backend.entities.Personnel;
import tn.esprit.backend.entities.User;
import tn.esprit.backend.repositories.CompanyRepo;
import tn.esprit.backend.repositories.JobPostingRepo;
import tn.esprit.backend.repositories.PersonnelRepo;
import tn.esprit.backend.repositories.UserRepository;
import tn.esprit.backend.security.SecurityUser;
import tn.esprit.backend.services.AbsenceService;
import tn.esprit.backend.services.ApplicationService;
import tn.esprit.backend.services.AuthService;
import tn.esprit.backend.services.CandidateServiceImpl;
import tn.esprit.backend.services.ContractService;
import tn.esprit.backend.services.JobPostingService;
import tn.esprit.backend.services.PersonnelService;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Peuple des données de démonstration au démarrage : personnel/contrats/absences/offres/
 * candidats pour l'entreprise {@link #TARGET_COMPANY_ID}, plus quelques offres d'emploi pour
 * les autres entreprises déjà enregistrées (pour que la vitrine publique des offres ne soit pas
 * vide). Idempotent : chaque section vérifie qu'elle n'a pas déjà été seedée avant d'écrire quoi
 * que ce soit, donc rejouable sans risque à chaque redémarrage du backend.
 *
 * <p>Les services métier existants (PersonnelService, ContractService, ...) sont réutilisés tels
 * quels pour bénéficier de leurs invariants (matricule auto-généré, salaireBase dérivé de la
 * grille salariale, vérifications d'unicité...), mais ils s'appuient tous sur OwnershipGuard qui
 * lit le SecurityContext courant — inexistant dans un CommandLineRunner. On y installe donc, le
 * temps du seeding, une authentification ADMIN factice (jamais persistée) via {@link #impersonateAdmin()}.
 */
// Désactivable/désactivé par config (voir app.seed-demo-data dans application.properties /
// application-prod.properties) : ce seeder ne doit jamais s'exécuter contre une base réelle.
@Component
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(prefix = "app", name = "seed-demo-data", havingValue = "true", matchIfMissing = true)
public class DemoDataSeeder implements CommandLineRunner {

    private static final long TARGET_COMPANY_ID = 16L;
    private static final String SEED_PASSWORD = "Demo@12345";

    private final CompanyRepo companyRepo;
    private final UserRepository userRepository;
    private final PersonnelRepo personnelRepo;
    private final JobPostingRepo jobPostingRepo;
    private final PersonnelService personnelService;
    private final ContractService contractService;
    private final AbsenceService absenceService;
    private final JobPostingService jobPostingService;
    private final AuthService authService;
    private final CandidateServiceImpl candidateService;
    private final ApplicationService applicationService;

    private record EmployeeSeed(String firstname, String lastname, String categorie, TypeContrat type, int monthsAgo) {}
    private record JobSeed(String title, String department, TypeContrat type, String description, String... skills) {}
    private record CandidateSeed(String firstname, String lastname) {}

    private static final Map<String, String> CATEGORY_JOB_TITLE = Map.of(
            "A1", "Ingénieur",
            "A2", "Cadre",
            "A3", "Technicien Supérieur",
            "B", "Agent de Maîtrise",
            "C", "Agent d'Exécution",
            "D", "Ouvrier"
    );

    private static final List<EmployeeSeed> EMPLOYEES = List.of(
            new EmployeeSeed("Ahmed", "Ben Ali", "A1", TypeContrat.CDI, 42),
            new EmployeeSeed("Sana", "Trabelsi", "A2", TypeContrat.CDI, 30),
            new EmployeeSeed("Youssef", "Gharbi", "A3", TypeContrat.CDD, 14),
            new EmployeeSeed("Amina", "Cherni", "B", TypeContrat.CDI, 24),
            new EmployeeSeed("Karim", "Jaziri", "A2", TypeContrat.CDI, 8),
            new EmployeeSeed("Mariem", "Sassi", "C", TypeContrat.CDD, 6),
            new EmployeeSeed("Bilel", "Hamdi", "A1", TypeContrat.CDI, 50),
            new EmployeeSeed("Rania", "Bouazizi", "B", TypeContrat.STAGE, 3),
            new EmployeeSeed("Walid", "Mejri", "A3", TypeContrat.CDI, 18),
            new EmployeeSeed("Nadia", "Khiari", "C", TypeContrat.CDI, 12)
    );

    private static final List<JobSeed> TARGET_COMPANY_JOBS = List.of(
            new JobSeed("Développeur Full-Stack", "IT", TypeContrat.CDI,
                    "Vous rejoignez notre équipe technique pour développer et maintenir nos applications internes.",
                    "React", "TypeScript", "Spring Boot"),
            new JobSeed("Chargé de Recrutement", "RH", TypeContrat.CDI,
                    "Vous pilotez le sourcing et le suivi des candidatures pour nos équipes en croissance.",
                    "Recrutement", "Communication"),
            new JobSeed("Comptable Senior", "Finance", TypeContrat.CDI,
                    "Vous supervisez la comptabilité générale et la paie en lien avec le service RH.",
                    "Comptabilité", "Excel", "Fiscalité")
    );

    private static final List<JobSeed> GENERIC_JOBS = List.of(
            new JobSeed("Technicien Support", "Support", TypeContrat.CDI,
                    "Vous assurez le support technique de niveau 1 et 2 auprès de nos clients.",
                    "Support client", "Dépannage"),
            new JobSeed("Commercial B2B", "Ventes", TypeContrat.CDI,
                    "Vous développez le portefeuille clients et assurez le suivi commercial.",
                    "Négociation", "CRM"),
            new JobSeed("Assistant Administratif", "Administration", TypeContrat.CDD,
                    "Vous appuyez les équipes sur la gestion administrative quotidienne.",
                    "Organisation", "Word", "Excel"),
            new JobSeed("Chef de Projet", "IT", TypeContrat.CDI,
                    "Vous pilotez des projets techniques de bout en bout, du cadrage à la livraison.",
                    "Gestion de projet", "Agile"),
            new JobSeed("Designer UI/UX", "IT", TypeContrat.PROJET,
                    "Vous concevez des interfaces utilisateurs claires et cohérentes pour nos produits.",
                    "Figma", "UI/UX")
    );

    private static final List<CandidateSeed> CANDIDATES = List.of(
            new CandidateSeed("Nour", "Khedher"),
            new CandidateSeed("Wassim", "Ferjani"),
            new CandidateSeed("Salma", "Gharsalli"),
            new CandidateSeed("Mehdi", "Chaouch"),
            new CandidateSeed("Ines", "Belhadj")
    );

    @Override
    public void run(String... args) {
        Optional<Company> targetCompanyOpt = companyRepo.findById(TARGET_COMPANY_ID);
        if (targetCompanyOpt.isEmpty()) {
            log.info("Demo seeder: no company with id {} — skipping demo data seeding.", TARGET_COMPANY_ID);
            return;
        }
        Company targetCompany = targetCompanyOpt.get();

        impersonateAdmin();
        try {
            try {
                seedPersonnelContractsAndAbsences(targetCompany);
            } catch (Exception e) {
                log.error("Demo seeder: failed to seed personnel/contracts for company {}", TARGET_COMPANY_ID, e);
            }

            List<JobPosting> targetJobs = List.of();
            try {
                targetJobs = seedJobPostingsIfMissing(targetCompany, TARGET_COMPANY_JOBS);
            } catch (Exception e) {
                log.error("Demo seeder: failed to seed job postings for company {}", TARGET_COMPANY_ID, e);
            }

            try {
                seedCandidatesAndApplications(targetJobs);
            } catch (Exception e) {
                log.error("Demo seeder: failed to seed candidates/applications", e);
            }

            try {
                seedJobPostingsForOtherCompanies();
            } catch (Exception e) {
                log.error("Demo seeder: failed to seed job postings for other companies", e);
            }
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    // ------------------------------------------------------------------
    // Company 16: personnel + contracts + absences
    // ------------------------------------------------------------------

    private void seedPersonnelContractsAndAbsences(Company company) {
        if (!personnelRepo.findByUser_Company_IdCompany(company.getIdCompany()).isEmpty()) {
            log.info("Demo seeder: personnel already present for company {} — skipping.", company.getIdCompany());
            return;
        }

        log.info("Demo seeder: creating {} employees for company {} ({}).",
                EMPLOYEES.size(), company.getIdCompany(), company.getCompanyName());

        int index = 0;
        for (EmployeeSeed seed : EMPLOYEES) {
            index++;
            Personnel personnel = createEmployeeWithContract(company, seed, index);
            seedAbsenceForEmployee(personnel, index);
        }
    }

    private Personnel createEmployeeWithContract(Company company, EmployeeSeed seed, int index) {
        String localPart = (seed.firstname() + "." + seed.lastname()).toLowerCase()
                .replace(" ", "").replace("é", "e").replace("è", "e");

        PersonnelCreateRequest request = PersonnelCreateRequest.builder()
                .firstname(seed.firstname())
                .lastname(seed.lastname())
                .email(localPart + ".seed" + index + "@humanedge-demo.tn")
                .password(SEED_PASSWORD)
                .telephone(String.format("2%08d", 10_000_000 + index))
                .cin(String.format("%08d", 90_000_000 + index))
                .cnssNumber(String.format("%08d", 80_000_000 + index))
                .rib(String.format("%020d", 1_000_000_000_000_000_000L + index))
                .companyId(company.getIdCompany())
                .build();
        Personnel personnel = personnelService.createPersonnelWithNewUser(request);

        Contract contract = new Contract();
        contract.setCategorie(seed.categorie());
        contract.setTypeContrat(seed.type());
        contract.setDateDebut(LocalDate.now().minusMonths(seed.monthsAgo()));
        contract.setWork(CATEGORY_JOB_TITLE.getOrDefault(seed.categorie(), "Employé"));
        contract.setPersonnel(personnel);
        contractService.createContract(contract);

        return personnel;
    }

    private void seedAbsenceForEmployee(Personnel personnel, int index) {
        // Alterne absence justifiée (avec un vrai fichier téléchargeable) / non justifiée, pour
        // démontrer les deux chemins (quota d'absence, déduction sur la paie) sur des données réelles.
        if (index % 2 == 0) {
            String filename = writeDemoJustificationFile(index);
            Absence absence = new Absence();
            absence.setPersonnel(personnel);
            absence.setStartDate(LocalDate.now().minusMonths(1).withDayOfMonth(3));
            absence.setEndDate(LocalDate.now().minusMonths(1).withDayOfMonth(4));
            absence.setReason("Congé maladie");
            if (filename != null) {
                absence.setJustification(filename);
            }
            absenceService.createAbsence(absence);
        } else {
            Absence absence = new Absence();
            absence.setPersonnel(personnel);
            absence.setDateAbsence(LocalDate.now().minusDays(10 + index));
            absenceService.createAbsence(absence);
        }
    }

    private String writeDemoJustificationFile(int index) {
        try {
            Path root = Paths.get("uploads");
            if (!Files.exists(root)) {
                Files.createDirectories(root);
            }
            String filename = "absence_seed_demo_" + index + ".txt";
            Files.writeString(root.resolve(filename),
                    "Justificatif d'absence genere automatiquement par les donnees de demonstration.");
            return filename;
        } catch (Exception e) {
            log.warn("Demo seeder: unable to write placeholder justification file", e);
            return null;
        }
    }

    // ------------------------------------------------------------------
    // Job postings
    // ------------------------------------------------------------------

    private List<JobPosting> seedJobPostingsIfMissing(Company company, List<JobSeed> seeds) {
        List<JobPosting> existing = jobPostingRepo.findByCreatedByCompany_IdCompany(company.getIdCompany());
        if (!existing.isEmpty()) {
            return existing;
        }

        List<JobPosting> created = new ArrayList<>();
        for (JobSeed seed : seeds) {
            JobPosting job = JobPosting.builder()
                    .title(seed.title())
                    .description(seed.description())
                    .department(seed.department())
                    .requiredSkills(List.of(seed.skills()))
                    .jobType(seed.type())
                    .deadline(LocalDateTime.now().plusMonths(2))
                    .createdByCompany(company)
                    .build();
            created.add(jobPostingService.createJobPosting(job));
        }
        log.info("Demo seeder: created {} job posting(s) for company {} ({}).",
                created.size(), company.getIdCompany(), company.getCompanyName());
        return created;
    }

    private void seedJobPostingsForOtherCompanies() {
        List<Company> others = companyRepo.findAll().stream()
                .filter(c -> !c.getIdCompany().equals(TARGET_COMPANY_ID))
                .toList();

        int cursor = 0;
        for (Company company : others) {
            if (!jobPostingRepo.findByCreatedByCompany_IdCompany(company.getIdCompany()).isEmpty()) {
                continue;
            }
            List<JobSeed> picks = new ArrayList<>();
            for (int i = 0; i < 3; i++) {
                picks.add(GENERIC_JOBS.get((cursor + i) % GENERIC_JOBS.size()));
            }
            cursor++;
            seedJobPostingsIfMissing(company, picks);
        }
    }

    // ------------------------------------------------------------------
    // Candidates + applications (company 16's own job postings)
    // ------------------------------------------------------------------

    private void seedCandidatesAndApplications(List<JobPosting> jobs) {
        if (jobs.isEmpty()) {
            log.info("Demo seeder: no job posting available to attach demo candidates to — skipping.");
            return;
        }
        if (userRepository.existsByEmail(candidateEmail(CANDIDATES.get(0), 1))) {
            log.info("Demo seeder: demo candidates already present — skipping.");
            return;
        }

        int index = 0;
        for (CandidateSeed seed : CANDIDATES) {
            index++;
            String email = candidateEmail(seed, index);

            RegisterRequest registerRequest = new RegisterRequest();
            registerRequest.setFirstname(seed.firstname());
            registerRequest.setLastname(seed.lastname());
            registerRequest.setEmail(email);
            registerRequest.setPassword(SEED_PASSWORD);
            registerRequest.setRole(Role.GUEST);
            AuthResponse auth = authService.register(registerRequest);

            User userRef = new User();
            userRef.setIdUser(auth.getIdUser());

            Candidate candidate = Candidate.builder()
                    .firstName(seed.firstname())
                    .lastName(seed.lastname())
                    .email(email)
                    .phoneNumber(String.format("2%08d", 20_000_000 + index))
                    .yearsOfExperience((index % 5) + 1)
                    .user(userRef)
                    .build();
            Candidate savedCandidate = candidateService.registerCandidate(candidate);

            JobPosting targetJob = jobs.get((index - 1) % jobs.size());
            applicationService.applyToJob(savedCandidate.getId(), targetJob.getId(),
                    "Candidature générée par les données de démonstration.");
        }
        log.info("Demo seeder: created {} candidate(s) with application(s).", CANDIDATES.size());
    }

    private String candidateEmail(CandidateSeed seed, int index) {
        return (seed.firstname() + "." + seed.lastname()).toLowerCase().replace(" ", "")
                + ".seed" + index + "@humanedge-demo.tn";
    }

    // ------------------------------------------------------------------
    // Fake ADMIN authentication (never persisted) so OwnershipGuard-protected
    // services can be reused from this non-HTTP startup context.
    // ------------------------------------------------------------------

    private void impersonateAdmin() {
        User fakeAdmin = new User();
        fakeAdmin.setIdUser(-1L);
        fakeAdmin.setFirstname("Demo");
        fakeAdmin.setLastname("Seeder");
        fakeAdmin.setEmail("demo-seeder@internal");
        fakeAdmin.setRole(Role.ADMIN);
        fakeAdmin.setEnabled(true);

        SecurityUser principal = new SecurityUser(fakeAdmin);
        Authentication authentication =
                new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
        SecurityContextHolder.getContext().setAuthentication(authentication);
    }
}

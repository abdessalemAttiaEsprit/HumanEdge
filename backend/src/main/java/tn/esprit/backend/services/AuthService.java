package tn.esprit.backend.services;

import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import tn.esprit.backend.dto.AuthResponse;
import tn.esprit.backend.dto.LoginRequest;
import tn.esprit.backend.dto.LoginResponse;
import tn.esprit.backend.dto.RegisterRequest;
import tn.esprit.backend.dto.ResendOtpRequest;
import tn.esprit.backend.dto.VerifyOtpRequest;
import tn.esprit.backend.entities.Company;
import tn.esprit.backend.entities.Enum.Role;
import tn.esprit.backend.entities.Subscription;
import tn.esprit.backend.entities.User;
import tn.esprit.backend.exceptions.BadRequestException;
import tn.esprit.backend.repositories.CompanyRepo;
import tn.esprit.backend.repositories.SubscriptionRepo;
import tn.esprit.backend.repositories.UserRepository;
import tn.esprit.backend.security.JwtService;
import tn.esprit.backend.security.RateLimiterService;
import tn.esprit.backend.security.SecurityUser;

import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final CompanyRepo companyRepo;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuthenticationManager authenticationManager;
    private final FileStorageService fileStorageService;
    private final OtpService otpService;
    private final RateLimiterService rateLimiterService;
    private final SubscriptionPlanCatalog subscriptionPlanCatalog;
    private final PaymentSimulatorService paymentSimulatorService;
    private final SubscriptionRepo subscriptionRepo;

    /**
     * Registre un nouvel utilisateur avec support d'upload de fichiers (logo, signature, et image utilisateur).
     * 
     * @param request données d'inscription
     * @param logo fichier logo de l'entreprise (optionnel)
     * @param signature fichier de signature numérique (optionnel)
     * @param userImage photo de profil de l'utilisateur (optionnel)
     * @return AuthResponse contenant le token JWT et les informations utilisateur
     */
    public AuthResponse registerWithFiles(RegisterRequest request, MultipartFile logo, MultipartFile signature, MultipartFile userImage) {
        // Self-registration must never be able to create an ADMIN (or EMPLOYE, which is only
        // ever provisioned by an already-authenticated ADMIN/COMPANY via PersonnelController)
        // account — this endpoint is fully unauthenticated (permitAll), so trusting a
        // client-supplied role here would be a complete auth bypass.
        if (request.getRole() != Role.COMPANY && request.getRole() != Role.GUEST) {
            throw new BadRequestException("Self-registration is only available for company or candidate accounts");
        }

        // 1. Vérification de l'unicité de l'email
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new BadRequestException("An account already exists with this email");
        }

        User userToSave;
        Company savedCompany = null;

        // 2. Création de l'utilisateur et/ou de l'entreprise selon le rôle
        if (request.getRole() == Role.COMPANY) {
            // Validation des champs requis pour une entreprise
            validateCompanyFields(request);

            // Vérification de l'unicité des champs spécifiques à l'entreprise
            checkCompanyUniqueness(request);

            // Paiement de l'abonnement plateforme (simulé — voir PaymentSimulatorService).
            // Fait AVANT toute création en base : une carte refusée ne doit rien laisser
            // de côté (pas de Company/User orphelin d'un abonnement jamais "payé").
            SubscriptionPlanCatalog.Plan plan = subscriptionPlanCatalog.getOrThrow(request.getSubscriptionPlan());
            PaymentSimulatorService.SimulatedCharge charge = paymentSimulatorService.charge(
                    request.getCardHolder(), request.getCardNumber(), request.getCardExpiry(),
                    request.getCardCvv(), plan.monthlyPrice());

            // Création de l'entité Company
            Company company = Company.builder()
                    .companyName(request.getCompanyName())
                    .fiscalNumber(request.getFiscalNumber())
                    .cnssNumber(request.getCnssNumber())
                    .rib(request.getRib())
                    .phone(request.getPhone())
                    .address(request.getAddress())
                    .city(request.getCity())
                    .state(request.getState())
                    .country(request.getCountry())
                    .postalCode(request.getPostalCode())
                    .verified(false)
                    .active(true)
                    .build();

            // Sauvegarde de l'entreprise
            savedCompany = companyRepo.save(company);

            Subscription subscription = Subscription.builder()
                    .company(savedCompany)
                    .plan(plan.code())
                    .amount(plan.monthlyPrice())
                    .currency("TND")
                    .status("ACTIVE")
                    .cardLast4(charge.cardLast4())
                    .transactionRef(charge.transactionRef())
                    .paidAt(LocalDateTime.now())
                    .periodEnd(LocalDateTime.now().plusMonths(1))
                    .build();
            subscriptionRepo.save(subscription);

            // Création du compte utilisateur lié à l'entreprise
            User user = new User();
            mapBaseUserFields(user, request);
            user.setCompany(savedCompany);
            userToSave = user;

        } else {
            User user = new User();
            mapBaseUserFields(user, request);
            userToSave = user;
        }

        // 3. Sauvegarde de l'utilisateur dans la base de données
        User savedUser = userRepository.save(userToSave);

        // 4. Stockage des fichiers (logo, signature et image utilisateur) si fournis
        if (request.getRole() == Role.COMPANY && savedCompany != null && savedCompany.getIdCompany() != null) {
            handleFileUploads(savedCompany, logo, signature);
        }
        
        // Stockage de l'image utilisateur si fournie
        if (userImage != null && !userImage.isEmpty() && savedUser.getIdUser() != null) {
            handleUserImageUpload(savedUser, userImage);
        }

        // 5. Génération du token et construction de la réponse
        SecurityUser securityUser = new SecurityUser(savedUser);
        return buildAuthResponse(jwtService.generateToken(securityUser), savedUser);
    }

    /**
     * Méthode héritée - registre un utilisateur sans fichiers.
     */
    public AuthResponse register(RegisterRequest request) {
        return registerWithFiles(request, null, null, null);
    }

    /**
     * Validates credentials and, for roles requiring MFA (COMPANY, ADMIN — see
     * {@link OtpService#requiresMfa}), emails a verification code instead of
     * returning a token immediately. The caller must then call {@link #verifyOtp}
     * to obtain the actual {@link AuthResponse}.
     */
    public LoginResponse login(LoginRequest request) {
        String rateLimitKey = "login:" + request.getEmail().toLowerCase();
        rateLimiterService.checkAllowed(rateLimitKey);

        try {
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(
                            request.getEmail(),
                            request.getPassword()
                    )
            );
        } catch (AuthenticationException e) {
            rateLimiterService.recordFailure(rateLimitKey);
            throw e;
        }
        rateLimiterService.recordSuccess(rateLimitKey);

        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new BadRequestException("User not found"));

        if (OtpService.requiresMfa(user.getRole())) {
            otpService.generateAndSendOtp(user.getEmail());
            return LoginResponse.builder()
                    .mfaRequired(true)
                    .maskedEmail(maskEmail(user.getEmail()))
                    .build();
        }

        SecurityUser securityUser = new SecurityUser(user);
        AuthResponse auth = buildAuthResponse(jwtService.generateToken(securityUser), user);
        return LoginResponse.builder().mfaRequired(false).auth(auth).build();
    }

    /** Completes the MFA login flow: verifies the code and issues the real JWT. */
    public AuthResponse verifyOtp(VerifyOtpRequest request) {
        String rateLimitKey = "otp:" + request.getEmail().toLowerCase();
        rateLimiterService.checkAllowed(rateLimitKey);

        try {
            otpService.verifyOtp(request.getEmail(), request.getCode());
        } catch (BadRequestException e) {
            rateLimiterService.recordFailure(rateLimitKey);
            throw e;
        }
        rateLimiterService.recordSuccess(rateLimitKey);

        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new BadRequestException("User not found"));

        SecurityUser securityUser = new SecurityUser(user);
        return buildAuthResponse(jwtService.generateToken(securityUser), user);
    }

    /**
     * Sends a fresh verification code. Always responds the same way regardless of
     * whether the email exists or requires MFA, to avoid leaking account existence.
     */
    public void resendOtp(ResendOtpRequest request) {
        userRepository.findByEmail(request.getEmail())
                .filter(user -> OtpService.requiresMfa(user.getRole()))
                .ifPresent(user -> otpService.generateAndSendOtp(user.getEmail()));
    }

    private String maskEmail(String email) {
        int at = email.indexOf('@');
        if (at <= 1) {
            return email;
        }
        return email.charAt(0) + "***" + email.substring(at);
    }

    // ==================== Méthodes privées ====================

    private void validateCompanyFields(RegisterRequest request) {
        if (request.getCompanyName() == null || request.getCompanyName().isBlank()) {
            throw new BadRequestException("Company name is required");
        }
        if (request.getFiscalNumber() == null || request.getFiscalNumber().isBlank()) {
            throw new BadRequestException("Fiscal number is required");
        }
        if (request.getCnssNumber() == null || request.getCnssNumber().isBlank()) {
            throw new BadRequestException("CNSS number is required");
        }
        if (request.getRib() == null || request.getRib().isBlank()) {
            throw new BadRequestException("Bank account number (RIB) is required");
        }
    }

    private void checkCompanyUniqueness(RegisterRequest request) {
        if (companyRepo.existsByFiscalNumber(request.getFiscalNumber())) {
            throw new BadRequestException("This fiscal number is already in use");
        }
        if (companyRepo.existsByCnssNumber(request.getCnssNumber())) {
            throw new BadRequestException("This CNSS number is already in use");
        }
        if (companyRepo.existsByRib(request.getRib())) {
            throw new BadRequestException("This bank account number (RIB) is already in use");
        }
    }

    private void handleFileUploads(Company company, MultipartFile logo, MultipartFile signature) {
        String companyPrefix = "company_" + company.getIdCompany();
        boolean companyUpdated = false;

        try {
            // Stockage du logo
            if (logo != null && !logo.isEmpty()) {
                String logoFilename = fileStorageService.store(logo, companyPrefix + "_logo", true);
                company.setLogoUrl(logoFilename);
                companyUpdated = true;
            }

            // Stockage de la signature numérique
            if (signature != null && !signature.isEmpty()) {
                String signatureFilename = fileStorageService.store(signature, companyPrefix + "_signature", false);
                company.setSignatureFileName(signatureFilename);
                companyUpdated = true;
            }

            // Sauvegarde uniquement si des modifications ont été apportées
            if (companyUpdated) {
                companyRepo.save(company);
            }
        } catch (Exception e) {
            // En cas d'erreur de stockage de fichier, on log mais on ne bloque pas l'inscription
            // Les fichiers pourront être ajoutés plus tard via une interface de profil
            System.err.println("Erreur lors du stockage des fichiers : " + e.getMessage());
        }
    }

    private AuthResponse buildAuthResponse(String token, User user) {
        String displayFirstname = user.getFirstname();
        String displayLastname = user.getLastname();
        Long companyId = null;
        String img = user.getImg();

        if (user.getRole() == Role.COMPANY && user.getCompany() != null) {
            displayFirstname = user.getCompany().getCompanyName();
            displayLastname = "";
            companyId = user.getCompany().getIdCompany();
        }

        return AuthResponse.builder()
                .token(token)
                .idUser(user.getIdUser())
                .firstname(displayFirstname)
                .lastname(displayLastname)
                .email(user.getEmail())
                .role(user.getRole())
                .companyId(companyId)
                .img(img)
                .build();
    }

    private void handleUserImageUpload(User user, MultipartFile userImage) {
        String userPrefix = "user_" + user.getIdUser();

        try {
            // Stockage de l'image utilisateur
            if (userImage != null && !userImage.isEmpty()) {
                String imageFilename = fileStorageService.store(userImage, userPrefix + "_avatar", true);
                user.setImg(imageFilename);
                userRepository.save(user);
            }
        } catch (Exception e) {
            // En cas d'erreur de stockage d'image, on log mais on ne bloque pas
            System.err.println("Erreur lors du stockage de l'image utilisateur : " + e.getMessage());
        }
    }

    private void mapBaseUserFields(User user, RegisterRequest request) {
        user.setFirstname(request.getFirstname());
        user.setLastname(request.getLastname());
        user.setEmail(request.getEmail());
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        user.setRole(request.getRole() != null ? request.getRole() : Role.GUEST);
        user.setEnabled(true);
    }
}

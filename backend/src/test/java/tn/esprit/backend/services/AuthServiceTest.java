package tn.esprit.backend.services;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import tn.esprit.backend.dto.AuthResponse;
import tn.esprit.backend.dto.LoginRequest;
import tn.esprit.backend.dto.LoginResponse;
import tn.esprit.backend.dto.RegisterRequest;
import tn.esprit.backend.dto.ResendOtpRequest;
import tn.esprit.backend.dto.VerifyOtpRequest;
import tn.esprit.backend.entities.Company;
import tn.esprit.backend.entities.Enum.Role;
import tn.esprit.backend.entities.User;
import tn.esprit.backend.exceptions.BadRequestException;
import tn.esprit.backend.repositories.CompanyRepo;
import tn.esprit.backend.repositories.SubscriptionRepo;
import tn.esprit.backend.repositories.UserRepository;
import tn.esprit.backend.security.JwtService;
import tn.esprit.backend.security.RateLimiterService;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Couvre les règles de sécurité d'AuthService qui ne sont pas déjà testées ailleurs : le
 * garde-fou anti-bypass de rôle à l'auto-inscription, l'unicité email/entreprise, et
 * l'aiguillage MFA du login (voir OtpServiceTest pour le détail de l'OTP lui-même).
 */
@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private CompanyRepo companyRepo;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private JwtService jwtService;
    @Mock private AuthenticationManager authenticationManager;
    @Mock private FileStorageService fileStorageService;
    @Mock private OtpService otpService;
    @Mock private RateLimiterService rateLimiterService;
    @Mock private SubscriptionRepo subscriptionRepo;

    private AuthService authService;

    @BeforeEach
    void setUp() {
        authService = new AuthService(userRepository, companyRepo, passwordEncoder, jwtService,
                authenticationManager, fileStorageService, otpService, rateLimiterService,
                new SubscriptionPlanCatalog(), new PaymentSimulatorService(), subscriptionRepo);
    }

    private RegisterRequest guestRequest() {
        RegisterRequest request = new RegisterRequest();
        request.setFirstname("Jane");
        request.setLastname("Doe");
        request.setEmail("jane@demo.tn");
        request.setPassword("Secret123!");
        request.setRole(Role.GUEST);
        return request;
    }

    private RegisterRequest companyRequest() {
        RegisterRequest request = new RegisterRequest();
        request.setFirstname("Owner");
        request.setLastname("Account");
        request.setEmail("company@demo.tn");
        request.setPassword("Secret123!");
        request.setRole(Role.COMPANY);
        request.setCompanyName("HumanEdge Demo SARL");
        request.setFiscalNumber("FN123");
        request.setCnssNumber("CNSS123");
        request.setRib("RIB123");
        request.setSubscriptionPlan("STARTER");
        request.setCardHolder("Owner Account");
        request.setCardNumber("4242 4242 4242 4242"); // carte de test, passe Luhn
        request.setCardExpiry("12/35");
        request.setCardCvv("123");
        return request;
    }

    // ---- registerWithFiles : anti-bypass de rôle ----

    @Test
    void selfRegistrationRejectsAnAdminRole() {
        RegisterRequest request = guestRequest();
        request.setRole(Role.ADMIN);

        assertThatThrownBy(() -> authService.register(request)).isInstanceOf(BadRequestException.class);
        verify(userRepository, never()).save(any());
    }

    @Test
    void selfRegistrationRejectsAnEmployeRole() {
        RegisterRequest request = guestRequest();
        request.setRole(Role.EMPLOYE);

        assertThatThrownBy(() -> authService.register(request)).isInstanceOf(BadRequestException.class);
        verify(userRepository, never()).save(any());
    }

    @Test
    void registrationRejectsAnEmailAlreadyInUse() {
        RegisterRequest request = guestRequest();
        when(userRepository.existsByEmail("jane@demo.tn")).thenReturn(true);

        assertThatThrownBy(() -> authService.register(request)).isInstanceOf(BadRequestException.class);
        verify(userRepository, never()).save(any());
    }

    @Test
    void registersAGuestAccountWithAnEncodedPassword() {
        RegisterRequest request = guestRequest();
        when(userRepository.existsByEmail("jane@demo.tn")).thenReturn(false);
        when(passwordEncoder.encode("Secret123!")).thenReturn("ENCODED");
        when(userRepository.save(any())).thenAnswer(inv -> {
            User u = inv.getArgument(0);
            u.setIdUser(1L);
            return u;
        });
        when(jwtService.generateToken(any())).thenReturn("token123");

        AuthResponse response = authService.register(request);

        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(captor.capture());
        assertThat(captor.getValue().getPassword()).isEqualTo("ENCODED");
        assertThat(captor.getValue().getRole()).isEqualTo(Role.GUEST);
        assertThat(captor.getValue().isEnabled()).isTrue();
        assertThat(response.getToken()).isEqualTo("token123");
        assertThat(response.getEmail()).isEqualTo("jane@demo.tn");
    }

    // ---- registerWithFiles : inscription entreprise ----

    @Test
    void companyRegistrationRequiresTheMandatoryCompanyFields() {
        RegisterRequest request = companyRequest();
        request.setFiscalNumber(null);

        assertThatThrownBy(() -> authService.register(request)).isInstanceOf(BadRequestException.class);
        verify(companyRepo, never()).save(any());
    }

    @Test
    void companyRegistrationRejectsADuplicateFiscalNumber() {
        RegisterRequest request = companyRequest();
        when(companyRepo.existsByFiscalNumber("FN123")).thenReturn(true);

        assertThatThrownBy(() -> authService.register(request)).isInstanceOf(BadRequestException.class);
        verify(companyRepo, never()).save(any());
    }

    @Test
    void companyRegistrationRejectsAnInvalidSubscriptionPlan() {
        RegisterRequest request = companyRequest();
        request.setSubscriptionPlan("NOT_A_PLAN");

        assertThatThrownBy(() -> authService.register(request)).isInstanceOf(BadRequestException.class);
        verify(companyRepo, never()).save(any());
    }

    @Test
    void companyRegistrationRejectsADeclinedTestCardWithoutCreatingAnything() {
        RegisterRequest request = companyRequest();
        request.setCardNumber("4000000000000002"); // suffixe de test "refusé" (voir PaymentSimulatorService)

        assertThatThrownBy(() -> authService.register(request)).isInstanceOf(BadRequestException.class);
        verify(companyRepo, never()).save(any());
        verify(userRepository, never()).save(any());
    }

    @Test
    void companyRegistrationCreatesTheCompanySubscriptionAndOwnerAccount() {
        RegisterRequest request = companyRequest();
        Company savedCompany = Company.builder().idCompany(7L).companyName("HumanEdge Demo SARL").build();
        when(companyRepo.save(any())).thenReturn(savedCompany);
        when(userRepository.save(any())).thenAnswer(inv -> {
            User u = inv.getArgument(0);
            u.setIdUser(1L);
            return u;
        });
        when(jwtService.generateToken(any())).thenReturn("token123");

        AuthResponse response = authService.register(request);

        verify(subscriptionRepo).save(any());
        assertThat(response.getCompanyId()).isEqualTo(7L);
        // buildAuthResponse affiche le nom de l'entreprise plutôt que le prénom/nom du signataire.
        assertThat(response.getFirstname()).isEqualTo("HumanEdge Demo SARL");
        assertThat(response.getLastname()).isEmpty();
    }

    // ---- login ----

    @Test
    void loginRecordsAFailureAndRethrowsOnBadCredentials() {
        LoginRequest request = new LoginRequest();
        request.setEmail("jane@demo.tn");
        request.setPassword("wrong");
        org.mockito.Mockito.doThrow(new BadCredentialsException("bad"))
                .when(authenticationManager).authenticate(any());

        assertThatThrownBy(() -> authService.login(request)).isInstanceOf(BadCredentialsException.class);

        verify(rateLimiterService).recordFailure("login:jane@demo.tn");
        verify(rateLimiterService, never()).recordSuccess(anyString());
    }

    @Test
    void loginRequiresMfaForACompanyAccountAndMasksTheEmail() {
        LoginRequest request = new LoginRequest();
        request.setEmail("company@demo.tn");
        request.setPassword("Secret123!");
        User companyUser = User.builder().idUser(1L).email("company@demo.tn").role(Role.COMPANY).build();
        when(userRepository.findByEmail("company@demo.tn")).thenReturn(Optional.of(companyUser));

        LoginResponse response = authService.login(request);

        assertThat(response.isMfaRequired()).isTrue();
        assertThat(response.getMaskedEmail()).isEqualTo("c***@demo.tn");
        assertThat(response.getAuth()).isNull();
        verify(otpService).generateAndSendOtp("company@demo.tn");
        verify(rateLimiterService).recordSuccess("login:company@demo.tn");
        verify(jwtService, never()).generateToken(any());
    }

    @Test
    void loginSkipsMfaForNonCompanyRolesAndReturnsATokenImmediately() {
        LoginRequest request = new LoginRequest();
        request.setEmail("admin@demo.tn");
        request.setPassword("Secret123!");
        User adminUser = User.builder().idUser(1L).email("admin@demo.tn").role(Role.ADMIN).build();
        when(userRepository.findByEmail("admin@demo.tn")).thenReturn(Optional.of(adminUser));
        when(jwtService.generateToken(any())).thenReturn("token123");

        LoginResponse response = authService.login(request);

        assertThat(response.isMfaRequired()).isFalse();
        assertThat(response.getAuth()).isNotNull();
        assertThat(response.getAuth().getToken()).isEqualTo("token123");
        verify(otpService, never()).generateAndSendOtp(anyString());
    }

    // ---- verifyOtp ----

    @Test
    void verifyOtpRecordsAFailureAndRethrowsOnAnInvalidCode() {
        VerifyOtpRequest request = new VerifyOtpRequest();
        request.setEmail("company@demo.tn");
        request.setCode("000000");
        org.mockito.Mockito.doThrow(new BadRequestException("Invalid or expired verification code"))
                .when(otpService).verifyOtp("company@demo.tn", "000000");

        assertThatThrownBy(() -> authService.verifyOtp(request)).isInstanceOf(BadRequestException.class);

        verify(rateLimiterService).recordFailure("otp:company@demo.tn");
        verify(userRepository, never()).findByEmail(anyString());
    }

    @Test
    void verifyOtpIssuesATokenOnceTheCodeIsValid() {
        VerifyOtpRequest request = new VerifyOtpRequest();
        request.setEmail("company@demo.tn");
        request.setCode("123456");
        User companyUser = User.builder().idUser(1L).email("company@demo.tn").role(Role.COMPANY).build();
        when(userRepository.findByEmail("company@demo.tn")).thenReturn(Optional.of(companyUser));
        when(jwtService.generateToken(any())).thenReturn("token123");

        AuthResponse response = authService.verifyOtp(request);

        assertThat(response.getToken()).isEqualTo("token123");
        verify(rateLimiterService).recordSuccess("otp:company@demo.tn");
    }

    // ---- resendOtp ----

    @Test
    void resendOtpDoesNothingForAnUnknownEmail() {
        ResendOtpRequest request = new ResendOtpRequest();
        request.setEmail("nobody@demo.tn");
        when(userRepository.findByEmail("nobody@demo.tn")).thenReturn(Optional.empty());

        authService.resendOtp(request);

        verify(otpService, never()).generateAndSendOtp(anyString());
    }

    @Test
    void resendOtpDoesNothingForARoleThatDoesNotRequireMfa() {
        ResendOtpRequest request = new ResendOtpRequest();
        request.setEmail("admin@demo.tn");
        when(userRepository.findByEmail("admin@demo.tn"))
                .thenReturn(Optional.of(User.builder().email("admin@demo.tn").role(Role.ADMIN).build()));

        authService.resendOtp(request);

        verify(otpService, never()).generateAndSendOtp(anyString());
    }

    @Test
    void resendOtpSendsAFreshCodeForACompanyAccount() {
        ResendOtpRequest request = new ResendOtpRequest();
        request.setEmail("company@demo.tn");
        when(userRepository.findByEmail("company@demo.tn"))
                .thenReturn(Optional.of(User.builder().email("company@demo.tn").role(Role.COMPANY).build()));

        authService.resendOtp(request);

        verify(otpService, times(1)).generateAndSendOtp("company@demo.tn");
    }
}

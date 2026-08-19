package tn.esprit.backend.services;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;
import tn.esprit.backend.entities.Company;
import tn.esprit.backend.entities.Contract;
import tn.esprit.backend.entities.Payment;
import tn.esprit.backend.entities.Personnel;
import tn.esprit.backend.entities.User;
import tn.esprit.backend.exceptions.BadRequestException;
import tn.esprit.backend.repositories.ContractRepo;
import tn.esprit.backend.repositories.PaymentRepo;
import tn.esprit.backend.repositories.PersonnelRepo;
import tn.esprit.backend.repositories.UserRepository;
import tn.esprit.backend.security.OwnershipGuard;

import java.time.LocalDate;
import java.time.Month;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Couvre les règles métier de PaymentService qui ne sont pas de simples pass-through CRUD :
 * les gardes de suppression et de modification (un bulletin VALIDATED ne se supprime ni ne se
 * modifie jamais), l'idempotence de la génération automatique de la paie, et le fait que la
 * vérification d'accès à la création recharge toujours l'entité réelle plutôt que de faire
 * confiance au JSON du client.
 */
@ExtendWith(MockitoExtension.class)
class PaymentServiceTest {

    @Mock private PaymentRepo paymentRepository;
    @Mock private PersonnelRepo personnelRepository;
    @Mock private ContractRepo contractRepository;
    @Mock private UserRepository userRepository;
    @Mock private OwnershipGuard ownershipGuard;
    @Mock private PaymentEmailNotificationService paymentEmailNotificationService;
    @Mock private GoogleCalendarSyncService googleCalendarSyncService;

    private PaymentService paymentService;

    @BeforeEach
    void setUp() {
        paymentService = new PaymentService(paymentRepository, personnelRepository, contractRepository, userRepository,
                ownershipGuard, paymentEmailNotificationService, new PaymentSuggestionService(),
                new SalaryCalculationService(), googleCalendarSyncService);
        // Atteint par syncPaymentToGoogleCalendar (validatePayment retombe sur LocalDate.now() si
        // aucune date de paiement) mais pas par tous les tests - lenient() pour ne pas déclencher
        // UnnecessaryStubbingException sur ceux qui n'atteignent pas ce chemin.
        lenient().when(userRepository.findByCompany_IdCompany(anyLong())).thenReturn(List.of());
    }

    private Payment paymentWithStatus(String status) {
        Company company = Company.builder().idCompany(1L).build();
        Personnel personnel = Personnel.builder()
                .idPersonnel(1L)
                .user(User.builder().idUser(1L).company(company).build())
                .build();
        return Payment.builder().id(1L).status(status).personnel(personnel).company(company).build();
    }

    // ---- deletePayment ----

    @Test
    void deletePaymentRejectsAValidatedPayment() {
        Payment validated = paymentWithStatus("VALIDATED");
        when(paymentRepository.findById(1L)).thenReturn(Optional.of(validated));

        assertThatThrownBy(() -> paymentService.deletePayment(1L))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("validated");

        verify(paymentRepository, never()).delete(any());
    }

    @Test
    void deletePaymentAllowsADraftPayment() {
        Payment draft = paymentWithStatus("DRAFT");
        when(paymentRepository.findById(1L)).thenReturn(Optional.of(draft));

        paymentService.deletePayment(1L);

        verify(paymentRepository).delete(draft);
    }

    // ---- updatePayment ----

    @Test
    void updatePaymentRejectsAValidatedPayment() {
        Payment validated = paymentWithStatus("VALIDATED");
        when(paymentRepository.findById(1L)).thenReturn(Optional.of(validated));

        assertThatThrownBy(() -> paymentService.updatePayment(1L, new Payment()))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("validated");

        verify(paymentRepository, never()).save(any());
    }

    // ---- getAllPayments / getPaymentById ----

    @Test
    void adminSeesAllPaymentsAcrossCompanies() {
        when(ownershipGuard.isAdmin()).thenReturn(true);
        when(paymentRepository.findAll()).thenReturn(List.of(paymentWithStatus("DRAFT")));

        List<Payment> result = paymentService.getAllPayments();

        assertThat(result).hasSize(1);
        verify(paymentRepository, never()).findByCompany_IdCompany(any());
    }

    @Test
    void companyOnlySeesItsOwnPayments() {
        when(ownershipGuard.isAdmin()).thenReturn(false);
        when(ownershipGuard.currentCompanyId()).thenReturn(10L);
        when(paymentRepository.findByCompany_IdCompany(10L)).thenReturn(List.of());

        paymentService.getAllPayments();

        verify(paymentRepository).findByCompany_IdCompany(10L);
        verify(paymentRepository, never()).findAll();
    }

    @Test
    void getPaymentByIdDeniesAccessWhenOwnershipGuardRejectsIt() {
        Payment payment = paymentWithStatus("DRAFT");
        when(paymentRepository.findById(1L)).thenReturn(Optional.of(payment));
        when(ownershipGuard.isAdmin()).thenReturn(false);
        doThrow(new AccessDeniedException("no")).when(ownershipGuard).checkPersonnelAccess(payment.getPersonnel());

        assertThatThrownBy(() -> paymentService.getPaymentById(1L)).isInstanceOf(AccessDeniedException.class);
    }

    // ---- createPayment : la sécurité repose sur le rechargement du Personnel réel ----

    @Test
    void createPaymentReloadsTheRealPersonnelInsteadOfTrustingTheClientPayload() {
        Personnel realPersonnel = Personnel.builder()
                .idPersonnel(5L)
                .user(User.builder().idUser(9L).company(Company.builder().idCompany(1L).build()).build())
                .build();
        when(ownershipGuard.isAdmin()).thenReturn(false);
        when(personnelRepository.findById(5L)).thenReturn(Optional.of(realPersonnel));
        when(paymentRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // Le client n'envoie qu'un Personnel "coquille" avec juste l'id.
        Payment incoming = Payment.builder()
                .status("DRAFT")
                .personnel(Personnel.builder().idPersonnel(5L).build())
                .build();

        paymentService.createPayment(incoming);

        verify(ownershipGuard).checkPersonnelAccess(realPersonnel);
        verify(paymentRepository).save(incoming);
    }

    @Test
    void createPaymentRejectsAPaymentWithNeitherPersonnelNorCompany() {
        when(ownershipGuard.isAdmin()).thenReturn(false);

        assertThatThrownBy(() -> paymentService.createPayment(Payment.builder().status("DRAFT").build()))
                .isInstanceOf(AccessDeniedException.class);
    }

    // ---- validatePayment ----

    @Test
    void validatePaymentSetsStatusAndNotifiesTheEmployee() {
        Payment draft = paymentWithStatus("DRAFT");
        when(paymentRepository.findById(1L)).thenReturn(Optional.of(draft));
        when(ownershipGuard.isAdmin()).thenReturn(true);
        when(paymentRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Payment result = paymentService.validatePayment(1L);

        assertThat(result.getStatus()).isEqualTo("VALIDATED");
        verify(paymentEmailNotificationService).notifyPaymentValidated(eq(draft.getPersonnel()), eq(draft));
    }

    // ---- generateMonthlyPayroll ----

    @Test
    void generateMonthlyPayrollRequiresACompanyIdForNonAdmins() {
        when(ownershipGuard.isAdmin()).thenReturn(false);
        when(ownershipGuard.currentCompanyId()).thenReturn(null);

        assertThatThrownBy(() -> paymentService.generateMonthlyPayroll(Month.JANUARY, 2026, null))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("not linked to a company");
    }

    @Test
    void generateMonthlyPayrollRequiresAnExplicitCompanyIdForAdmins() {
        when(ownershipGuard.isAdmin()).thenReturn(true);

        assertThatThrownBy(() -> paymentService.generateMonthlyPayroll(Month.JANUARY, 2026, null))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("companyId is required");
    }

    @Test
    void generateMonthlyPayrollSkipsEmployeesWithoutAnActiveContractThatMonth() {
        when(ownershipGuard.isAdmin()).thenReturn(false);
        when(ownershipGuard.currentCompanyId()).thenReturn(1L);

        Personnel noContract = Personnel.builder().idPersonnel(1L)
                .user(User.builder().company(Company.builder().idCompany(1L).build()).build()).build();
        Personnel endedContract = Personnel.builder().idPersonnel(2L)
                .user(User.builder().company(Company.builder().idCompany(1L).build()).build())
                .contract(Contract.builder().dateDebut(LocalDate.of(2024, 1, 1)).dateFin(LocalDate.of(2025, 12, 1)).build())
                .build();
        when(personnelRepository.findByUser_Company_IdCompany(1L)).thenReturn(List.of(noContract, endedContract));

        PaymentService.PayrollGenerationSummary summary =
                paymentService.generateMonthlyPayroll(Month.JANUARY, 2026, null);

        assertThat(summary.skippedNoActiveContract()).isEqualTo(2);
        assertThat(summary.created()).isEmpty();
        verify(paymentRepository, never()).save(any());
    }

    @Test
    void generateMonthlyPayrollIsIdempotentForAnAlreadyGeneratedMonth() {
        when(ownershipGuard.isAdmin()).thenReturn(false);
        when(ownershipGuard.currentCompanyId()).thenReturn(1L);

        Personnel personnel = Personnel.builder().idPersonnel(1L)
                .user(User.builder().company(Company.builder().idCompany(1L).build()).build())
                .contract(Contract.builder().dateDebut(LocalDate.of(2024, 1, 1)).salaireBase(1000.0).build())
                .build();
        when(personnelRepository.findByUser_Company_IdCompany(1L)).thenReturn(List.of(personnel));
        when(paymentRepository.existsByPersonnel_IdPersonnelAndMonthAndYear(1L, Month.JANUARY, 2026)).thenReturn(true);

        PaymentService.PayrollGenerationSummary summary =
                paymentService.generateMonthlyPayroll(Month.JANUARY, 2026, null);

        assertThat(summary.alreadyGenerated()).isEqualTo(1);
        assertThat(summary.created()).isEmpty();
        verify(paymentRepository, never()).save(any());
    }

    @Test
    void generateMonthlyPayrollCreatesADraftPaymentWithTheComputedSalaryBreakdown() {
        when(ownershipGuard.isAdmin()).thenReturn(false);
        when(ownershipGuard.currentCompanyId()).thenReturn(1L);

        Company company = Company.builder().idCompany(1L).build();
        Contract contract = Contract.builder().dateDebut(LocalDate.of(2024, 1, 1)).salaireBase(1000.0).build();
        Personnel personnel = Personnel.builder().idPersonnel(1L)
                .user(User.builder().company(company).build())
                .contract(contract)
                .absences(List.of())
                .build();
        when(personnelRepository.findByUser_Company_IdCompany(1L)).thenReturn(List.of(personnel));
        when(paymentRepository.existsByPersonnel_IdPersonnelAndMonthAndYear(1L, Month.JANUARY, 2026)).thenReturn(false);
        when(paymentRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        PaymentService.PayrollGenerationSummary summary =
                paymentService.generateMonthlyPayroll(Month.JANUARY, 2026, null);

        assertThat(summary.created()).hasSize(1);
        Payment created = summary.created().get(0);
        assertThat(created.getStatus()).isEqualTo("DRAFT");
        assertThat(created.getMonth()).isEqualTo(Month.JANUARY);
        assertThat(created.getYear()).isEqualTo(2026);
        // Salaire de base 1000, pas d'absence, pas d'avantages -> même résultat que
        // SalaryCalculationServiceTest#computesBreakdownWithoutAbsencesInTheZeroPercentBracket.
        assertThat(created.getMontantCnss()).isCloseTo(91.8, org.assertj.core.data.Offset.offset(0.001));
        assertThat(created.getPayed()).isCloseTo(804.015, org.assertj.core.data.Offset.offset(0.001));
        assertThat(created.getJustifiedAbsenceDays()).isZero();
        assertThat(created.getUnjustifiedAbsenceDays()).isZero();
    }

    @Test
    void generateMonthlyPayrollIgnoresLeaveRequestsThatAreNotYetApproved() {
        when(ownershipGuard.isAdmin()).thenReturn(false);
        when(ownershipGuard.currentCompanyId()).thenReturn(1L);

        Company company = Company.builder().idCompany(1L).build();
        Contract contract = Contract.builder().dateDebut(LocalDate.of(2024, 1, 1)).salaireBase(1000.0).build();
        // Une demande PENDING (pas encore décidée) et une REJECTED tombant dans le mois : ni l'une
        // ni l'autre ne doit réduire la paie, même si elles ont un justificatif.
        tn.esprit.backend.entities.Absence pending = tn.esprit.backend.entities.Absence.builder()
                .dateAbsence(LocalDate.of(2026, 1, 10))
                .status(tn.esprit.backend.entities.Enum.AbsenceStatus.PENDING)
                .build();
        tn.esprit.backend.entities.Absence rejected = tn.esprit.backend.entities.Absence.builder()
                .dateAbsence(LocalDate.of(2026, 1, 11))
                .status(tn.esprit.backend.entities.Enum.AbsenceStatus.REJECTED)
                .build();
        Personnel personnel = Personnel.builder().idPersonnel(1L)
                .user(User.builder().company(company).build())
                .contract(contract)
                .absences(List.of(pending, rejected))
                .build();
        when(personnelRepository.findByUser_Company_IdCompany(1L)).thenReturn(List.of(personnel));
        when(paymentRepository.existsByPersonnel_IdPersonnelAndMonthAndYear(1L, Month.JANUARY, 2026)).thenReturn(false);
        when(paymentRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        PaymentService.PayrollGenerationSummary summary =
                paymentService.generateMonthlyPayroll(Month.JANUARY, 2026, null);

        Payment created = summary.created().get(0);
        // Même résultat que le cas "pas d'absence du tout" : rien n'est APPROVED, donc rien ne compte.
        assertThat(created.getJustifiedAbsenceDays()).isZero();
        assertThat(created.getUnjustifiedAbsenceDays()).isZero();
        assertThat(created.getPayed()).isCloseTo(804.015, org.assertj.core.data.Offset.offset(0.001));
    }

    @Test
    void generateMonthlyPayrollPersistsTheAutomaticEchelonAdvancement() {
        when(ownershipGuard.isAdmin()).thenReturn(false);
        when(ownershipGuard.currentCompanyId()).thenReturn(1L);

        // Ancienneté calculée par rapport à "aujourd'hui" (voir PaymentSuggestionService) : on
        // génère donc la paie du mois courant plutôt qu'un mois fixe, pour que le contrat reste
        // actif quelle que soit la date d'exécution du test.
        java.time.YearMonth currentMonth = java.time.YearMonth.now();
        Contract contract = Contract.builder()
                .dateDebut(LocalDate.now().minusYears(3))
                .categorie("A2")
                .build(); // pas encore d'échelon -> applyAutomaticEchelon doit le calculer
        Personnel personnel = Personnel.builder().idPersonnel(1L)
                .user(User.builder().company(Company.builder().idCompany(1L).build()).build())
                .contract(contract)
                .absences(List.of())
                .build();
        when(personnelRepository.findByUser_Company_IdCompany(1L)).thenReturn(List.of(personnel));
        when(paymentRepository.existsByPersonnel_IdPersonnelAndMonthAndYear(
                1L, currentMonth.getMonth(), currentMonth.getYear())).thenReturn(false);
        when(paymentRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        paymentService.generateMonthlyPayroll(currentMonth.getMonth(), currentMonth.getYear(), null);

        // 3 ans d'ancienneté -> échelon 1 + 3/2 = 2 pour la catégorie A2.
        assertThat(contract.getEchelon()).isEqualTo(2);
        assertThat(contract.getSalaireBase()).isEqualTo(1550.000);
        verify(contractRepository).save(contract);
    }
}

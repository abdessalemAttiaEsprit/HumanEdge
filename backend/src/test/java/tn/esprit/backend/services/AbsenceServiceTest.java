package tn.esprit.backend.services;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;
import tn.esprit.backend.entities.Absence;
import tn.esprit.backend.entities.Company;
import tn.esprit.backend.entities.Enum.AbsenceStatus;
import tn.esprit.backend.entities.Enum.Role;
import tn.esprit.backend.entities.Personnel;
import tn.esprit.backend.entities.User;
import tn.esprit.backend.exceptions.BadRequestException;
import tn.esprit.backend.repositories.AbsenceRepo;
import tn.esprit.backend.repositories.PersonnelRepo;
import tn.esprit.backend.repositories.UserRepository;
import tn.esprit.backend.security.OwnershipGuard;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Couvre le workflow de demande de congé : une demande soumise par l'employé démarre PENDING
 * (et ne peut jamais s'auto-approuver, même en forçant le champ status dans le payload), une
 * saisie par COMPANY/ADMIN reste immédiatement APPROVED comme avant ce workflow, et seule une
 * demande PENDING peut être décidée.
 */
@ExtendWith(MockitoExtension.class)
class AbsenceServiceTest {

    @Mock private AbsenceRepo absenceRepository;
    @Mock private PersonnelRepo personnelRepository;
    @Mock private UserRepository userRepository;
    @Mock private OwnershipGuard ownershipGuard;
    @Mock private NotificationService notificationService;
    @Mock private FileStorageService fileStorageService;

    private AbsenceService absenceService;

    @BeforeEach
    void setUp() {
        absenceService = new AbsenceService(absenceRepository, personnelRepository, userRepository,
                ownershipGuard, new AbsenceQuotaCalculator(), fileStorageService, notificationService);
    }

    private Personnel personnelInCompany(long companyId) {
        Company company = Company.builder().idCompany(companyId).build();
        User user = User.builder().idUser(1L).firstname("Jane").lastname("Doe").company(company).build();
        return Personnel.builder().idPersonnel(1L).user(user).build();
    }

    private Personnel personnelWithDepartment(long personnelId, String firstname, String lastname, String department) {
        Company company = Company.builder().idCompany(10L).build();
        User user = User.builder().idUser(personnelId).firstname(firstname).lastname(lastname).company(company).build();
        return Personnel.builder().idPersonnel(personnelId).user(user).department(department).build();
    }

    // ---- getAllAbsences : détection de chevauchement au sein d'un même département ----

    @Test
    void getAllAbsencesFlagsOverlappingLeaveInTheSameDepartment() {
        when(ownershipGuard.isAdmin()).thenReturn(false);
        when(ownershipGuard.currentCompanyId()).thenReturn(10L);

        Personnel alice = personnelWithDepartment(1L, "Alice", "A", "Sales");
        Personnel bob = personnelWithDepartment(2L, "Bob", "B", "Sales");
        Absence aliceLeave = Absence.builder().idAbsence(100L).personnel(alice)
                .startDate(LocalDate.of(2026, 3, 10)).endDate(LocalDate.of(2026, 3, 15)).build();
        Absence bobLeave = Absence.builder().idAbsence(101L).personnel(bob)
                .startDate(LocalDate.of(2026, 3, 12)).endDate(LocalDate.of(2026, 3, 20)).build();
        when(absenceRepository.findByPersonnel_User_Company_IdCompany(10L)).thenReturn(List.of(aliceLeave, bobLeave));

        List<Absence> result = absenceService.getAllAbsences();

        assertThat(find(result, 100L).getDepartmentOverlapNames()).containsExactly("Bob B");
        assertThat(find(result, 101L).getDepartmentOverlapNames()).containsExactly("Alice A");
    }

    @Test
    void getAllAbsencesDoesNotFlagNonOverlappingDatesInTheSameDepartment() {
        when(ownershipGuard.isAdmin()).thenReturn(false);
        when(ownershipGuard.currentCompanyId()).thenReturn(10L);

        Personnel alice = personnelWithDepartment(1L, "Alice", "A", "Sales");
        Personnel bob = personnelWithDepartment(2L, "Bob", "B", "Sales");
        Absence aliceLeave = Absence.builder().idAbsence(100L).personnel(alice)
                .startDate(LocalDate.of(2026, 3, 1)).endDate(LocalDate.of(2026, 3, 5)).build();
        Absence bobLeave = Absence.builder().idAbsence(101L).personnel(bob)
                .startDate(LocalDate.of(2026, 3, 10)).endDate(LocalDate.of(2026, 3, 15)).build();
        when(absenceRepository.findByPersonnel_User_Company_IdCompany(10L)).thenReturn(List.of(aliceLeave, bobLeave));

        List<Absence> result = absenceService.getAllAbsences();

        result.forEach(a -> assertThat(a.getDepartmentOverlapNames()).isEmpty());
    }

    @Test
    void getAllAbsencesDoesNotFlagOverlapAcrossDifferentDepartments() {
        when(ownershipGuard.isAdmin()).thenReturn(false);
        when(ownershipGuard.currentCompanyId()).thenReturn(10L);

        Personnel alice = personnelWithDepartment(1L, "Alice", "A", "Sales");
        Personnel bob = personnelWithDepartment(2L, "Bob", "B", "Engineering");
        Absence aliceLeave = Absence.builder().idAbsence(100L).personnel(alice)
                .startDate(LocalDate.of(2026, 3, 10)).endDate(LocalDate.of(2026, 3, 15)).build();
        Absence bobLeave = Absence.builder().idAbsence(101L).personnel(bob)
                .startDate(LocalDate.of(2026, 3, 12)).endDate(LocalDate.of(2026, 3, 20)).build();
        when(absenceRepository.findByPersonnel_User_Company_IdCompany(10L)).thenReturn(List.of(aliceLeave, bobLeave));

        List<Absence> result = absenceService.getAllAbsences();

        result.forEach(a -> assertThat(a.getDepartmentOverlapNames()).isEmpty());
    }

    @Test
    void getAllAbsencesIgnoresRejectedLeaveWhenComputingOverlap() {
        when(ownershipGuard.isAdmin()).thenReturn(false);
        when(ownershipGuard.currentCompanyId()).thenReturn(10L);

        Personnel alice = personnelWithDepartment(1L, "Alice", "A", "Sales");
        Personnel bob = personnelWithDepartment(2L, "Bob", "B", "Sales");
        Absence aliceLeave = Absence.builder().idAbsence(100L).personnel(alice)
                .startDate(LocalDate.of(2026, 3, 10)).endDate(LocalDate.of(2026, 3, 15)).build();
        Absence bobRejectedLeave = Absence.builder().idAbsence(101L).personnel(bob).status(AbsenceStatus.REJECTED)
                .startDate(LocalDate.of(2026, 3, 12)).endDate(LocalDate.of(2026, 3, 20)).build();
        when(absenceRepository.findByPersonnel_User_Company_IdCompany(10L)).thenReturn(List.of(aliceLeave, bobRejectedLeave));

        List<Absence> result = absenceService.getAllAbsences();

        result.forEach(a -> assertThat(a.getDepartmentOverlapNames()).isEmpty());
    }

    @Test
    void attachDepartmentOverlapsWithCompanyIdComparesAgainstTheFullCompanyNotJustThePassedList() {
        // Reproduit PersonnelService#getMyPersonnel : seule l'absence d'Alice est passée à
        // annoter (comme Personnel.absences), mais la comparaison doit quand même porter sur
        // toute l'entreprise (bobLeave y compris).
        Personnel alice = personnelWithDepartment(1L, "Alice", "A", "Sales");
        Personnel bob = personnelWithDepartment(2L, "Bob", "B", "Sales");
        Absence aliceLeave = Absence.builder().idAbsence(100L).personnel(alice)
                .startDate(LocalDate.of(2026, 3, 10)).endDate(LocalDate.of(2026, 3, 15)).build();
        Absence bobLeave = Absence.builder().idAbsence(101L).personnel(bob)
                .startDate(LocalDate.of(2026, 3, 12)).endDate(LocalDate.of(2026, 3, 20)).build();
        when(absenceRepository.findByPersonnel_User_Company_IdCompany(10L)).thenReturn(List.of(aliceLeave, bobLeave));

        absenceService.attachDepartmentOverlaps(List.of(aliceLeave), 10L);

        assertThat(aliceLeave.getDepartmentOverlapNames()).containsExactly("Bob B");
    }

    private static Absence find(List<Absence> absences, long id) {
        return absences.stream().filter(a -> a.getIdAbsence().equals(id)).findFirst().orElseThrow();
    }

    // ---- createAbsence : qui démarre PENDING vs APPROVED ----

    @Test
    void employeeSelfRequestStartsPendingAndNotifiesTheCompany() {
        when(ownershipGuard.isAdmin()).thenReturn(false);
        when(ownershipGuard.isCompanyRole()).thenReturn(false);
        Personnel realPersonnel = personnelInCompany(10L);
        when(personnelRepository.findById(1L)).thenReturn(Optional.of(realPersonnel));
        when(userRepository.findByCompany_IdCompany(10L)).thenReturn(List.of(
                User.builder().idUser(99L).role(Role.COMPANY).build()));
        when(absenceRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Absence incoming = Absence.builder()
                .dateAbsence(LocalDate.of(2026, 3, 10))
                .personnel(Personnel.builder().idPersonnel(1L).build())
                .status(AbsenceStatus.APPROVED) // tentative de forcer le statut -> doit être ignorée
                .build();

        Absence result = absenceService.createAbsence(incoming);

        assertThat(result.getStatus()).isEqualTo(AbsenceStatus.PENDING);
        verify(notificationService).notify(any(User.class), org.mockito.ArgumentMatchers.contains("requested a leave"));
    }

    @Test
    void companyCreatedAbsenceIsImmediatelyApprovedAndDoesNotNotifyAnyone() {
        when(ownershipGuard.isAdmin()).thenReturn(false);
        when(ownershipGuard.isCompanyRole()).thenReturn(true);
        Personnel realPersonnel = personnelInCompany(10L);
        when(personnelRepository.findById(1L)).thenReturn(Optional.of(realPersonnel));
        when(absenceRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // Reproduit AttendancePage : création minimale, sans reason/justification.
        Absence incoming = Absence.builder()
                .dateAbsence(LocalDate.of(2026, 3, 10))
                .personnel(Personnel.builder().idPersonnel(1L).build())
                .build();

        Absence result = absenceService.createAbsence(incoming);

        assertThat(result.getStatus()).isEqualTo(AbsenceStatus.APPROVED);
        verify(notificationService, never()).notify(any(), org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void createAbsenceRequiresAPersonnelReference() {
        assertThatThrownBy(() -> absenceService.createAbsence(Absence.builder().build()))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void createAbsenceReloadsTheRealPersonnelRatherThanTrustingTheClientPayload() {
        when(ownershipGuard.isAdmin()).thenReturn(false);
        when(ownershipGuard.isCompanyRole()).thenReturn(true);
        Personnel realPersonnel = personnelInCompany(10L);
        when(personnelRepository.findById(1L)).thenReturn(Optional.of(realPersonnel));
        when(absenceRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Absence incoming = Absence.builder()
                .dateAbsence(LocalDate.of(2026, 3, 10))
                .personnel(Personnel.builder().idPersonnel(1L).build()) // coquille envoyée par le client
                .build();

        Absence result = absenceService.createAbsence(incoming);

        assertThat(result.getPersonnel()).isSameAs(realPersonnel);
    }

    // ---- approveAbsence / rejectAbsence ----

    @Test
    void approveAbsenceOnlyWorksOnAPendingRequestAndNotifiesTheEmployee() {
        Personnel personnel = personnelInCompany(10L);
        Absence pending = Absence.builder().status(AbsenceStatus.PENDING).personnel(personnel)
                .dateAbsence(LocalDate.of(2026, 3, 10)).build();
        when(absenceRepository.findById(1L)).thenReturn(Optional.of(pending));
        when(absenceRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Absence result = absenceService.approveAbsence(1L);

        assertThat(result.getStatus()).isEqualTo(AbsenceStatus.APPROVED);
        verify(notificationService).notify(eq(personnel.getUser()), org.mockito.ArgumentMatchers.contains("approved"));
    }

    @Test
    void rejectAbsenceOnlyWorksOnAPendingRequestAndNotifiesTheEmployee() {
        Personnel personnel = personnelInCompany(10L);
        Absence pending = Absence.builder().status(AbsenceStatus.PENDING).personnel(personnel)
                .startDate(LocalDate.of(2026, 3, 10)).endDate(LocalDate.of(2026, 3, 12)).build();
        when(absenceRepository.findById(1L)).thenReturn(Optional.of(pending));
        when(absenceRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Absence result = absenceService.rejectAbsence(1L);

        assertThat(result.getStatus()).isEqualTo(AbsenceStatus.REJECTED);
        verify(notificationService).notify(eq(personnel.getUser()), org.mockito.ArgumentMatchers.contains("rejected"));
    }

    @Test
    void cannotApproveAnAlreadyDecidedRequest() {
        Personnel personnel = personnelInCompany(10L);
        Absence alreadyApproved = Absence.builder().status(AbsenceStatus.APPROVED).personnel(personnel).build();
        when(absenceRepository.findById(1L)).thenReturn(Optional.of(alreadyApproved));

        assertThatThrownBy(() -> absenceService.approveAbsence(1L)).isInstanceOf(BadRequestException.class);
        verify(absenceRepository, never()).save(any());
    }

    @Test
    void cannotRejectAnAlreadyRejectedRequest() {
        Personnel personnel = personnelInCompany(10L);
        Absence alreadyRejected = Absence.builder().status(AbsenceStatus.REJECTED).personnel(personnel).build();
        when(absenceRepository.findById(1L)).thenReturn(Optional.of(alreadyRejected));

        assertThatThrownBy(() -> absenceService.rejectAbsence(1L)).isInstanceOf(BadRequestException.class);
        verify(absenceRepository, never()).save(any());
    }

    @Test
    void approveAbsenceIsScopedToTheCallersCompanyLikeAnyOtherAbsenceAccess() {
        Absence pendingInAnotherCompany = Absence.builder().status(AbsenceStatus.PENDING)
                .personnel(personnelInCompany(99L)).build();
        when(absenceRepository.findById(1L)).thenReturn(Optional.of(pendingInAnotherCompany));
        org.mockito.Mockito.doThrow(new AccessDeniedException("no"))
                .when(ownershipGuard).checkPersonnelAccess(pendingInAnotherCompany.getPersonnel());

        assertThatThrownBy(() -> absenceService.approveAbsence(1L)).isInstanceOf(AccessDeniedException.class);
    }
}

package tn.esprit.backend.services;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;
import tn.esprit.backend.entities.Company;
import tn.esprit.backend.entities.Enum.TaskStatus;
import tn.esprit.backend.entities.Personnel;
import tn.esprit.backend.entities.Task;
import tn.esprit.backend.entities.User;
import tn.esprit.backend.exceptions.BadRequestException;
import tn.esprit.backend.repositories.PersonnelRepo;
import tn.esprit.backend.repositories.TaskRepo;
import tn.esprit.backend.security.OwnershipGuard;

import java.time.LocalDate;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Couvre l'attribution de tâches : le statut démarre toujours TODO (jamais accepté depuis le
 * client, même en le forçant dans le payload), la période start/end est validée, la cible est
 * toujours rechargée depuis la base plutôt que de faire confiance au payload, et
 * updateTask/updateStatus/deleteTask s'appuient sur OwnershipGuard comme le reste du codebase.
 */
@ExtendWith(MockitoExtension.class)
class TaskServiceTest {

    @Mock private TaskRepo taskRepository;
    @Mock private PersonnelRepo personnelRepository;
    @Mock private OwnershipGuard ownershipGuard;
    @Mock private NotificationService notificationService;

    private TaskService taskService;

    @BeforeEach
    void setUp() {
        taskService = new TaskService(taskRepository, personnelRepository, ownershipGuard, notificationService);
    }

    private Personnel personnelInCompany(long companyId) {
        Company company = Company.builder().idCompany(companyId).build();
        User user = User.builder().idUser(1L).firstname("Jane").lastname("Doe").company(company).build();
        return Personnel.builder().idPersonnel(1L).user(user).build();
    }

    // ---- createTask ----

    @Test
    void createTaskAlwaysStartsAsTodoAndNotifiesTheEmployee() {
        when(ownershipGuard.isAdmin()).thenReturn(false);
        Personnel realPersonnel = personnelInCompany(10L);
        when(personnelRepository.findById(1L)).thenReturn(Optional.of(realPersonnel));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Task incoming = Task.builder()
                .title("Write report")
                .startDate(LocalDate.of(2026, 3, 10))
                .endDate(LocalDate.of(2026, 3, 15))
                .status(TaskStatus.DONE) // tentative de forcer le statut -> doit être ignorée
                .personnel(Personnel.builder().idPersonnel(1L).build())
                .build();

        Task result = taskService.createTask(incoming);

        assertThat(result.getStatus()).isEqualTo(TaskStatus.TODO);
        verify(notificationService).notify(eq(realPersonnel.getUser()), contains("New task assigned"));
    }

    @Test
    void createTaskRequiresAPersonnelReference() {
        assertThatThrownBy(() -> taskService.createTask(Task.builder()
                .startDate(LocalDate.of(2026, 3, 10))
                .endDate(LocalDate.of(2026, 3, 15))
                .build()))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void createTaskRejectsAnEndDateBeforeTheStartDate() {
        when(ownershipGuard.isAdmin()).thenReturn(false);
        Personnel realPersonnel = personnelInCompany(10L);
        when(personnelRepository.findById(1L)).thenReturn(Optional.of(realPersonnel));

        Task incoming = Task.builder()
                .title("Impossible")
                .startDate(LocalDate.of(2026, 3, 15))
                .endDate(LocalDate.of(2026, 3, 10))
                .personnel(Personnel.builder().idPersonnel(1L).build())
                .build();

        assertThatThrownBy(() -> taskService.createTask(incoming)).isInstanceOf(BadRequestException.class);
        verify(taskRepository, never()).save(any());
    }

    @Test
    void createTaskReloadsTheRealPersonnelRatherThanTrustingTheClientPayload() {
        when(ownershipGuard.isAdmin()).thenReturn(false);
        Personnel realPersonnel = personnelInCompany(10L);
        when(personnelRepository.findById(1L)).thenReturn(Optional.of(realPersonnel));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Task incoming = Task.builder()
                .title("Write report")
                .startDate(LocalDate.of(2026, 3, 10))
                .endDate(LocalDate.of(2026, 3, 15))
                .personnel(Personnel.builder().idPersonnel(1L).build()) // coquille envoyée par le client
                .build();

        Task result = taskService.createTask(incoming);

        assertThat(result.getPersonnel()).isSameAs(realPersonnel);
    }

    // ---- updateTask ----

    @Test
    void updateTaskNeverChangesStatusEvenIfThePayloadIncludesOne() {
        Personnel personnel = personnelInCompany(10L);
        Task existing = Task.builder().idTask(1L).status(TaskStatus.IN_PROGRESS).personnel(personnel)
                .startDate(LocalDate.of(2026, 3, 10)).endDate(LocalDate.of(2026, 3, 15)).build();
        when(taskRepository.findById(1L)).thenReturn(Optional.of(existing));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Task payload = Task.builder()
                .title("Updated title")
                .status(TaskStatus.DONE) // ignoré : seul updateStatus peut changer le statut
                .startDate(LocalDate.of(2026, 3, 11))
                .endDate(LocalDate.of(2026, 3, 16))
                .build();

        Task result = taskService.updateTask(1L, payload);

        assertThat(result.getStatus()).isEqualTo(TaskStatus.IN_PROGRESS);
        assertThat(result.getTitle()).isEqualTo("Updated title");
    }

    // ---- updateStatus ----

    @Test
    void updateStatusIsScopedByOwnershipGuardLikeAnyOtherTaskAccess() {
        Task taskInAnotherCompany = Task.builder().idTask(1L).status(TaskStatus.TODO)
                .personnel(personnelInCompany(99L)).build();
        when(taskRepository.findById(1L)).thenReturn(Optional.of(taskInAnotherCompany));
        doThrow(new AccessDeniedException("no")).when(ownershipGuard).checkPersonnelAccess(taskInAnotherCompany.getPersonnel());

        assertThatThrownBy(() -> taskService.updateStatus(1L, TaskStatus.DONE)).isInstanceOf(AccessDeniedException.class);
        verify(taskRepository, never()).save(any());
    }

    @Test
    void updateStatusSavesTheNewStatusWhenOwnershipChecksPass() {
        Personnel personnel = personnelInCompany(10L);
        Task existing = Task.builder().idTask(1L).status(TaskStatus.TODO).personnel(personnel).build();
        when(taskRepository.findById(1L)).thenReturn(Optional.of(existing));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Task result = taskService.updateStatus(1L, TaskStatus.IN_PROGRESS);

        assertThat(result.getStatus()).isEqualTo(TaskStatus.IN_PROGRESS);
    }

    // ---- deleteTask ----

    @Test
    void deleteTaskChecksOwnershipBeforeDeleting() {
        Task taskInAnotherCompany = Task.builder().idTask(1L).personnel(personnelInCompany(99L)).build();
        when(taskRepository.findById(1L)).thenReturn(Optional.of(taskInAnotherCompany));
        doThrow(new AccessDeniedException("no")).when(ownershipGuard).checkPersonnelAccess(taskInAnotherCompany.getPersonnel());

        assertThatThrownBy(() -> taskService.deleteTask(1L)).isInstanceOf(AccessDeniedException.class);
        verify(taskRepository, never()).delete(any());
    }
}

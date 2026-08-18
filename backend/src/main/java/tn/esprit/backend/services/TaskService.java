package tn.esprit.backend.services;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tn.esprit.backend.entities.Enum.TaskStatus;
import tn.esprit.backend.entities.Personnel;
import tn.esprit.backend.entities.Task;
import tn.esprit.backend.exceptions.BadRequestException;
import tn.esprit.backend.exceptions.ResourceNotFoundException;
import tn.esprit.backend.repositories.PersonnelRepo;
import tn.esprit.backend.repositories.TaskRepo;
import tn.esprit.backend.security.OwnershipGuard;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Attribution de tâches (avec durée) par une entreprise à son personnel. Statut TODO forcé à la
 * création (jamais accepté depuis le client) ; seul updateStatus peut le faire évoluer, et
 * updateTask (détails : titre/description/dates/réassignation) ne le touche jamais - même
 * séparation que AbsenceService entre updateAbsence et approveAbsence/rejectAbsence.
 */
@Service
@RequiredArgsConstructor
public class TaskService {

    private final TaskRepo taskRepository;
    private final PersonnelRepo personnelRepository;
    private final OwnershipGuard ownershipGuard;
    private final NotificationService notificationService;

    @Transactional
    public Task createTask(Task task) {
        Personnel realPersonnel = resolveAndCheckTargetPersonnel(task.getPersonnel());
        validatePeriod(task);

        task.setPersonnel(realPersonnel);
        task.setStatus(TaskStatus.TODO);
        task.setCreatedAt(LocalDateTime.now());

        Task saved = taskRepository.save(task);

        if (realPersonnel.getUser() != null) {
            notificationService.notify(realPersonnel.getUser(),
                    "New task assigned: " + saved.getTitle() + " (due " + saved.getEndDate() + ").");
        }
        return saved;
    }

    /**
     * Met à jour titre/description/dates et, si fourni, réassigne la tâche - jamais le statut
     * (voir updateStatus).
     */
    @Transactional
    public Task updateTask(Long id, Task taskDetails) {
        Task existingTask = getTaskById(id); // vérifie déjà la propriété

        if (taskDetails.getPersonnel() != null && taskDetails.getPersonnel().getIdPersonnel() != null
                && !taskDetails.getPersonnel().getIdPersonnel().equals(existingTask.getPersonnel().getIdPersonnel())) {
            existingTask.setPersonnel(resolveAndCheckTargetPersonnel(taskDetails.getPersonnel()));
        }

        existingTask.setTitle(taskDetails.getTitle());
        existingTask.setDescription(taskDetails.getDescription());
        existingTask.setStartDate(taskDetails.getStartDate());
        existingTask.setEndDate(taskDetails.getEndDate());
        validatePeriod(existingTask);

        return taskRepository.save(existingTask);
    }

    /**
     * ADMIN/COMPANY (n'importe quelle tâche de leur périmètre) ou l'EMPLOYE assigné (sa propre
     * tâche uniquement) - même règle que OwnershipGuard#checkPersonnelAccess.
     */
    @Transactional
    public Task updateStatus(Long id, TaskStatus status) {
        Task task = getTaskById(id); // vérifie déjà la propriété
        task.setStatus(status);
        return taskRepository.save(task);
    }

    @Transactional(readOnly = true)
    public List<Task> getAllTasks() {
        if (ownershipGuard.isAdmin()) {
            return taskRepository.findAll();
        }
        return taskRepository.findByPersonnel_User_Company_IdCompanyOrderByStartDateDesc(ownershipGuard.currentCompanyId());
    }

    @Transactional(readOnly = true)
    public List<Task> getMyTasks() {
        Long userId = ownershipGuard.currentUser().getIdUser();
        Personnel me = personnelRepository.findByUser_IdUser(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Personnel record not found"));
        return taskRepository.findByPersonnel_IdPersonnelOrderByStartDateDesc(me.getIdPersonnel());
    }

    @Transactional(readOnly = true)
    public Task getTaskById(Long id) {
        Task task = taskRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Task not found with id: " + id));
        ownershipGuard.checkPersonnelAccess(task.getPersonnel());
        return task;
    }

    @Transactional
    public void deleteTask(Long id) {
        Task task = getTaskById(id); // vérifie déjà la propriété
        taskRepository.delete(task);
    }

    private void validatePeriod(Task task) {
        if (task.getStartDate() != null && task.getEndDate() != null && task.getEndDate().isBefore(task.getStartDate())) {
            throw new BadRequestException("End date cannot be before start date");
        }
    }

    /** Même pattern que AbsenceService#resolveAndCheckTargetPersonnel. */
    private Personnel resolveAndCheckTargetPersonnel(Personnel requestedPersonnel) {
        if (requestedPersonnel == null || requestedPersonnel.getIdPersonnel() == null) {
            throw new AccessDeniedException("An associated personnel record is required");
        }
        Personnel realPersonnel = personnelRepository.findById(requestedPersonnel.getIdPersonnel())
                .orElseThrow(() -> new ResourceNotFoundException("Personnel not found"));
        if (!ownershipGuard.isAdmin()) {
            ownershipGuard.checkPersonnelAccess(realPersonnel);
        }
        return realPersonnel;
    }
}

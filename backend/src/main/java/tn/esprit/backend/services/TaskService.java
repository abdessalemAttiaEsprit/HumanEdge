package tn.esprit.backend.services;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import tn.esprit.backend.entities.Enum.Role;
import tn.esprit.backend.entities.Enum.SyncSourceType;
import tn.esprit.backend.entities.Enum.TaskPriority;
import tn.esprit.backend.entities.Enum.TaskStatus;
import tn.esprit.backend.entities.Personnel;
import tn.esprit.backend.entities.Task;
import tn.esprit.backend.entities.User;
import tn.esprit.backend.exceptions.BadRequestException;
import tn.esprit.backend.exceptions.ResourceNotFoundException;
import tn.esprit.backend.repositories.PersonnelRepo;
import tn.esprit.backend.repositories.TaskRepo;
import tn.esprit.backend.repositories.UserRepository;
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
    private final UserRepository userRepository;
    private final OwnershipGuard ownershipGuard;
    private final NotificationService notificationService;
    private final FileStorageService fileStorageService;
    private final GoogleCalendarSyncService googleCalendarSyncService;

    @Transactional
    public Task createTask(Task task) {
        Personnel realPersonnel = resolveAndCheckTargetPersonnel(task.getPersonnel());
        validatePeriod(task);

        task.setPersonnel(realPersonnel);
        task.setStatus(TaskStatus.TODO);
        if (task.getPriority() == null) {
            task.setPriority(TaskPriority.MEDIUM);
        }
        task.setCreatedAt(LocalDateTime.now());

        Task saved = taskRepository.save(task);

        if (realPersonnel.getUser() != null) {
            notificationService.notify(realPersonnel.getUser(),
                    "New task assigned: " + saved.getTitle() + " (due " + saved.getEndDate() + ").");
        }
        syncTaskToGoogleCalendar(saved);
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
        if (taskDetails.getPriority() != null) {
            existingTask.setPriority(taskDetails.getPriority());
        }
        validatePeriod(existingTask);

        Task saved = taskRepository.save(existingTask);
        syncTaskToGoogleCalendar(saved);
        return saved;
    }

    /**
     * ADMIN/COMPANY (n'importe quelle tâche de leur périmètre) ou l'EMPLOYE assigné (sa propre
     * tâche uniquement) - même règle que OwnershipGuard#checkPersonnelAccess.
     */
    @Transactional
    public Task updateStatus(Long id, TaskStatus status) {
        Task task = getTaskById(id); // vérifie déjà la propriété
        task.setStatus(status);
        Task saved = taskRepository.save(task);
        syncTaskToGoogleCalendar(saved); // rafraîchit la description (statut) de l'événement existant
        return saved;
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
        googleCalendarSyncService.deleteEventForAllUsers(SyncSourceType.TASK, id);
    }

    /** Dépose la pièce jointe (fichier) d'une tâche — remplace toute pièce jointe précédente. */
    @Transactional
    public Task uploadAttachment(Long id, MultipartFile file) {
        Task task = getTaskById(id); // vérifie déjà la propriété
        String storedFilename = fileStorageService.store(file, "task_" + id, false);
        task.setAttachment(storedFilename);
        return taskRepository.save(task);
    }

    /**
     * Synchronise une tâche vers Google Calendar : sur le calendrier de l'employé assigné et de
     * chaque compte COMPANY de son entreprise (voir GoogleCalendarSyncService, no-op silencieux
     * si l'un ou l'autre n'est pas connecté). Le statut est inclus dans la description pour que
     * l'événement reste à jour à chaque changement (voir updateStatus).
     */
    private void syncTaskToGoogleCalendar(Task task) {
        Personnel personnel = task.getPersonnel();
        if (personnel == null || personnel.getUser() == null) {
            return;
        }
        User owner = personnel.getUser();
        String title = "Task: " + task.getTitle();
        String description = (task.getDescription() != null ? task.getDescription() + "\n\n" : "") + "Status: " + task.getStatus();
        googleCalendarSyncService.syncAllDayEvent(owner, SyncSourceType.TASK, task.getIdTask(), title, description, task.getStartDate(), task.getEndDate(), null);
        if (owner.getCompany() != null) {
            userRepository.findByCompany_IdCompany(owner.getCompany().getIdCompany()).stream()
                    .filter(u -> u.getRole() == Role.COMPANY)
                    .forEach(u -> googleCalendarSyncService.syncAllDayEvent(u, SyncSourceType.TASK, task.getIdTask(), title, description, task.getStartDate(), task.getEndDate(), null));
        }
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

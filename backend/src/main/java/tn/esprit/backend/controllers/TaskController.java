package tn.esprit.backend.controllers;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import tn.esprit.backend.dto.TaskStatusUpdateRequest;
import tn.esprit.backend.entities.Task;
import tn.esprit.backend.services.FileStorageService;
import tn.esprit.backend.services.TaskService;

import java.net.URLConnection;
import java.util.List;

/** Attribution de tâches (avec durée) par une entreprise à son personnel. */
@RestController
@RequestMapping("/api/tasks")
@RequiredArgsConstructor
public class TaskController {

    private final TaskService taskService;
    private final FileStorageService fileStorageService;

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<Task> createTask(@RequestBody Task task) {
        return ResponseEntity.status(HttpStatus.CREATED).body(taskService.createTask(task));
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<List<Task>> getAllTasks() {
        return ResponseEntity.ok(taskService.getAllTasks());
    }

    @GetMapping("/me")
    @PreAuthorize("hasRole('EMPLOYE')")
    public ResponseEntity<List<Task>> getMyTasks() {
        return ResponseEntity.ok(taskService.getMyTasks());
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'EMPLOYE')")
    public ResponseEntity<Task> getTaskById(@PathVariable Long id) {
        return ResponseEntity.ok(taskService.getTaskById(id));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<Task> updateTask(@PathVariable Long id, @RequestBody Task task) {
        return ResponseEntity.ok(taskService.updateTask(id, task));
    }

    @PutMapping("/{id}/status")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'EMPLOYE')")
    public ResponseEntity<Task> updateStatus(@PathVariable Long id, @Valid @RequestBody TaskStatusUpdateRequest request) {
        return ResponseEntity.ok(taskService.updateStatus(id, request.getStatus()));
    }

    /** Dépose/remplace la pièce jointe de la tâche (ex: instructions, document de référence). */
    @PostMapping("/{id}/attachment")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<Task> uploadAttachment(@PathVariable Long id, @RequestParam("file") MultipartFile file) {
        return ResponseEntity.ok(taskService.uploadAttachment(id, file));
    }

    /** Télécharge la pièce jointe de la tâche. */
    @GetMapping("/{id}/attachment")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'EMPLOYE')")
    public ResponseEntity<Resource> downloadAttachment(@PathVariable Long id) {
        Task task = taskService.getTaskById(id); // vérifie déjà la propriété
        if (task.getAttachment() == null) {
            return ResponseEntity.notFound().build();
        }

        Resource resource = fileStorageService.loadAsResource(task.getAttachment());
        String contentType = URLConnection.guessContentTypeFromName(task.getAttachment());
        if (contentType == null) {
            contentType = MediaType.APPLICATION_OCTET_STREAM_VALUE;
        }

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(contentType))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + resource.getFilename() + "\"")
                .body(resource);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<Void> deleteTask(@PathVariable Long id) {
        taskService.deleteTask(id);
        return ResponseEntity.noContent().build();
    }
}

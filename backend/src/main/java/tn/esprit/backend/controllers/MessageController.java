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
import tn.esprit.backend.dto.MessageCreateRequest;
import tn.esprit.backend.entities.Message;
import tn.esprit.backend.services.FileStorageService;
import tn.esprit.backend.services.MessageService;

import java.net.URLConnection;
import java.util.List;

/** Messagerie EMPLOYE &lt;-&gt; entreprise : l'employé écrit à son entreprise, l'entreprise peut répondre. */
@RestController
@RequestMapping("/api/messages")
@RequiredArgsConstructor
public class MessageController {

    private final MessageService messageService;
    private final FileStorageService fileStorageService;

    @PostMapping
    @PreAuthorize("hasRole('EMPLOYE')")
    public ResponseEntity<Message> sendMessage(@Valid @RequestBody MessageCreateRequest request) {
        Message sent = messageService.sendMessageToCompany(request.getContent(), request.getCategory());
        return ResponseEntity.status(HttpStatus.CREATED).body(sent);
    }

    /** Répond à un employé précis, avec pièce jointe optionnelle. */
    @PostMapping(value = "/employee/{employeeUserId}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('COMPANY')")
    public ResponseEntity<Message> replyToEmployee(
            @PathVariable Long employeeUserId,
            @RequestParam("content") String content,
            @RequestParam(value = "file", required = false) MultipartFile file) {
        Message sent = messageService.replyToEmployee(employeeUserId, content, file);
        return ResponseEntity.status(HttpStatus.CREATED).body(sent);
    }

    @GetMapping("/me")
    @PreAuthorize("hasRole('EMPLOYE')")
    public ResponseEntity<List<Message>> getMyConversation() {
        return ResponseEntity.ok(messageService.getMyConversation());
    }

    @GetMapping("/received")
    @PreAuthorize("hasRole('COMPANY')")
    public ResponseEntity<List<Message>> getReceivedMessages() {
        return ResponseEntity.ok(messageService.getReceivedMessages());
    }

    /** Téléchargement de la pièce jointe d'un message - accessible aux deux parties de l'échange uniquement. */
    @GetMapping("/{id}/attachment")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'EMPLOYE')")
    public ResponseEntity<Resource> downloadAttachment(@PathVariable Long id) {
        Message message = messageService.getMessageForAttachment(id); // vérifie déjà l'accès
        if (message.getAttachment() == null) {
            return ResponseEntity.notFound().build();
        }

        Resource resource = fileStorageService.loadAsResource(message.getAttachment());
        String contentType = URLConnection.guessContentTypeFromName(message.getAttachment());
        if (contentType == null) {
            contentType = MediaType.APPLICATION_OCTET_STREAM_VALUE;
        }

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(contentType))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + resource.getFilename() + "\"")
                .body(resource);
    }
}

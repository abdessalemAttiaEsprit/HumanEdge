package tn.esprit.backend.controllers;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import tn.esprit.backend.dto.MessageCreateRequest;
import tn.esprit.backend.entities.Message;
import tn.esprit.backend.services.MessageService;

import java.util.List;

/** Espace de messagerie du dashboard EMPLOYE - un employé écrit à son entreprise. */
@RestController
@RequestMapping("/api/messages")
@RequiredArgsConstructor
public class MessageController {

    private final MessageService messageService;

    @PostMapping
    @PreAuthorize("hasRole('EMPLOYE')")
    public ResponseEntity<Message> sendMessage(@Valid @RequestBody MessageCreateRequest request) {
        Message sent = messageService.sendMessageToCompany(request.getContent());
        return ResponseEntity.status(HttpStatus.CREATED).body(sent);
    }

    @GetMapping("/me")
    @PreAuthorize("hasRole('EMPLOYE')")
    public ResponseEntity<List<Message>> getMySentMessages() {
        return ResponseEntity.ok(messageService.getMySentMessages());
    }

    @GetMapping("/received")
    @PreAuthorize("hasRole('COMPANY')")
    public ResponseEntity<List<Message>> getReceivedMessages() {
        return ResponseEntity.ok(messageService.getReceivedMessages());
    }
}

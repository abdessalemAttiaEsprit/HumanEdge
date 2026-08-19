package tn.esprit.backend.controllers;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import tn.esprit.backend.dto.SkillCreateRequest;
import tn.esprit.backend.dto.SkillStatusUpdateRequest;
import tn.esprit.backend.dto.SkillSuggestions;
import tn.esprit.backend.entities.Skill;
import tn.esprit.backend.services.SkillService;

import java.util.List;

/** Compétences déclarées par l'employé (à valider) ou attribuées directement par une COMPANY. */
@RestController
@RequestMapping("/api/skills")
@RequiredArgsConstructor
public class SkillController {

    private final SkillService skillService;

    @GetMapping("/suggestions")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'EMPLOYE')")
    public ResponseEntity<SkillSuggestions> getSuggestions(@RequestParam(required = false) Long personnelId) {
        return ResponseEntity.ok(skillService.getSuggestions(personnelId));
    }

    @PostMapping
    @PreAuthorize("hasRole('EMPLOYE')")
    public ResponseEntity<Skill> createMySkill(@Valid @RequestBody SkillCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(skillService.createMySkill(request));
    }

    @GetMapping("/me")
    @PreAuthorize("hasRole('EMPLOYE')")
    public ResponseEntity<List<Skill>> getMySkills() {
        return ResponseEntity.ok(skillService.getMySkills());
    }

    @GetMapping("/personnel/{personnelId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<List<Skill>> getForPersonnel(@PathVariable Long personnelId) {
        return ResponseEntity.ok(skillService.getForPersonnel(personnelId));
    }

    @PostMapping("/personnel/{personnelId}")
    @PreAuthorize("hasRole('COMPANY')")
    public ResponseEntity<Skill> addForPersonnel(@PathVariable Long personnelId, @Valid @RequestBody SkillCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(skillService.companyAddSkill(personnelId, request));
    }

    @PutMapping("/{id}/status")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<Skill> updateStatus(@PathVariable Long id, @Valid @RequestBody SkillStatusUpdateRequest request) {
        return ResponseEntity.ok(skillService.updateStatus(id, request.getStatus()));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'EMPLOYE')")
    public ResponseEntity<Void> deleteSkill(@PathVariable Long id) {
        skillService.deleteSkill(id);
        return ResponseEntity.noContent().build();
    }
}

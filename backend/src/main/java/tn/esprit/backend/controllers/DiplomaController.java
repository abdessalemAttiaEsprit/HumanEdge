package tn.esprit.backend.controllers;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import tn.esprit.backend.entities.Diploma;
import tn.esprit.backend.services.DiplomaService;

import java.util.List;

/** Diplômes (nom + image) déposés par l'employé ou ajoutés directement par une COMPANY. */
@RestController
@RequestMapping("/api/diplomas")
@RequiredArgsConstructor
public class DiplomaController {

    private final DiplomaService diplomaService;

    @PostMapping
    @PreAuthorize("hasRole('EMPLOYE')")
    public ResponseEntity<Diploma> addMyDiploma(@RequestParam String name, @RequestParam("file") MultipartFile file) {
        return ResponseEntity.status(HttpStatus.CREATED).body(diplomaService.addMyDiploma(name, file));
    }

    @GetMapping("/me")
    @PreAuthorize("hasRole('EMPLOYE')")
    public ResponseEntity<List<Diploma>> getMyDiplomas() {
        return ResponseEntity.ok(diplomaService.getMyDiplomas());
    }

    @GetMapping("/personnel/{personnelId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<List<Diploma>> getForPersonnel(@PathVariable Long personnelId) {
        return ResponseEntity.ok(diplomaService.getForPersonnel(personnelId));
    }

    @PostMapping("/personnel/{personnelId}")
    @PreAuthorize("hasRole('COMPANY')")
    public ResponseEntity<Diploma> addForPersonnel(@PathVariable Long personnelId, @RequestParam String name, @RequestParam("file") MultipartFile file) {
        return ResponseEntity.status(HttpStatus.CREATED).body(diplomaService.companyAddDiploma(personnelId, name, file));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'EMPLOYE')")
    public ResponseEntity<Void> deleteDiploma(@PathVariable Long id) {
        diplomaService.deleteDiploma(id);
        return ResponseEntity.noContent().build();
    }
}

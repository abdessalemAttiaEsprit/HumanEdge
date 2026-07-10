package tn.esprit.backend.controllers;

import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import tn.esprit.backend.entities.Absence;
import tn.esprit.backend.services.AbsenceQuotaCalculator;
import tn.esprit.backend.services.AbsenceService;
import tn.esprit.backend.services.FileStorageService;

import java.net.URLConnection;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/absences")
@RequiredArgsConstructor
public class AbsenceController {

    private final AbsenceService absenceService;
    private final FileStorageService fileStorageService;

    /**
     * GET /api/absences : Récupérer toutes les absences.
     */
    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<List<Absence>> getAllAbsences() {
        List<Absence> absences = absenceService.getAllAbsences();
        return ResponseEntity.ok(absences);
    }

    /**
     * GET /api/absences/{id} : Récupérer une absence par son ID.
     */
    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'EMPLOYE')")
    public ResponseEntity<Absence> getAbsenceById(@PathVariable Long id) {
        Absence absence = absenceService.getAbsenceById(id);
        return ResponseEntity.ok(absence);
    }

    /**
     * POST /api/absences : Enregistrer une nouvelle absence.
     */
    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'EMPLOYE')")
    public ResponseEntity<Absence> createAbsence(@RequestBody Absence absence) {
        Absence createdAbsence = absenceService.createAbsence(absence);
        return ResponseEntity.status(HttpStatus.CREATED).body(createdAbsence);
    }

    /**
     * PUT /api/absences/{id} : Modifier une absence existante.
     */
    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<Absence> updateAbsence(@PathVariable Long id, @RequestBody Absence absenceDetails) {
        Absence updatedAbsence = absenceService.updateAbsence(id, absenceDetails);
        return ResponseEntity.ok(updatedAbsence);
    }

    /**
     * POST /api/absences/{id}/justification : Dépose le fichier justificatif (remplace le précédent).
     */
    @PostMapping("/{id}/justification")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'EMPLOYE')")
    public ResponseEntity<Absence> uploadJustification(
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file) {
        return ResponseEntity.ok(absenceService.uploadJustification(id, file));
    }

    /**
     * GET /api/absences/{id}/justification : Télécharge le fichier justificatif.
     */
    @GetMapping("/{id}/justification")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'EMPLOYE')")
    public ResponseEntity<Resource> downloadJustification(@PathVariable Long id) {
        Absence absence = absenceService.getAbsenceById(id); // vérifie déjà la propriété
        if (absence.getJustification() == null) {
            return ResponseEntity.notFound().build();
        }

        Resource resource = fileStorageService.loadAsResource(absence.getJustification());
        String contentType = URLConnection.guessContentTypeFromName(absence.getJustification());
        if (contentType == null) {
            contentType = MediaType.APPLICATION_OCTET_STREAM_VALUE;
        }

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(contentType))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + resource.getFilename() + "\"")
                .body(resource);
    }

    /**
     * GET /api/absences/quota/{personnelId} : Quota de jours d'absence justifiée acquis par l'employé.
     */
    @GetMapping("/quota/{personnelId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'EMPLOYE')")
    public ResponseEntity<AbsenceQuotaCalculator.QuotaSnapshot> getAbsenceQuota(
            @PathVariable Long personnelId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOf) {
        return ResponseEntity.ok(absenceService.getAbsenceQuota(personnelId, asOf));
    }

    /**
     * DELETE /api/absences/{id} : Supprimer une absence.
     */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<Void> deleteAbsence(@PathVariable Long id) {
        absenceService.deleteAbsence(id);
        return ResponseEntity.noContent().build(); // Statut 204 No Content
    }
}
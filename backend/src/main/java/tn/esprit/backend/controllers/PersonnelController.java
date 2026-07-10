package tn.esprit.backend.controllers;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import tn.esprit.backend.dto.PersonnelCreateRequest;
import tn.esprit.backend.dto.PersonnelSelfUpdateRequest;
import tn.esprit.backend.entities.Personnel;
import tn.esprit.backend.services.PdfService;
import tn.esprit.backend.services.PersonnelService;

import java.util.List;

@RestController
@RequestMapping("/api/personnel")
@RequiredArgsConstructor
public class PersonnelController {

    private final PersonnelService personnelService;
    private final PdfService pdfService;

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<List<Personnel>> getAllPersonnel() {
        return ResponseEntity.ok(personnelService.getAllPersonnel());
    }

    @GetMapping("/company/{companyId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<List<Personnel>> getPersonnelByCompanyId(@PathVariable Long companyId) {
        return ResponseEntity.ok(personnelService.getPersonnelByCompanyId(companyId));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'EMPLOYE')")
    public ResponseEntity<Personnel> getPersonnelById(@PathVariable Long id) {
        return ResponseEntity.ok(personnelService.getPersonnelById(id));
    }

    /** Self-service: lets the logged-in user (mainly EMPLOYE) find their own personnel record. */
    @GetMapping("/me")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'EMPLOYE')")
    public ResponseEntity<Personnel> getMyPersonnel() {
        return ResponseEntity.ok(personnelService.getMyPersonnel());
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<Personnel> createPersonnel(@RequestBody Personnel personnel) {
        return ResponseEntity.ok(personnelService.createPersonnel(personnel));
    }

    /**
     * Creates a new EMPLOYE user account together with its Personnel record in one call.
     * Use this instead of the plain {@code POST /api/personnel} when the employee does
     * not have a user account yet.
     */
    @PostMapping("/employee")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<Personnel> createPersonnelWithNewUser(@Valid @RequestBody PersonnelCreateRequest request) {
        return ResponseEntity.ok(personnelService.createPersonnelWithNewUser(request));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<Personnel> updatePersonnel(@PathVariable Long id, @RequestBody Personnel personnelDetails) {
        return ResponseEntity.ok(personnelService.updatePersonnel(id, personnelDetails));
    }

    /** Self-service (EMPLOYE): update only the profile fields they're allowed to touch (phone, RIB). */
    @PutMapping("/me")
    @PreAuthorize("hasRole('EMPLOYE')")
    public ResponseEntity<Personnel> updateMyPersonnel(@Valid @RequestBody PersonnelSelfUpdateRequest request) {
        return ResponseEntity.ok(personnelService.updateMyPersonnel(request));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<Void> deletePersonnel(@PathVariable Long id) {
        personnelService.deletePersonnel(id);
        return ResponseEntity.noContent().build();
    }

    /** Uploads/replaces the employee's photo. Served back publicly under /uploads/{filename}. */
    @PostMapping("/{id}/image")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<Personnel> uploadPersonnelImage(
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file) {
        return ResponseEntity.ok(personnelService.uploadImage(id, file));
    }

    /** Self-service (EMPLOYE): upload/replace their own photo. */
    @PostMapping("/me/image")
    @PreAuthorize("hasRole('EMPLOYE')")
    public ResponseEntity<Personnel> uploadMyImage(@RequestParam("file") MultipartFile file) {
        return ResponseEntity.ok(personnelService.uploadMyImage(file));
    }

    @GetMapping("/{id}/contract-pdf")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'EMPLOYE')")
    public ResponseEntity<byte[]> downloadContractPdf(@PathVariable Long id) {
        Personnel personnel = personnelService.getPersonnelById(id);
        byte[] pdf = pdfService.generateContratTravail(personnel);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"contrat_" + id + ".pdf\"")
                .body(pdf);
    }

    @GetMapping("/{id}/attestation-pdf")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'EMPLOYE')")
    public ResponseEntity<byte[]> downloadAttestationPdf(@PathVariable Long id) {
        Personnel personnel = personnelService.getPersonnelById(id);
        byte[] pdf = pdfService.generateAttestationTravail(personnel);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"attestation_" + id + ".pdf\"")
                .body(pdf);
    }
}
package tn.esprit.backend.controllers;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import tn.esprit.backend.entities.Application;
import tn.esprit.backend.services.ApplicationService;
import tn.esprit.backend.services.CsvExportService;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/application")
@RequiredArgsConstructor
public class ApplicationController {

    private final ApplicationService applicationService;
    private final CsvExportService csvExportService;

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<Application> createApplication(@RequestBody Application application) {
        Application created = applicationService.createApplication(application);
        return new ResponseEntity<>(created, HttpStatus.CREATED);
    }

    @PostMapping("/apply")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'GUEST')")
    public ResponseEntity<Application> applyToJob(
            @RequestParam Long candidateId,
            @RequestParam Long jobPostingId,
            @RequestParam String coverLetter) {
        Application application = applicationService.applyToJob(candidateId, jobPostingId, coverLetter);
        return new ResponseEntity<>(application, HttpStatus.CREATED);
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<List<Application>> getAllApplications() {
        List<Application> applications = applicationService.getAllApplications();
        return ResponseEntity.ok(applications);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'GUEST')")
    public ResponseEntity<Application> getApplicationById(@PathVariable Long id) {
        Application application = applicationService.getApplicationById(id);
        return ResponseEntity.ok(application);
    }

    @GetMapping("/job/{jobPostingId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<List<Application>> getApplicationsByJob(@PathVariable Long jobPostingId) {
        List<Application> applications = applicationService.getApplicationsByJob(jobPostingId);
        return ResponseEntity.ok(applications);
    }

    @GetMapping("/candidate/{candidateId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'GUEST')")
    public ResponseEntity<List<Application>> getApplicationsByCandidate(@PathVariable Long candidateId) {
        List<Application> applications = applicationService.getApplicationsByCandidate(candidateId);
        return ResponseEntity.ok(applications);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<Application> updateApplication(
            @PathVariable Long id,
            @RequestBody Application application) {
        Application updated = applicationService.updateApplication(id, application);
        return ResponseEntity.ok(updated);
    }

    @PatchMapping("/{id}/status")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<Application> updateApplicationStatus(
            @PathVariable Long id,
            @RequestParam String status) {
        Application updated = applicationService.updateApplicationStatus(id, status);
        return ResponseEntity.ok(updated);
    }

    @PostMapping("/{id}/evaluate")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<Application> evaluateApplication(
            @PathVariable Long id,
            @RequestParam Double aiScore,
            @RequestParam String aiFeedback) {
        Application updated = applicationService.updateAiEvaluation(id, aiScore, aiFeedback);
        return ResponseEntity.ok(updated);
    }

    @PostMapping("/{id}/evaluate-ai")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<Application> evaluateApplicationWithAi(@PathVariable Long id) throws IOException {
        Application updated = applicationService.evaluateApplicationWithAi(id);
        return ResponseEntity.ok(updated);
    }

    /** Candidatures visibles par l'appelant (voir ApplicationService#getAllApplications) en CSV. */
    @GetMapping("/export.csv")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<byte[]> exportApplicationsCsv() {
        List<String> headers = List.of(
                "Candidate", "Email", "Job", "Company", "Applied date", "AI score", "AI feedback", "Status");
        List<List<String>> rows = new ArrayList<>();
        for (Application a : applicationService.getAllApplications()) {
            String candidateName = a.getCandidate() != null
                    ? (a.getCandidate().getFirstName() + " " + a.getCandidate().getLastName()).trim()
                    : "";
            rows.add(List.of(
                    candidateName,
                    a.getCandidate() != null && a.getCandidate().getEmail() != null ? a.getCandidate().getEmail() : "",
                    a.getJobPosting() != null && a.getJobPosting().getTitle() != null ? a.getJobPosting().getTitle() : "",
                    a.getJobPosting() != null && a.getJobPosting().getCreatedByCompany() != null
                            ? String.valueOf(a.getJobPosting().getCreatedByCompany().getCompanyName()) : "",
                    a.getAppliedDate() != null ? a.getAppliedDate().toString() : "",
                    a.getAiScore() != null ? String.valueOf(a.getAiScore()) : "",
                    a.getAiFeedback() != null ? a.getAiFeedback() : "",
                    a.getStatus() != null ? a.getStatus() : ""));
        }
        byte[] csv = csvExportService.toCsv(headers, rows);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/csv"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"applications-export.csv\"")
                .body(csv);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<Void> deleteApplication(@PathVariable Long id) {
        applicationService.deleteApplication(id);
        return ResponseEntity.noContent().build();
    }
}

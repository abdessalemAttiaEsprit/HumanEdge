package tn.esprit.backend.controllers;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import tn.esprit.backend.dto.PublicJobResponse;
import tn.esprit.backend.entities.JobPosting;
import tn.esprit.backend.services.JobPostingService;

import java.util.List;

@RestController
@RequestMapping("/api/job")
@RequiredArgsConstructor
public class JobPostingController {

    private final JobPostingService jobPostingService;

    /**
     * Vitrine publique des offres ouvertes, affichée sur la page d'accueil aux
     * visiteurs non authentifiés. Aucune authentification requise (voir SecurityConfig).
     */
    @GetMapping("/public")
    public ResponseEntity<List<PublicJobResponse>> getPublicJobs(
            @RequestParam(defaultValue = "6") int limit) {
        return ResponseEntity.ok(jobPostingService.getPublicOpenJobs(limit));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<JobPosting> createJobPosting(@RequestBody JobPosting jobPosting) {
        JobPosting created = jobPostingService.createJobPosting(jobPosting);
        return new ResponseEntity<>(created, HttpStatus.CREATED);
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'EMPLOYE', 'GUEST')")
    public ResponseEntity<List<JobPosting>> getAllJobs() {
        return ResponseEntity.ok(jobPostingService.getAllJobs());
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'EMPLOYE', 'GUEST')")
    public ResponseEntity<JobPosting> getJobById(@PathVariable Long id) {
        return ResponseEntity.ok(jobPostingService.getJobById(id));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<JobPosting> updateJobPosting(@PathVariable Long id, @RequestBody JobPosting jobPosting) {
        return ResponseEntity.ok(jobPostingService.updateJobPosting(id, jobPosting));
    }

    @PatchMapping("/{id}/status")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<Void> changeJobStatus(@PathVariable Long id, @RequestParam String status) {
        jobPostingService.changeJobStatus(id, status);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<Void> deleteJob(@PathVariable Long id) {
        jobPostingService.deleteJob(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/department/{department}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'EMPLOYE', 'GUEST')")
    public ResponseEntity<List<JobPosting>> getJobsByDepartment(@PathVariable String department) {
        return ResponseEntity.ok(jobPostingService.getJobsByDepartment(department));
    }
}

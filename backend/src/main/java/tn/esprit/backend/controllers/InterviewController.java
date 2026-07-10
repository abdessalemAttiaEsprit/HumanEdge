package tn.esprit.backend.controllers;

import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import tn.esprit.backend.entities.Interview;
import tn.esprit.backend.services.InterviewService;

import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/interview")
@RequiredArgsConstructor
public class InterviewController {

    private final InterviewService interviewService;

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<Interview> createInterview(@RequestBody Interview interview) {
        Interview created = interviewService.createInterview(interview);
        return new ResponseEntity<>(created, HttpStatus.CREATED);
    }

    @PostMapping("/schedule")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<Interview> scheduleInterview(
            @RequestParam Long applicationId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime date,
            @RequestParam String location) {
        Interview interview = interviewService.scheduleInterview(applicationId, date, location);
        return new ResponseEntity<>(interview, HttpStatus.CREATED);
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<List<Interview>> getAllInterviews() {
        List<Interview> interviews = interviewService.getAllInterviews();
        return ResponseEntity.ok(interviews);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'GUEST')")
    public ResponseEntity<Interview> getInterviewById(@PathVariable Long id) {
        Interview interview = interviewService.getInterviewById(id);
        return ResponseEntity.ok(interview);
    }

    @GetMapping("/job/{jobPostingId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<List<Interview>> getInterviewsByJob(@PathVariable Long jobPostingId) {
        List<Interview> interviews = interviewService.getInterviewsByJob(jobPostingId);
        return ResponseEntity.ok(interviews);
    }

    @GetMapping("/application/{applicationId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'GUEST')")
    public ResponseEntity<List<Interview>> getInterviewsByApplication(@PathVariable Long applicationId) {
        List<Interview> interviews = interviewService.getInterviewsByApplication(applicationId);
        return ResponseEntity.ok(interviews);
    }

    @GetMapping("/candidate/{candidateId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'GUEST')")
    public ResponseEntity<List<Interview>> getInterviewsByCandidate(@PathVariable Long candidateId) {
        List<Interview> interviews = interviewService.getInterviewsByCandidate(candidateId);
        return ResponseEntity.ok(interviews);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<Interview> updateInterview(
            @PathVariable Long id,
            @RequestBody Interview interview) {
        Interview updated = interviewService.updateInterview(id, interview);
        return ResponseEntity.ok(updated);
    }

    @PatchMapping("/{id}/status")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<Interview> updateInterviewStatus(
            @PathVariable Long id,
            @RequestParam String status) {
        Interview updated = interviewService.updateInterviewStatus(id, status);
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<Void> deleteInterview(@PathVariable Long id) {
        interviewService.deleteInterview(id);
        return ResponseEntity.noContent().build();
    }
}

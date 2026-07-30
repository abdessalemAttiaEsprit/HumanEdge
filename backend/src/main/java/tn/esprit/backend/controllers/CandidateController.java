package tn.esprit.backend.controllers;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import tn.esprit.backend.entities.Candidate;
import tn.esprit.backend.exceptions.BadRequestException;
import tn.esprit.backend.services.CandidateServiceImpl;
import tn.esprit.backend.services.FileStorageService;
import tn.esprit.backend.services.PdfService;

import java.io.IOException;
import java.net.URLConnection;
import java.util.List;

@RestController
@RequestMapping("/api/candidate")
@RequiredArgsConstructor
@Slf4j
public class CandidateController {

    // En dessous de ce seuil, l'évaluation IA (RecruitingIAService) traite de toute façon le
    // CV comme illisible ("Texte du CV manquant (PDF scanné)") - autant prévenir le candidat
    // dès l'upload plutôt qu'un recruteur seulement plus tard en cliquant "Evaluate AI".
    private static final int MIN_CV_TEXT_LENGTH = 30;

    private final CandidateServiceImpl candidateService;
    private final FileStorageService fileStorageService;
    private final PdfService pdfService;

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'GUEST')")
    public ResponseEntity<Candidate> createCandidate(@RequestBody Candidate candidate) {
        Candidate created = candidateService.registerCandidate(candidate);
        return new ResponseEntity<>(created, HttpStatus.CREATED);
    }

    @PostMapping("/{id}/cv")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'GUEST')")
    public ResponseEntity<Candidate> uploadCandidateCv(
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file) {
        Candidate candidate = candidateService.getCandidateById(id);
        // Ne vaut que pour un PDF : l'évaluation IA (RecruitingIAService/PdfService) ne sait
        // de toute façon lire que du texte de PDF, pas les autres formats acceptés par
        // FileStorageService (image, doc/docx) - on ne valide donc pas ceux-là ici.
        if ("application/pdf".equals(file.getContentType())) {
            validateCvIsReadable(file);
        }
        String storedFilename = fileStorageService.store(file, "candidate_" + id, false);
        candidate.setCvFileId(storedFilename);
        Candidate updated = candidateService.updateCandidate(id, candidate);
        return ResponseEntity.ok(updated);
    }

    private void validateCvIsReadable(MultipartFile file) {
        String text;
        try {
            text = pdfService.extractTextFromPdf(file);
        } catch (IOException e) {
            log.warn("Impossible d'extraire le texte du CV à l'upload: {}", e.getMessage());
            throw new BadRequestException("Unable to read this PDF. Please try another file.");
        }
        if (text == null || text.trim().length() < MIN_CV_TEXT_LENGTH) {
            throw new BadRequestException(
                    "This PDF looks like a scanned image (no selectable text found). "
                            + "Please upload a text-based PDF so it can be evaluated by AI later.");
        }
    }

    @GetMapping("/{id}/cv")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'GUEST')")
    public ResponseEntity<Resource> downloadCandidateCv(@PathVariable Long id) {
        Candidate candidate = candidateService.getCandidateById(id);
        if (candidate.getCvFileId() == null) {
            return ResponseEntity.notFound().build();
        }

        Resource resource = fileStorageService.loadAsResource(candidate.getCvFileId());
        String contentType = URLConnection.guessContentTypeFromName(candidate.getCvFileId());
        if (contentType == null) {
            contentType = MediaType.APPLICATION_OCTET_STREAM_VALUE;
        }

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(contentType))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + resource.getFilename() + "\"")
                .body(resource);
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<List<Candidate>> getAllCandidates() {
        List<Candidate> candidates = candidateService.getAllCandidates();
        return ResponseEntity.ok(candidates);
    }

    /** Self-service : le profil candidat du compte GUEST connecté (404 s'il n'en a pas encore créé un). */
    @GetMapping("/me")
    @PreAuthorize("hasAnyRole('GUEST')")
    public ResponseEntity<Candidate> getMyCandidate() {
        return ResponseEntity.ok(candidateService.getMyCandidate());
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'GUEST')")
    public ResponseEntity<Candidate> getCandidateById(@PathVariable Long id) {
        Candidate candidate = candidateService.getCandidateById(id);
        return ResponseEntity.ok(candidate);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'GUEST')")
    public ResponseEntity<Candidate> updateCandidate(@PathVariable Long id, @RequestBody Candidate candidate) {
        Candidate updated = candidateService.updateCandidate(id, candidate);
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<Void> deleteCandidate(@PathVariable Long id) {
        candidateService.deleteCandidate(id);
        return ResponseEntity.noContent().build();
    }
}

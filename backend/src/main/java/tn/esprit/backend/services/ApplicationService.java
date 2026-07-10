package tn.esprit.backend.services;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import tn.esprit.backend.entities.Application;
import tn.esprit.backend.entities.Candidate;
import tn.esprit.backend.entities.JobPosting;
import tn.esprit.backend.exceptions.BadRequestException;
import tn.esprit.backend.exceptions.ResourceNotFoundException;
import tn.esprit.backend.repositories.ApplicationRepo;
import tn.esprit.backend.security.OwnershipGuard;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class ApplicationService {

    private final ApplicationRepo applicationRepository;
    private final CandidateServiceImpl candidateService;
    private final JobPostingService jobPostingService;
    private final OwnershipGuard ownershipGuard;
    private final FileStorageService fileStorageService;
    private final RecruitingIAService recruitingIAService;

    public Application applyToJob(Long candidateId, Long jobPostingId, String coverLetter) {
        // getCandidateById vérifie déjà qu'un GUEST ne postule qu'avec son propre profil candidat.
        Candidate candidate = candidateService.getCandidateById(candidateId);
        JobPosting job = jobPostingService.getJobById(jobPostingId);

        Application application = Application.builder()
                .candidate(candidate)
                .jobPosting(job)
                .coverLetter(coverLetter)
                .status("SUBMITTED")
                .appliedDate(LocalDateTime.now())
                .build();

        return applicationRepository.save(application);
    }

    public Application getApplicationById(Long id) {
        Application application = applicationRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Application not found"));
        checkCompanyOwnsApplication(application);
        if (ownershipGuard.isGuestRole()) {
            ownershipGuard.checkCandidateAccess(application.getCandidate());
        }
        return application;
    }


    public List<Application> getApplicationsByJob(Long jobPostingId) {
        JobPosting job = jobPostingService.getJobById(jobPostingId);
        checkCompanyOwnsJob(job);
        return applicationRepository.findByJobPostingId(jobPostingId);
    }


    public List<Application> getApplicationsByCandidate(Long candidateId) {
        // getCandidateById vérifie qu'un GUEST ne consulte que ses propres candidatures.
        candidateService.getCandidateById(candidateId);
        List<Application> applications = applicationRepository.findByCandidateId(candidateId);
        if (ownershipGuard.isCompanyRole()) {
            Long myCompanyId = ownershipGuard.currentCompanyId();
            applications.removeIf(app -> !ownsJob(app.getJobPosting(), myCompanyId));
        }
        return applications;
    }

    public Application updateAiEvaluation(Long applicationId, Double score, String feedback) {
        Application app = getApplicationById(applicationId); // vérifie déjà la propriété
        app.setAiScore(score);
        app.setAiFeedback(feedback);
        app.setEvaluatedAt(LocalDateTime.now());
        return applicationRepository.save(app);
    }

    /**
     * Évalue automatiquement une candidature via l'IA à partir du CV déjà déposé par le candidat
     * et de la description de l'offre, puis persiste le score et le feedback obtenus.
     */
    public Application evaluateApplicationWithAi(Long applicationId) throws IOException {
        Application app = getApplicationById(applicationId); // vérifie déjà la propriété

        Candidate candidate = app.getCandidate();
        if (candidate == null || candidate.getCvFileId() == null || candidate.getCvFileId().isBlank()) {
            throw new BadRequestException("The candidate has not uploaded a CV yet");
        }

        JobPosting job = app.getJobPosting();
        if (job == null || job.getDescription() == null || job.getDescription().isBlank()) {
            throw new BadRequestException("The job posting has no description");
        }

        byte[] cvBytes = fileStorageService.loadAsResource(candidate.getCvFileId()).getInputStream().readAllBytes();
        Map<String, Object> result = recruitingIAService.evaluateCandidateMatch(job.getDescription(), cvBytes);

        Double score = ((Number) result.getOrDefault("score", 0)).doubleValue();
        String feedback = String.valueOf(result.get("feedback"));
        return updateAiEvaluation(applicationId, score, feedback);
    }

    public Application createApplication(Application application) {
        if (application.getJobPosting() != null && application.getJobPosting().getId() != null) {
            JobPosting job = jobPostingService.getJobById(application.getJobPosting().getId());
            checkCompanyOwnsJob(job);
        }
        application.setAppliedDate(LocalDateTime.now());
        if (application.getStatus() == null) {
            application.setStatus("SUBMITTED");
        }
        return applicationRepository.save(application);
    }

    public Application updateApplicationStatus(Long applicationId, String status) {
        Application app = getApplicationById(applicationId); // vérifie déjà la propriété
        app.setStatus(status);
        return applicationRepository.save(app);
    }

    public List<Application> getAllApplications() {
        if (ownershipGuard.isAdmin()) {
            return applicationRepository.findAll();
        }
        return applicationRepository.findByJobPosting_CreatedByCompany_IdCompany(ownershipGuard.currentCompanyId());
    }

    public void deleteApplication(Long id) {
        Application app = getApplicationById(id); // vérifie déjà la propriété
        applicationRepository.delete(app);
    }

    public Application updateApplication(Long id, Application applicationDetails) {
        Application app = getApplicationById(id); // vérifie déjà la propriété
        app.setCoverLetter(applicationDetails.getCoverLetter());
        app.setStatus(applicationDetails.getStatus());
        return applicationRepository.save(app);
    }

    private void checkCompanyOwnsApplication(Application application) {
        if (application.getJobPosting() != null) {
            checkCompanyOwnsJob(application.getJobPosting());
        }
    }

    private void checkCompanyOwnsJob(JobPosting job) {
        if (!ownershipGuard.isCompanyRole()) {
            return; // ADMIN : accès total ; GUEST : vérifié séparément via le candidat (checkCandidateAccess)
        }
        Long ownerCompanyId = job.getCreatedByCompany() != null ? job.getCreatedByCompany().getIdCompany() : null;
        ownershipGuard.checkCompanyAccess(ownerCompanyId);
    }

    private boolean ownsJob(JobPosting job, Long companyId) {
        return job != null && job.getCreatedByCompany() != null
                && job.getCreatedByCompany().getIdCompany().equals(companyId);
    }
}
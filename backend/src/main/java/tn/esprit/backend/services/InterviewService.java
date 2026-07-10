package tn.esprit.backend.services;


import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tn.esprit.backend.entities.Application;
import tn.esprit.backend.entities.Interview;
import tn.esprit.backend.entities.JobPosting;
import tn.esprit.backend.exceptions.ResourceNotFoundException;
import tn.esprit.backend.repositories.InterviewRepo;
import tn.esprit.backend.security.OwnershipGuard;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class InterviewService {

    private final InterviewRepo interviewRepository;
    private final ApplicationService applicationService;
    private final JobPostingService jobPostingService;
    private final CandidateServiceImpl candidateService;
    private final OwnershipGuard ownershipGuard;
    private final InterviewEmailNotificationService interviewEmailNotificationService;

    @Transactional // Garantit que l'entretien ET la candidature sont mis à jour ensemble
    public Interview scheduleInterview(Long applicationId, LocalDateTime date, String location) {
        // getApplicationById vérifie déjà que l'application appartient à l'entreprise courante.
        Application app = applicationService.getApplicationById(applicationId);

        // Mettre à jour les données d'entretien dans la candidature
        app.setInterviewDate(date);
        app.setInterviewLocation(location);
        app.setStatus("SHORTLISTED");
        applicationService.updateApplicationStatus(applicationId, "SHORTLISTED");

        Interview interview = Interview.builder()
                .candidate(app.getCandidate())
                .application(app)
                .job(app.getJobPosting())
                .interviewDate(date)
                .interviewLocation(location)
                .status("SCHEDULED")
                .createdAt(LocalDateTime.now())
                .build();

        Interview saved = interviewRepository.save(interview);
        interviewEmailNotificationService.notifyInterviewScheduled(app.getCandidate(), app.getJobPosting(), saved);
        return saved;
    }


    public Interview updateInterviewStatus(Long interviewId, String status) {
        Interview interview = getInterviewById(interviewId); // vérifie déjà la propriété
        interview.setStatus(status);

        // Si l'entretien est complété, on peut aussi basculer automatiquement le statut de l'application
        // et prévenir le candidat par email (voir InterviewEmailNotificationService).
        if ("COMPLETED".equals(status)) {
            applicationService.updateApplicationStatus(interview.getApplication().getId(), "UNDER_REVIEW");
            interviewEmailNotificationService.notifyInterviewCompleted(interview.getCandidate(), interview.getJob(), interview);
        }

        return interviewRepository.save(interview);
    }

    public Interview createInterview(Interview interview) {
        if (interview.getJob() != null && interview.getJob().getId() != null) {
            JobPosting job = jobPostingService.getJobById(interview.getJob().getId());
            checkCompanyOwnsJob(job);
        }
        if (interview.getCreatedAt() == null) {
            interview.setCreatedAt(LocalDateTime.now());
        }
        return interviewRepository.save(interview);
    }

    public Interview getInterviewById(Long id) {
        Interview interview = interviewRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Interview not found"));
        if (interview.getJob() != null) {
            checkCompanyOwnsJob(interview.getJob());
        }
        if (ownershipGuard.isGuestRole()) {
            ownershipGuard.checkCandidateAccess(interview.getCandidate());
        }
        return interview;
    }


    public List<Interview> getInterviewsByJob(Long jobPostingId) {
        JobPosting job = jobPostingService.getJobById(jobPostingId);
        checkCompanyOwnsJob(job);
        return interviewRepository.findByJobId(jobPostingId);
    }

    public List<Interview> getInterviewsByApplication(Long applicationId) {
        // getApplicationById vérifie qu'un GUEST ne consulte que ses propres entretiens.
        applicationService.getApplicationById(applicationId);
        List<Interview> interviews = interviewRepository.findByApplicationId(applicationId);
        return filterByCompanyIfNeeded(interviews);
    }

    public List<Interview> getInterviewsByCandidate(Long candidateId) {
        // getCandidateById vérifie qu'un GUEST ne consulte que ses propres entretiens.
        candidateService.getCandidateById(candidateId);
        List<Interview> interviews = interviewRepository.findByCandidateId(candidateId);
        return filterByCompanyIfNeeded(interviews);
    }

    public List<Interview> getAllInterviews() {
        if (ownershipGuard.isAdmin()) {
            return interviewRepository.findAll();
        }
        return interviewRepository.findByJob_CreatedByCompany_IdCompany(ownershipGuard.currentCompanyId());
    }

    public Interview updateInterview(Long id, Interview interviewDetails) {
        Interview interview = getInterviewById(id); // vérifie déjà la propriété
        interview.setInterviewDate(interviewDetails.getInterviewDate());
        interview.setInterviewLocation(interviewDetails.getInterviewLocation());
        interview.setStatus(interviewDetails.getStatus());
        return interviewRepository.save(interview);
    }

    public void deleteInterview(Long id) {
        Interview interview = getInterviewById(id); // vérifie déjà la propriété
        interviewRepository.delete(interview);
    }

    private void checkCompanyOwnsJob(JobPosting job) {
        if (!ownershipGuard.isCompanyRole()) {
            return; // ADMIN : accès total ; GUEST : vérifié séparément via le candidat (checkCandidateAccess)
        }
        Long ownerCompanyId = job.getCreatedByCompany() != null ? job.getCreatedByCompany().getIdCompany() : null;
        ownershipGuard.checkCompanyAccess(ownerCompanyId);
    }

    /** Empêche une entreprise de voir les entretiens d'une autre entreprise dans une liste agrégée. */
    private List<Interview> filterByCompanyIfNeeded(List<Interview> interviews) {
        if (!ownershipGuard.isCompanyRole()) {
            return interviews;
        }
        Long myCompanyId = ownershipGuard.currentCompanyId();
        interviews.removeIf(i -> i.getJob() == null || i.getJob().getCreatedByCompany() == null
                || !i.getJob().getCreatedByCompany().getIdCompany().equals(myCompanyId));
        return interviews;
    }
}
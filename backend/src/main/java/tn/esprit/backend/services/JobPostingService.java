package tn.esprit.backend.services;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import tn.esprit.backend.dto.PublicJobResponse;
import tn.esprit.backend.entities.JobPosting;
import tn.esprit.backend.repositories.JobPostingRepo;
import tn.esprit.backend.security.OwnershipGuard;
import java.util.List;

@Service
@RequiredArgsConstructor
public class JobPostingService {

    private final JobPostingRepo jobPostingRepository;
    private final OwnershipGuard ownershipGuard;

    public JobPosting createJobPosting(JobPosting jobPosting) {
        // Une entreprise ne peut créer une offre que pour elle-même : on ignore toute
        // valeur de createdByCompany envoyée par le client et on impose la sienne.
        if (!ownershipGuard.isAdmin()) {
            jobPosting.setCreatedByCompany(ownershipGuard.currentUser().getCompany());
        }
        jobPosting.setDatePosted(java.time.LocalDateTime.now());
        jobPosting.setStatus("OPEN");
        return jobPostingRepository.save(jobPosting);
    }


    public JobPosting updateJobPosting(Long id, JobPosting jobPosting) {
        JobPosting existing = getJobByIdForOwner(id);
        existing.setTitle(jobPosting.getTitle());
        existing.setDescription(jobPosting.getDescription());
        existing.setDepartment(jobPosting.getDepartment());
        existing.setRequiredSkills(jobPosting.getRequiredSkills());
        existing.setJobType(jobPosting.getJobType());
        existing.setDeadline(jobPosting.getDeadline());
        return jobPostingRepository.save(existing);
    }

    /** Offres ouvertes à la navigation de tous les rôles authentifiés : pas de filtrage par propriétaire. */
    public List<JobPosting> getAllJobs() { return jobPostingRepository.findAll(); }

    public JobPosting getJobById(Long id) {
        return jobPostingRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Job posting not found with id: " + id));
    }

    public void deleteJob(Long id) {
        JobPosting existing = getJobByIdForOwner(id);
        jobPostingRepository.delete(existing);
    }

    /** Offres ouvertes à la navigation de tous les rôles authentifiés : pas de filtrage par propriétaire. */
    public List<JobPosting> getJobsByDepartment(String department) {
        return jobPostingRepository.findByDepartment(department);
    }

    public void changeJobStatus(Long id, String status) {
        JobPosting job = getJobByIdForOwner(id);
        job.setStatus(status);
        jobPostingRepository.save(job);
    }

    /** Comme getJobById, mais vérifie que l'offre appartient bien à l'entreprise courante (pour les écritures). */
    private JobPosting getJobByIdForOwner(Long id) {
        JobPosting job = getJobById(id);
        Long ownerCompanyId = job.getCreatedByCompany() != null ? job.getCreatedByCompany().getIdCompany() : null;
        ownershipGuard.checkCompanyAccess(ownerCompanyId);
        return job;
    }

    /**
     * Offres ouvertes destinées à la vitrine publique (page d'accueil, visiteurs non
     * authentifiés). Renvoie une projection sans données sensibles de l'entreprise.
     */
    public List<PublicJobResponse> getPublicOpenJobs(int limit) {
        return jobPostingRepository.findByStatusOrderByDatePostedDesc("OPEN").stream()
                .limit(Math.max(limit, 0))
                .map(this::toPublicResponse)
                .toList();
    }

    private PublicJobResponse toPublicResponse(JobPosting job) {
        return PublicJobResponse.builder()
                .id(job.getId())
                .title(job.getTitle())
                .description(job.getDescription())
                .department(job.getDepartment())
                .requiredSkills(job.getRequiredSkills())
                .jobType(job.getJobType())
                .datePosted(job.getDatePosted())
                .deadline(job.getDeadline())
                .companyName(job.getCreatedByCompany() != null ? job.getCreatedByCompany().getCompanyName() : null)
                .build();
    }
}

package tn.esprit.backend.services;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import tn.esprit.backend.entities.Diploma;
import tn.esprit.backend.entities.Personnel;
import tn.esprit.backend.exceptions.BadRequestException;
import tn.esprit.backend.exceptions.ResourceNotFoundException;
import tn.esprit.backend.repositories.DiplomaRepo;
import tn.esprit.backend.repositories.PersonnelRepo;
import tn.esprit.backend.security.OwnershipGuard;

import java.time.LocalDateTime;
import java.util.List;

/** Diplômes (nom + image justificative) rattachés à un employé - un employé peut en avoir plusieurs. */
@Service
@RequiredArgsConstructor
public class DiplomaService {

    private final DiplomaRepo diplomaRepository;
    private final PersonnelRepo personnelRepository;
    private final OwnershipGuard ownershipGuard;
    private final FileStorageService fileStorageService;

    @Transactional
    public Diploma addMyDiploma(String name, MultipartFile file) {
        Personnel me = myPersonnel();
        return saveDiploma(me, name, file);
    }

    @Transactional
    public Diploma companyAddDiploma(Long personnelId, String name, MultipartFile file) {
        Personnel personnel = personnelRepository.findById(personnelId)
                .orElseThrow(() -> new ResourceNotFoundException("Personnel not found"));
        ownershipGuard.checkPersonnelAccess(personnel);
        return saveDiploma(personnel, name, file);
    }

    @Transactional(readOnly = true)
    public List<Diploma> getMyDiplomas() {
        Personnel me = myPersonnel();
        return diplomaRepository.findByPersonnel_IdPersonnelOrderByCreatedAtDesc(me.getIdPersonnel());
    }

    @Transactional(readOnly = true)
    public List<Diploma> getForPersonnel(Long personnelId) {
        Personnel personnel = personnelRepository.findById(personnelId)
                .orElseThrow(() -> new ResourceNotFoundException("Personnel not found"));
        ownershipGuard.checkPersonnelAccess(personnel);
        return diplomaRepository.findByPersonnel_IdPersonnelOrderByCreatedAtDesc(personnel.getIdPersonnel());
    }

    @Transactional
    public void deleteDiploma(Long id) {
        Diploma diploma = diplomaRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Diploma not found with id: " + id));
        ownershipGuard.checkPersonnelAccess(diploma.getPersonnel());
        diplomaRepository.delete(diploma);
    }

    private Diploma saveDiploma(Personnel personnel, String name, MultipartFile file) {
        if (name == null || name.isBlank()) {
            throw new BadRequestException("Diploma name is required");
        }
        String storedFilename = fileStorageService.store(file, "diploma_" + personnel.getIdPersonnel(), true);
        if (storedFilename == null) {
            throw new BadRequestException("Diploma image is required");
        }
        Diploma diploma = Diploma.builder()
                .name(name)
                .image(storedFilename)
                .personnel(personnel)
                .createdAt(LocalDateTime.now())
                .build();
        return diplomaRepository.save(diploma);
    }

    private Personnel myPersonnel() {
        Long userId = ownershipGuard.currentUser().getIdUser();
        return personnelRepository.findByUser_IdUser(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Personnel record not found"));
    }
}

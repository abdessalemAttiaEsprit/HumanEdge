package tn.esprit.backend.controllers;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import tn.esprit.backend.entities.Contract;
import tn.esprit.backend.services.ContractService;
import tn.esprit.backend.services.CsvExportService;

import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/contracts")
@RequiredArgsConstructor
public class ContractController {

    private final ContractService contractService;
    private final CsvExportService csvExportService;

    /**
     * GET /api/contracts : Récupérer tous les contrats.
     */
    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<List<Contract>> getAllContracts() {
        List<Contract> contracts = contractService.getAllContracts();
        return ResponseEntity.ok(contracts);
    }

    /** Contrats visibles par l'appelant (voir ContractService#getAllContracts) en CSV. */
    @GetMapping("/export.csv")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<byte[]> exportContractsCsv() {
        List<String> headers = List.of(
                "Employee", "Role", "Type", "Start date", "End date", "Category", "Step", "Base salary");
        List<List<String>> rows = new ArrayList<>();
        for (Contract c : contractService.getAllContracts()) {
            String employee = c.getPersonnel() != null && c.getPersonnel().getUser() != null
                    ? (c.getPersonnel().getUser().getFirstname() + " " + c.getPersonnel().getUser().getLastname()).trim()
                    : "";
            rows.add(List.of(
                    employee,
                    c.getWork() != null ? c.getWork() : "",
                    c.getTypeContrat() != null ? c.getTypeContrat().name() : "",
                    c.getDateDebut() != null ? c.getDateDebut().toString() : "",
                    c.getDateFin() != null ? c.getDateFin().toString() : "",
                    c.getCategorie() != null ? c.getCategorie() : "",
                    c.getEchelon() != null ? String.valueOf(c.getEchelon()) : "",
                    c.getSalaireBase() != null ? String.valueOf(c.getSalaireBase()) : ""));
        }
        byte[] csv = csvExportService.toCsv(headers, rows);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/csv"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"contracts-export.csv\"")
                .body(csv);
    }

    /**
     * GET /api/contracts/{id} : Récupérer un contrat par son ID.
     */
    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'EMPLOYE')")
    public ResponseEntity<Contract> getContractById(@PathVariable Long id) {
        Contract contract = contractService.getContractById(id);
        return ResponseEntity.ok(contract);
    }

    /**
     * POST /api/contracts : Créer un nouveau contrat.
     */
    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<Contract> createContract(@RequestBody Contract contract) {
        Contract createdContract = contractService.createContract(contract);
        return ResponseEntity.status(HttpStatus.CREATED).body(createdContract);
    }

    /**
     * PUT /api/contracts/{id} : Mettre à jour un contrat existant.
     */
    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<Contract> updateContract(@PathVariable Long id, @RequestBody Contract contractDetails) {
        Contract updatedContract = contractService.updateContract(id, contractDetails);
        return ResponseEntity.ok(updatedContract);
    }

    /**
     * DELETE /api/contracts/{id} : Supprimer un contrat.
     */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<Void> deleteContract(@PathVariable Long id) {
        contractService.deleteContract(id);
        return ResponseEntity.noContent().build(); // Renvoie un statut 204 No Content
    }
}

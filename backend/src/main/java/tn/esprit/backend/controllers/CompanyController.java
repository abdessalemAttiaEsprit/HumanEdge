package tn.esprit.backend.controllers;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import tn.esprit.backend.dto.SubscriptionPaymentRequest;
import tn.esprit.backend.entities.Company;
import tn.esprit.backend.entities.Subscription;
import tn.esprit.backend.exceptions.ResourceNotFoundException;
import tn.esprit.backend.services.CompanyService;
import tn.esprit.backend.services.CsvExportService;
import tn.esprit.backend.services.SubscriptionService;

import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/companies")
@RequiredArgsConstructor
public class CompanyController {

    private final CompanyService companyService;
    private final SubscriptionService subscriptionService;
    private final CsvExportService csvExportService;

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public Company createCompany(@Valid @RequestBody Company company) {
        return companyService.createCompany(company);
    }

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public List<Company> getAllCompanies() {
        return companyService.getAllCompanies();
    }

    @GetMapping("/export.csv")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<byte[]> exportCompaniesCsv() {
        List<String> headers = List.of(
                "Company", "Fiscal number", "CNSS number", "City", "Phone", "Verified", "Active", "Registered on");
        List<List<String>> rows = new ArrayList<>();
        for (Company c : companyService.getAllCompanies()) {
            rows.add(List.of(
                    c.getCompanyName() != null ? c.getCompanyName() : "",
                    c.getFiscalNumber() != null ? c.getFiscalNumber() : "",
                    c.getCnssNumber() != null ? c.getCnssNumber() : "",
                    c.getCity() != null ? c.getCity() : "",
                    c.getPhone() != null ? c.getPhone() : "",
                    Boolean.TRUE.equals(c.getVerified()) ? "Yes" : "No",
                    Boolean.TRUE.equals(c.getActive()) ? "Yes" : "No",
                    c.getCreatedAt() != null ? c.getCreatedAt().toString() : ""));
        }
        byte[] csv = csvExportService.toCsv(headers, rows);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/csv"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"companies-export.csv\"")
                .body(csv);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public Company getCompanyById(@PathVariable Long id) {
        return companyService.getCompanyById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Company not found with id: " + id));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public Company updateCompany(@PathVariable Long id,
                                 @Valid @RequestBody Company company) {
        return companyService.updateCompany(id, company);
    }

    /** Uploads/replaces the company logo. Served back publicly under /uploads/{filename}. */
    @PostMapping("/{id}/logo")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public Company uploadLogo(@PathVariable Long id, @RequestParam("file") MultipartFile file) {
        return companyService.uploadLogo(id, file);
    }

    /** Abonnement plateforme souscrit à l'inscription (voir Subscription/PaymentSimulatorService). */
    @GetMapping("/{id}/subscription")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public Subscription getSubscription(@PathVariable Long id) {
        return subscriptionService.getSubscription(id);
    }

    /**
     * Renouvelle (même plan) ou change de plan d'abonnement — un nouveau paiement simulé est
     * toujours effectué (voir SubscriptionService.updateSubscription).
     */
    @PutMapping("/{id}/subscription")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public Subscription updateSubscription(@PathVariable Long id, @Valid @RequestBody SubscriptionPaymentRequest request) {
        return subscriptionService.updateSubscription(id, request);
    }

    @PutMapping("/{id}/subscription/cancel")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public Subscription cancelSubscription(@PathVariable Long id) {
        return subscriptionService.cancelSubscription(id);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public void deleteCompany(@PathVariable Long id) {
        companyService.deleteCompany(id);
    }

    /**
     * Suppression en cascade : supprime aussi les comptes utilisateurs, le personnel, les
     * contrats, les paiements, l'abonnement et les offres d'emploi de l'entreprise. Irréversible
     * — à utiliser uniquement quand {@link #deleteCompany} ne suffit pas.
     */
    @DeleteMapping("/{id}/force")
    @PreAuthorize("hasRole('ADMIN')")
    public void deleteCompanyCascade(@PathVariable Long id) {
        companyService.deleteCompanyCascade(id);
    }

    @PutMapping("/{id}/verify")
    @PreAuthorize("hasRole('ADMIN')")
    public Company verifyCompany(@PathVariable Long id) {
        return companyService.verifyCompany(id);
    }

    @PutMapping("/{id}/activate")
    @PreAuthorize("hasRole('ADMIN')")
    public Company activateCompany(@PathVariable Long id) {
        return companyService.activateCompany(id);
    }

    @PutMapping("/{id}/deactivate")
    @PreAuthorize("hasRole('ADMIN')")
    public Company deactivateCompany(@PathVariable Long id) {
        return companyService.deactivateCompany(id);
    }
}

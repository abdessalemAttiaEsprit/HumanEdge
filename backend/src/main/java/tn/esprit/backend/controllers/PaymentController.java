package tn.esprit.backend.controllers;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import tn.esprit.backend.entities.Payment;
import tn.esprit.backend.services.PaymentService;
import tn.esprit.backend.services.PaymentSuggestionService;
import tn.esprit.backend.services.PdfService;

import java.time.Month;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/payments")
@RequiredArgsConstructor
public class PaymentController {

    private final PaymentService paymentService;
    private final PdfService pdfService;
    private final PaymentSuggestionService paymentSuggestionService;

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<List<Payment>> getAllPayments() {
        return ResponseEntity.ok(paymentService.getAllPayments());
    }

    /** Self-service : mes propres fiches de paie (surtout utile pour EMPLOYE). */
    @GetMapping("/me")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'EMPLOYE')")
    public ResponseEntity<List<Payment>> getMyPayments() {
        return ResponseEntity.ok(paymentService.getMyPayments());
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'EMPLOYE')")
    public ResponseEntity<Payment> getPaymentById(@PathVariable Long id) {
        return ResponseEntity.ok(paymentService.getPaymentById(id));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<Payment> createPayment(@RequestBody Payment payment) {
        Payment createdPayment = paymentService.createPayment(payment);
        return ResponseEntity.status(HttpStatus.CREATED).body(createdPayment);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<Payment> updatePayment(@PathVariable Long id, @RequestBody Payment paymentDetails) {
        return ResponseEntity.ok(paymentService.updatePayment(id, paymentDetails));
    }

    @PatchMapping("/{id}/validate")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<Payment> validatePayment(@PathVariable Long id) {
        return ResponseEntity.ok(paymentService.validatePayment(id));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> deletePayment(@PathVariable Long id) {
        paymentService.deletePayment(id);
        return ResponseEntity.noContent().build();
    }

    /** Génère automatiquement la paie du mois pour tous les salariés actifs (voir PaymentService). */
    @PostMapping("/generate")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<PaymentService.PayrollGenerationSummary> generateMonthlyPayroll(
            @RequestParam Month month,
            @RequestParam int year,
            @RequestParam(required = false) Long companyId) {
        return ResponseEntity.ok(paymentService.generateMonthlyPayroll(month, year, companyId));
    }

    @GetMapping("/salary-categories")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<Map<String, String>> getSalaryCategories() {
        return ResponseEntity.ok(paymentSuggestionService.getAvailableCategories());
    }

    @GetMapping("/salary-suggestion")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY')")
    public ResponseEntity<PaymentSuggestionService.CategorySuggestion> suggestSalary(
            @RequestParam String categorie,
            @RequestParam int anneesExperience) {
        return ResponseEntity.ok(paymentSuggestionService.suggererProfilRH(categorie, anneesExperience));
    }

    @GetMapping("/{id}/fiche-paie-pdf")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY', 'EMPLOYE')")
    public ResponseEntity<byte[]> downloadFichePaiePdf(@PathVariable Long id) {
        Payment payment = paymentService.getPaymentById(id);
        byte[] pdf = pdfService.generateFichePaie(payment);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"fiche_paie_" + id + ".pdf\"")
                .body(pdf);
    }
}
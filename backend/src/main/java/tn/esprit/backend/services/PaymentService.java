package tn.esprit.backend.services;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tn.esprit.backend.entities.Contract;
import tn.esprit.backend.entities.Payment;
import tn.esprit.backend.entities.Personnel;
import tn.esprit.backend.exceptions.BadRequestException;
import tn.esprit.backend.exceptions.ResourceNotFoundException;
import tn.esprit.backend.repositories.ContractRepo;
import tn.esprit.backend.repositories.PaymentRepo;
import tn.esprit.backend.repositories.PersonnelRepo;
import tn.esprit.backend.security.OwnershipGuard;

import java.time.LocalDate;
import java.time.Month;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class PaymentService {

    private final PaymentRepo paymentRepository;
    private final PersonnelRepo personnelRepository;
    private final ContractRepo contractRepository;
    private final OwnershipGuard ownershipGuard;
    private final PaymentEmailNotificationService paymentEmailNotificationService;
    private final PaymentSuggestionService paymentSuggestionService;
    private final SalaryCalculationService salaryCalculationService;

    @Transactional(readOnly = true)
    public List<Payment> getAllPayments() {
        if (ownershipGuard.isAdmin()) {
            return paymentRepository.findAll();
        }
        return paymentRepository.findByCompany_IdCompany(ownershipGuard.currentCompanyId());
    }

    @Transactional(readOnly = true)
    public Payment getPaymentById(Long id) {
        Payment payment = paymentRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Paiement non trouvé avec l'id : " + id));
        checkPaymentAccess(payment);
        return payment;
    }

    @Transactional
    public Payment createPayment(Payment payment) {
        checkTargetAccess(payment);
        return paymentRepository.save(payment);
    }

    /**
     * Self-service : fiches de paie de l'utilisateur connecté (EMPLOYE), les plus
     * récentes d'abord.
     */
    @Transactional(readOnly = true)
    public List<Payment> getMyPayments() {
        Long userId = ownershipGuard.currentUser().getIdUser();
        return paymentRepository.findByPersonnel_User_IdUserOrderByYearDesc(userId);
    }

    @Transactional
    public Payment updatePayment(Long id, Payment paymentDetails) {
        Payment existingPayment = getPaymentById(id); // vérifie déjà la propriété

        existingPayment.setPaymentDate(paymentDetails.getPaymentDate());
        existingPayment.setMonth(paymentDetails.getMonth());
        existingPayment.setYear(paymentDetails.getYear());
        existingPayment.setAbsences(paymentDetails.getAbsences()); // Met à jour la liste des absences
        existingPayment.setMontantCnss(paymentDetails.getMontantCnss());
        existingPayment.setMontantIrpp(paymentDetails.getMontantIrpp());
        existingPayment.setStatus(paymentDetails.getStatus());
        existingPayment.setContrat(paymentDetails.getContrat());
        existingPayment.setPayed(paymentDetails.getPayed());

        // Ne réassigne personnel/company que si explicitement fournis, et seulement après avoir
        // vérifié que la nouvelle cible appartient bien à l'appelant — jamais faire confiance à
        // l'entité imbriquée envoyée par le client sans la recharger (même défaut que
        // checkTargetAccess corrigeait déjà pour la création).
        if (paymentDetails.getPersonnel() != null && paymentDetails.getPersonnel().getIdPersonnel() != null) {
            Personnel realPersonnel = personnelRepository.findById(paymentDetails.getPersonnel().getIdPersonnel())
                    .orElseThrow(() -> new ResourceNotFoundException("Personnel not found"));
            ownershipGuard.checkPersonnelAccess(realPersonnel);
            existingPayment.setPersonnel(realPersonnel);
        }
        if (paymentDetails.getCompany() != null && paymentDetails.getCompany().getIdCompany() != null) {
            ownershipGuard.checkCompanyAccess(paymentDetails.getCompany().getIdCompany());
            existingPayment.setCompany(paymentDetails.getCompany());
        }

        return paymentRepository.save(existingPayment);
    }

    /**
     * Valide un paiement et notifie l'employé concerné par email.
     */
    @Transactional
    public Payment validatePayment(Long id) {
        Payment payment = getPaymentById(id); // vérifie déjà la propriété
        payment.setStatus("VALIDATED");
        Payment saved = paymentRepository.save(payment);
        paymentEmailNotificationService.notifyPaymentValidated(saved.getPersonnel(), saved);
        return saved;
    }

    @Transactional
    public void deletePayment(Long id) {
        Payment payment = getPaymentById(id); // vérifie déjà la propriété
        paymentRepository.delete(payment);
    }

    /**
     * Résumé d'une génération automatique de la paie d'un mois : les paiements créés, et le
     * décompte de ceux ignorés (déjà générés, ou salarié sans contrat actif ce mois-là).
     */
    public record PayrollGenerationSummary(List<Payment> created, int alreadyGenerated, int skippedNoActiveContract) {}

    /**
     * Génère automatiquement les bulletins de paie (statut DRAFT) de tous les salariés dont le
     * contrat est actif sur le mois donné : CNSS (9,18%), IRPP et salaire net sont calculés à
     * partir du contrat (voir {@link SalaryCalculationService}), après avoir d'abord recalé
     * l'échelon salarial si nécessaire (même règle que {@link ContractService#getAllContracts}).
     * Idempotent : un salarié qui a déjà un paiement pour ce mois/année n'est pas dupliqué — il
     * faut passer par l'édition manuelle (voir updatePayment) pour le corriger.
     */
    @Transactional
    public PayrollGenerationSummary generateMonthlyPayroll(Month month, int year, Long companyIdParam) {
        Long companyId = ownershipGuard.isAdmin() ? companyIdParam : ownershipGuard.currentCompanyId();
        if (companyId == null) {
            throw new BadRequestException(ownershipGuard.isAdmin()
                    ? "companyId is required"
                    : "Your account is not linked to a company");
        }
        ownershipGuard.checkCompanyAccess(companyId);

        YearMonth targetMonth = YearMonth.of(year, month);
        LocalDate monthStart = targetMonth.atDay(1);
        LocalDate monthEnd = targetMonth.atEndOfMonth();

        List<Payment> created = new ArrayList<>();
        int alreadyGenerated = 0;
        int skippedNoActiveContract = 0;

        for (Personnel personnel : personnelRepository.findByUser_Company_IdCompany(companyId)) {
            Contract contract = personnel.getContract();
            boolean hasActiveContract = contract != null && contract.getDateDebut() != null
                    && !contract.getDateDebut().isAfter(monthEnd)
                    && (contract.getDateFin() == null || !contract.getDateFin().isBefore(monthStart));
            if (!hasActiveContract) {
                skippedNoActiveContract++;
                continue;
            }
            if (paymentRepository.existsByPersonnel_IdPersonnelAndMonthAndYear(personnel.getIdPersonnel(), month, year)) {
                alreadyGenerated++;
                continue;
            }

            if (paymentSuggestionService.applyAutomaticEchelon(contract)) {
                contractRepository.save(contract);
            }

            long unjustifiedDays = AbsenceQuotaCalculator.countAbsenceDaysByPredicate(
                    personnel.getAbsences(), monthStart, monthEnd, a -> !AbsenceQuotaCalculator.isJustified(a));
            SalaryCalculationService.SalaryBreakdown salary = salaryCalculationService.compute(
                    nz(contract.getSalaireBase()), nz(contract.getAvantages()), unjustifiedDays);

            Payment payment = Payment.builder()
                    .month(month)
                    .year(year)
                    .status("DRAFT")
                    .montantCnss(salary.montantCnss())
                    .montantIrpp(salary.montantIrpp())
                    .payed(salary.net())
                    .personnel(personnel)
                    .contrat(contract)
                    .company(personnel.getUser().getCompany())
                    .build();
            created.add(paymentRepository.save(payment));
        }

        return new PayrollGenerationSummary(created, alreadyGenerated, skippedNoActiveContract);
    }

    private static double nz(Double value) {
        return value == null ? 0.0 : value;
    }

    /**
     * Un paiement référence à la fois un Personnel et une Company : on vérifie la propriété
     * via le personnel en priorité (plus précis pour un EMPLOYE), sinon via la company directe.
     * Utilisé pour les paiements déjà chargés depuis la base (get/update/validate/delete),
     * où {@code payment.getPersonnel()} est une entité JPA réelle (proxy géré par Hibernate).
     */
    private void checkPaymentAccess(Payment payment) {
        if (ownershipGuard.isAdmin()) {
            return;
        }
        if (payment.getPersonnel() != null) {
            ownershipGuard.checkPersonnelAccess(payment.getPersonnel());
            return;
        }
        if (payment.getCompany() != null) {
            ownershipGuard.checkCompanyAccess(payment.getCompany().getIdCompany());
            return;
        }
        throw new AccessDeniedException("You do not have access to this resource");
    }

    /**
     * Variante utilisée à la création : {@code payment.getPersonnel()} vient directement du
     * JSON envoyé par le client (souvent juste {@code idPersonnel}, sans son User/Company
     * imbriqué) — on ne peut donc pas lui faire confiance pour la vérification d'accès, il
     * faut recharger le vrai Personnel depuis la base avant d'appeler checkPersonnelAccess.
     */
    private void checkTargetAccess(Payment payment) {
        if (ownershipGuard.isAdmin()) {
            return;
        }
        if (payment.getPersonnel() != null && payment.getPersonnel().getIdPersonnel() != null) {
            Personnel realPersonnel = personnelRepository.findById(payment.getPersonnel().getIdPersonnel())
                    .orElseThrow(() -> new ResourceNotFoundException("Personnel not found"));
            ownershipGuard.checkPersonnelAccess(realPersonnel);
            return;
        }
        if (payment.getCompany() != null && payment.getCompany().getIdCompany() != null) {
            ownershipGuard.checkCompanyAccess(payment.getCompany().getIdCompany());
            return;
        }
        throw new AccessDeniedException("An associated personnel or company record is required");
    }
}

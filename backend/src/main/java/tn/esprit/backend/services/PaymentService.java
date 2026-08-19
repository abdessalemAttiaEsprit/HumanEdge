package tn.esprit.backend.services;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tn.esprit.backend.entities.Absence;
import tn.esprit.backend.entities.Contract;
import tn.esprit.backend.entities.Enum.Role;
import tn.esprit.backend.entities.Enum.SyncSourceType;
import tn.esprit.backend.entities.Payment;
import tn.esprit.backend.entities.Personnel;
import tn.esprit.backend.exceptions.BadRequestException;
import tn.esprit.backend.exceptions.ResourceNotFoundException;
import tn.esprit.backend.repositories.ContractRepo;
import tn.esprit.backend.repositories.PaymentRepo;
import tn.esprit.backend.repositories.PersonnelRepo;
import tn.esprit.backend.repositories.UserRepository;
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
    private final UserRepository userRepository;
    private final OwnershipGuard ownershipGuard;
    private final PaymentEmailNotificationService paymentEmailNotificationService;
    private final PaymentSuggestionService paymentSuggestionService;
    private final SalaryCalculationService salaryCalculationService;
    private final GoogleCalendarSyncService googleCalendarSyncService;

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
        Payment saved = paymentRepository.save(payment);
        syncPaymentToGoogleCalendar(saved, saved.getPaymentDate());
        return saved;
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

    /**
     * Un paiement déjà VALIDATED a déjà notifié l'employé par email (voir validatePayment) et
     * sert de justificatif de paie : le modifier casserait la traçabilité au même titre que le
     * supprimer (voir deletePayment) - seul un DRAFT peut donc être mis à jour.
     */
    @Transactional
    public Payment updatePayment(Long id, Payment paymentDetails) {
        Payment existingPayment = getPaymentById(id); // vérifie déjà la propriété
        if ("VALIDATED".equals(existingPayment.getStatus())) {
            throw new BadRequestException("A validated payment cannot be modified");
        }

        existingPayment.setPaymentDate(paymentDetails.getPaymentDate());
        existingPayment.setMonth(paymentDetails.getMonth());
        existingPayment.setYear(paymentDetails.getYear());
        existingPayment.setAbsences(paymentDetails.getAbsences()); // Met à jour la liste des absences
        existingPayment.setMontantCnss(paymentDetails.getMontantCnss());
        existingPayment.setMontantIrpp(paymentDetails.getMontantIrpp());
        existingPayment.setIrppRate(paymentDetails.getIrppRate());
        existingPayment.setStatus(paymentDetails.getStatus());
        existingPayment.setContrat(paymentDetails.getContrat());
        existingPayment.setPayed(paymentDetails.getPayed());
        existingPayment.setJustifiedAbsenceDays(paymentDetails.getJustifiedAbsenceDays());
        existingPayment.setUnjustifiedAbsenceDays(paymentDetails.getUnjustifiedAbsenceDays());
        existingPayment.setAbsenceDeduction(paymentDetails.getAbsenceDeduction());

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

        Payment saved = paymentRepository.save(existingPayment);
        syncPaymentToGoogleCalendar(saved, saved.getPaymentDate());
        return saved;
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
        // La validation est le moment où la paie devient définitive : si aucune date de paiement
        // n'a été renseignée (ex: généré par generateMonthlyPayroll, qui n'en fixe pas), on
        // utilise la date de validation elle-même plutôt que de ne rien synchroniser du tout.
        syncPaymentToGoogleCalendar(saved, saved.getPaymentDate() != null ? saved.getPaymentDate() : LocalDate.now());
        return saved;
    }

    /**
     * Un paiement déjà VALIDATED a déjà notifié l'employé par email (voir validatePayment) et
     * sert de justificatif de paie : le supprimer casserait la traçabilité, donc seul un DRAFT
     * peut être supprimé (par un ADMIN ou la COMPANY propriétaire, voir checkPaymentAccess).
     */
    @Transactional
    public void deletePayment(Long id) {
        Payment payment = getPaymentById(id); // vérifie déjà la propriété
        if ("VALIDATED".equals(payment.getStatus())) {
            throw new BadRequestException("A validated payment cannot be deleted");
        }
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

            // Une demande de congé PENDING (pas encore décidée par le manager) ou REJECTED ne doit
            // jamais réduire la paie : seules les absences APPROVED (ou sans statut, saisies avant
            // ce workflow) comptent — voir AbsenceQuotaCalculator#isApproved.
            List<Absence> approvedAbsences = personnel.getAbsences() == null ? List.of()
                    : personnel.getAbsences().stream().filter(AbsenceQuotaCalculator::isApproved).toList();
            long unjustifiedDays = AbsenceQuotaCalculator.countAbsenceDaysByPredicate(
                    approvedAbsences, monthStart, monthEnd, a -> !AbsenceQuotaCalculator.isJustified(a));
            long justifiedDays = AbsenceQuotaCalculator.countJustifiedAbsenceDays(
                    approvedAbsences, monthStart, monthEnd);
            SalaryCalculationService.SalaryBreakdown salary = salaryCalculationService.compute(
                    nz(contract.getSalaireBase()), nz(contract.getAvantages()), unjustifiedDays);

            Payment payment = Payment.builder()
                    .month(month)
                    .year(year)
                    .status("DRAFT")
                    .montantCnss(salary.montantCnss())
                    .montantIrpp(salary.montantIrpp())
                    .irppRate(salary.irppRate())
                    .payed(salary.net())
                    .justifiedAbsenceDays((int) justifiedDays)
                    .unjustifiedAbsenceDays((int) unjustifiedDays)
                    .absenceDeduction(salary.unjustifiedDeduction())
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
     * Synchronise une échéance de paie vers Google Calendar - uniquement sur le calendrier des
     * comptes COMPANY de l'entreprise ("pour l'employeur", jamais l'employé lui-même). Pas
     * d'effet si eventDate est null (ex: bulletin généré en masse par generateMonthlyPayroll,
     * qui ne fixe pas de date de paiement).
     */
    private void syncPaymentToGoogleCalendar(Payment payment, LocalDate eventDate) {
        if (eventDate == null) {
            return;
        }
        Long companyId = resolveCompanyId(payment);
        if (companyId == null) {
            return;
        }
        String employeeName = payment.getPersonnel() != null && payment.getPersonnel().getUser() != null
                ? (payment.getPersonnel().getUser().getFirstname() + " " + payment.getPersonnel().getUser().getLastname()).trim()
                : "Employee";
        String title = "Payroll: " + employeeName + " (" + payment.getMonth() + " " + payment.getYear() + ")";
        String description = "Status: " + payment.getStatus() + (payment.getPayed() != null ? " — " + payment.getPayed() + " TND" : "");
        userRepository.findByCompany_IdCompany(companyId).stream()
                .filter(u -> u.getRole() == Role.COMPANY)
                .forEach(u -> googleCalendarSyncService.syncAllDayEvent(
                        u, SyncSourceType.PAYMENT, payment.getId(), title, description, eventDate, eventDate, null));
    }

    private static Long resolveCompanyId(Payment payment) {
        if (payment.getCompany() != null && payment.getCompany().getIdCompany() != null) {
            return payment.getCompany().getIdCompany();
        }
        if (payment.getPersonnel() != null && payment.getPersonnel().getUser() != null
                && payment.getPersonnel().getUser().getCompany() != null) {
            return payment.getPersonnel().getUser().getCompany().getIdCompany();
        }
        return null;
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

package tn.esprit.backend.services;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import tn.esprit.backend.entities.Absence;
import tn.esprit.backend.entities.Contract;
import tn.esprit.backend.entities.Enum.AbsenceStatus;
import tn.esprit.backend.entities.Personnel;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Couvre le calcul du quota de jours d'absence justifiée (acquisition au prorata de
 * l'ancienneté + report d'une année civile sur l'autre, voir generateMonthlyPayroll et
 * la page Absences côté frontend qui affiche ce solde).
 */
class AbsenceQuotaCalculatorTest {

    private AbsenceQuotaCalculator calculator;

    @BeforeEach
    void setUp() {
        calculator = new AbsenceQuotaCalculator();
        ReflectionTestUtils.setField(calculator, "monthlyQuotaDays", 2.5);
        ReflectionTestUtils.setField(calculator, "carryoverCapDays", -1.0);
    }

    private Personnel personnelWithContractStarting(LocalDate dateDebut, List<Absence> absences) {
        Contract contract = Contract.builder().dateDebut(dateDebut).build();
        return Personnel.builder().contract(contract).absences(absences).build();
    }

    private Absence justifiedAbsence(LocalDate date) {
        return Absence.builder().dateAbsence(date).justification("Congé maladie").build();
    }

    private Absence unjustifiedAbsence(LocalDate date) {
        return Absence.builder().dateAbsence(date).build();
    }

    @Test
    void throwsWhenPersonnelOrDateIsNull() {
        assertThatThrownBy(() -> calculator.computeAsOf(null, LocalDate.now()))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> calculator.computeAsOf(Personnel.builder().build(), null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void returnsZeroQuotaWhenPersonnelHasNoContract() {
        Personnel personnel = Personnel.builder().build();

        AbsenceQuotaCalculator.QuotaSnapshot snapshot = calculator.computeAsOf(personnel, LocalDate.of(2026, 3, 1));

        assertThat(snapshot.monthlyQuotaDays()).isEqualTo(2.5);
        assertThat(snapshot.remainingDays()).isEqualTo(0);
    }

    @Test
    void returnsZeroQuotaWhenComputedBeforeTheContractStarted() {
        Personnel personnel = personnelWithContractStarting(LocalDate.of(2026, 6, 1), List.of());

        AbsenceQuotaCalculator.QuotaSnapshot snapshot = calculator.computeAsOf(personnel, LocalDate.of(2026, 1, 1));

        assertThat(snapshot.remainingDays()).isEqualTo(0);
        assertThat(snapshot.earnedDaysThisYear()).isEqualTo(0);
    }

    @Test
    void earnsQuotaProRataOfMonthsElapsedWithinTheCurrentCivilYear() {
        // Contrat démarré en janvier 2026, on interroge fin mars : 3 mois acquis (Jan/Fév/Mar).
        Personnel personnel = personnelWithContractStarting(LocalDate.of(2026, 1, 1), List.of());

        AbsenceQuotaCalculator.QuotaSnapshot snapshot = calculator.computeAsOf(personnel, LocalDate.of(2026, 3, 31));

        assertThat(snapshot.earnedDaysThisYear()).isEqualTo(7.5);
        assertThat(snapshot.carriedOverDays()).isEqualTo(0);
        assertThat(snapshot.remainingDays()).isEqualTo(7.5);
    }

    @Test
    void deductsOnlyJustifiedAbsenceDaysFromTheEarnedQuota() {
        Personnel personnel = personnelWithContractStarting(LocalDate.of(2026, 1, 1), List.of(
                justifiedAbsence(LocalDate.of(2026, 2, 10)),
                unjustifiedAbsence(LocalDate.of(2026, 2, 11)) // ne doit pas être décompté du quota
        ));

        AbsenceQuotaCalculator.QuotaSnapshot snapshot = calculator.computeAsOf(personnel, LocalDate.of(2026, 3, 31));

        assertThat(snapshot.usedJustifiedDaysThisYear()).isEqualTo(1);
        assertThat(snapshot.remainingDays()).isEqualTo(6.5); // 7.5 acquis - 1 utilisé
    }

    @Test
    void neverGoesBelowZeroWhenUsedDaysExceedEarnedDays() {
        Personnel personnel = personnelWithContractStarting(LocalDate.of(2026, 1, 1), List.of(
                justifiedAbsence(LocalDate.of(2026, 1, 5)),
                justifiedAbsence(LocalDate.of(2026, 1, 6)),
                justifiedAbsence(LocalDate.of(2026, 1, 7)),
                justifiedAbsence(LocalDate.of(2026, 1, 8))
        ));

        AbsenceQuotaCalculator.QuotaSnapshot snapshot = calculator.computeAsOf(personnel, LocalDate.of(2026, 1, 31));

        assertThat(snapshot.remainingDays()).isEqualTo(0);
    }

    @Test
    void carriesOverTheUnusedBalanceToTheNextCivilYearWithoutCapByDefault() {
        // 2025 entier : 12 mois * 2.5 = 30 jours acquis, aucune absence utilisée -> reporté intégralement.
        Personnel personnel = personnelWithContractStarting(LocalDate.of(2025, 1, 1), List.of());

        AbsenceQuotaCalculator.QuotaSnapshot snapshot = calculator.computeAsOf(personnel, LocalDate.of(2026, 1, 31));

        assertThat(snapshot.carriedOverDays()).isEqualTo(30);
        assertThat(snapshot.earnedDaysThisYear()).isEqualTo(2.5); // janvier 2026
        assertThat(snapshot.remainingDays()).isEqualTo(32.5);
    }

    @Test
    void capsTheCarriedOverBalanceWhenACarryoverCapIsConfigured() {
        ReflectionTestUtils.setField(calculator, "carryoverCapDays", 5.0);
        Personnel personnel = personnelWithContractStarting(LocalDate.of(2025, 1, 1), List.of());

        AbsenceQuotaCalculator.QuotaSnapshot snapshot = calculator.computeAsOf(personnel, LocalDate.of(2026, 1, 31));

        assertThat(snapshot.carriedOverDays()).isEqualTo(5); // plafonné au lieu des 30 acquis en 2025
        assertThat(snapshot.remainingDays()).isEqualTo(7.5); // 5 (plafond) + 2.5 (janvier 2026)
    }

    @Test
    void computeAvailableQuotaBeforePeriodValidatesArguments() {
        Personnel personnel = personnelWithContractStarting(LocalDate.of(2026, 1, 1), List.of());

        assertThatThrownBy(() -> calculator.computeAvailableQuotaBeforePeriod(null, LocalDate.now(), LocalDate.now()))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> calculator.computeAvailableQuotaBeforePeriod(personnel, null, LocalDate.now()))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> calculator.computeAvailableQuotaBeforePeriod(
                personnel, LocalDate.of(2026, 3, 1), LocalDate.of(2026, 1, 1)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void computeAvailableQuotaBeforePeriodExcludesTheRequestedPeriodItself() {
        // Le quota "disponible avant" une demande d'absence débutant le 1er mars ne doit pas
        // inclure l'acquisition de mars lui-même (l'acquisition est mensuelle, pas journalière) :
        // seuls janvier et février comptent, comme si on se plaçait au 28 février.
        Personnel personnel = personnelWithContractStarting(LocalDate.of(2026, 1, 1), List.of());

        double available = calculator.computeAvailableQuotaBeforePeriod(
                personnel, LocalDate.of(2026, 3, 1), LocalDate.of(2026, 3, 3));

        assertThat(available).isEqualTo(5); // janvier + février acquis (2 * 2.5)
    }

    @Test
    void isJustifiedRequiresANonBlankJustification() {
        assertThat(AbsenceQuotaCalculator.isJustified(null)).isFalse();
        assertThat(AbsenceQuotaCalculator.isJustified(Absence.builder().justification(null).build())).isFalse();
        assertThat(AbsenceQuotaCalculator.isJustified(Absence.builder().justification("   ").build())).isFalse();
        assertThat(AbsenceQuotaCalculator.isJustified(Absence.builder().justification("Certificat médical").build())).isTrue();
    }

    @Test
    void countsSingleDayAbsencesOnlyWhenTheyFallWithinTheRange() {
        List<Absence> absences = List.of(
                unjustifiedAbsence(LocalDate.of(2026, 3, 5)),  // dans la plage
                unjustifiedAbsence(LocalDate.of(2026, 4, 1))   // hors plage
        );

        long count = AbsenceQuotaCalculator.countAbsenceDaysByPredicate(
                absences, LocalDate.of(2026, 3, 1), LocalDate.of(2026, 3, 31), a -> true);

        assertThat(count).isEqualTo(1);
    }

    @Test
    void countsOnlyTheOverlappingDaysOfARangeAbsence() {
        // Absence du 28 février au 3 mars : seuls le 1er, 2 et 3 mars chevauchent le mois de mars.
        Absence rangeAbsence = Absence.builder()
                .startDate(LocalDate.of(2026, 2, 28))
                .endDate(LocalDate.of(2026, 3, 3))
                .justification("Congé")
                .build();

        long count = AbsenceQuotaCalculator.countJustifiedAbsenceDays(
                List.of(rangeAbsence), LocalDate.of(2026, 3, 1), LocalDate.of(2026, 3, 31));

        assertThat(count).isEqualTo(3);
    }

    @Test
    void ignoresAbsencesEntirelyOutsideTheRequestedRange() {
        Absence farAway = Absence.builder()
                .startDate(LocalDate.of(2026, 1, 1))
                .endDate(LocalDate.of(2026, 1, 5))
                .justification("Congé")
                .build();

        long count = AbsenceQuotaCalculator.countJustifiedAbsenceDays(
                List.of(farAway), LocalDate.of(2026, 3, 1), LocalDate.of(2026, 3, 31));

        assertThat(count).isZero();
    }

    @Test
    void countAbsenceDaysByPredicateReturnsZeroForEmptyOrNullInputs() {
        assertThat(AbsenceQuotaCalculator.countAbsenceDaysByPredicate(null, LocalDate.now(), LocalDate.now(), a -> true))
                .isZero();
        assertThat(AbsenceQuotaCalculator.countAbsenceDaysByPredicate(List.of(), LocalDate.now(), LocalDate.now(), a -> true))
                .isZero();
    }

    @Test
    void isApprovedTreatsANullStatusAsApprovedForBackwardCompatibility() {
        assertThat(AbsenceQuotaCalculator.isApproved(null)).isFalse();
        assertThat(AbsenceQuotaCalculator.isApproved(Absence.builder().status(null).build())).isTrue();
        assertThat(AbsenceQuotaCalculator.isApproved(Absence.builder().status(AbsenceStatus.APPROVED).build())).isTrue();
        assertThat(AbsenceQuotaCalculator.isApproved(Absence.builder().status(AbsenceStatus.PENDING).build())).isFalse();
        assertThat(AbsenceQuotaCalculator.isApproved(Absence.builder().status(AbsenceStatus.REJECTED).build())).isFalse();
    }

    @Test
    void pendingAndRejectedRequestsNeverConsumeQuotaEvenIfJustified() {
        Absence pending = Absence.builder().dateAbsence(LocalDate.of(2026, 2, 10))
                .justification("Congé maladie").status(AbsenceStatus.PENDING).build();
        Absence rejected = Absence.builder().dateAbsence(LocalDate.of(2026, 2, 11))
                .justification("Congé maladie").status(AbsenceStatus.REJECTED).build();
        Personnel personnel = personnelWithContractStarting(LocalDate.of(2026, 1, 1), List.of(pending, rejected));

        AbsenceQuotaCalculator.QuotaSnapshot snapshot = calculator.computeAsOf(personnel, LocalDate.of(2026, 3, 31));

        assertThat(snapshot.usedJustifiedDaysThisYear()).isZero();
        assertThat(snapshot.remainingDays()).isEqualTo(7.5); // rien de déduit tant que rien n'est APPROVED
    }

    @Test
    void anApprovedRequestConsumesQuotaExactlyLikeALegacyAbsenceWithNoStatus() {
        Absence approved = Absence.builder().dateAbsence(LocalDate.of(2026, 2, 10))
                .justification("Congé maladie").status(AbsenceStatus.APPROVED).build();
        Personnel personnel = personnelWithContractStarting(LocalDate.of(2026, 1, 1), List.of(approved));

        AbsenceQuotaCalculator.QuotaSnapshot snapshot = calculator.computeAsOf(personnel, LocalDate.of(2026, 3, 31));

        assertThat(snapshot.usedJustifiedDaysThisYear()).isEqualTo(1);
        assertThat(snapshot.remainingDays()).isEqualTo(6.5);
    }
}

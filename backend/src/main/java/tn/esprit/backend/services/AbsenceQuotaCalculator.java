package tn.esprit.backend.services;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import tn.esprit.backend.entities.Absence;
import tn.esprit.backend.entities.Personnel;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.function.Predicate;

/**
 * Calcule le quota de jours d'absence justifiée acquis par un employé, au prorata
 * de son ancienneté, avec report du solde non utilisé d'une année civile sur la suivante
 * (report plafonné si {@code payroll.absence.carryover-cap-days} est configuré, illimité sinon).
 */
@Service
public class AbsenceQuotaCalculator {

    @Value("${payroll.absence.quota-days:2.5}")
    private double monthlyQuotaDays;

    /** Plafond de jours reportables d'une année sur l'autre. Négatif = pas de plafond (report intégral). */
    @Value("${payroll.absence.carryover-cap-days:-1}")
    private double carryoverCapDays;

    public record QuotaSnapshot(
            double monthlyQuotaDays,
            double carriedOverDays,
            double earnedDaysThisYear,
            long usedJustifiedDaysThisYear,
            double remainingDays,
            LocalDate asOfDate
    ) {}

    private record Balance(double carriedOver, double earnedThisYear, long usedThisYear, double remaining) {}

    public QuotaSnapshot computeAsOf(Personnel personnel, LocalDate asOfDate) {
        if (personnel == null) {
            throw new IllegalArgumentException("Personnel cannot be null");
        }
        if (asOfDate == null) {
            throw new IllegalArgumentException("asOfDate cannot be null");
        }
        if (personnel.getContract() == null || personnel.getContract().getDateDebut() == null) {
            return new QuotaSnapshot(Math.max(0, monthlyQuotaDays), 0, 0, 0, 0, asOfDate);
        }

        LocalDate contractStart = personnel.getContract().getDateDebut();
        if (asOfDate.isBefore(contractStart)) {
            return new QuotaSnapshot(Math.max(0, monthlyQuotaDays), 0, 0, 0, 0, asOfDate);
        }

        Balance balance = computeBalance(contractStart, personnel.getAbsences(), asOfDate);
        return new QuotaSnapshot(Math.max(0, monthlyQuotaDays), balance.carriedOver(), balance.earnedThisYear(),
                balance.usedThisYear(), balance.remaining(), asOfDate);
    }

    public double computeAvailableQuotaBeforePeriod(Personnel personnel, LocalDate periodStart, LocalDate periodEnd) {
        if (personnel == null) {
            throw new IllegalArgumentException("Personnel cannot be null");
        }
        if (periodStart == null || periodEnd == null) {
            throw new IllegalArgumentException("Invalid reference period");
        }
        if (periodEnd.isBefore(periodStart)) {
            throw new IllegalArgumentException("periodEnd is before periodStart");
        }
        if (personnel.getContract() == null || personnel.getContract().getDateDebut() == null) {
            return 0;
        }

        LocalDate contractStart = personnel.getContract().getDateDebut();
        if (periodEnd.isBefore(contractStart)) {
            return 0;
        }

        LocalDate before = periodStart.minusDays(1);
        if (before.isBefore(contractStart)) {
            return 0;
        }

        return computeBalance(contractStart, personnel.getAbsences(), before).remaining();
    }

    /**
     * Calcule le solde acquis à une date donnée en parcourant chaque année civile depuis le
     * début du contrat : à la clôture de chaque année, le solde restant (acquis + report - utilisé)
     * est reporté sur l'année suivante, plafonné par {@link #carryoverCapDays} si configuré.
     */
    private Balance computeBalance(LocalDate contractStart, List<Absence> absences, LocalDate asOfDate) {
        double carriedOver = 0;
        int startYear = contractStart.getYear();
        int targetYear = asOfDate.getYear();

        for (int year = startYear; year < targetYear; year++) {
            LocalDate yearStart = yearStartBounded(year, contractStart);
            LocalDate yearEnd = LocalDate.of(year, 12, 31);

            double earnedInYear = monthsBetweenInclusive(YearMonth.from(yearStart), YearMonth.from(yearEnd)) * Math.max(0, monthlyQuotaDays);
            long usedInYear = countJustifiedAbsenceDays(absences, yearStart, yearEnd);
            double balanceEndOfYear = Math.max(0, carriedOver + earnedInYear - usedInYear);

            carriedOver = capCarryover(balanceEndOfYear);
        }

        LocalDate currentYearStart = yearStartBounded(targetYear, contractStart);
        double earnedThisYear = monthsBetweenInclusive(YearMonth.from(currentYearStart), YearMonth.from(asOfDate)) * Math.max(0, monthlyQuotaDays);
        long usedThisYear = countJustifiedAbsenceDays(absences, currentYearStart, asOfDate);
        double remaining = Math.max(0, carriedOver + earnedThisYear - usedThisYear);

        return new Balance(carriedOver, earnedThisYear, usedThisYear, remaining);
    }

    private static LocalDate yearStartBounded(int year, LocalDate contractStart) {
        LocalDate jan1 = LocalDate.of(year, 1, 1);
        return jan1.isBefore(contractStart) ? contractStart : jan1;
    }

    private double capCarryover(double balanceEndOfYear) {
        if (carryoverCapDays < 0) {
            return balanceEndOfYear;
        }
        return Math.min(balanceEndOfYear, carryoverCapDays);
    }

    public double getMonthlyQuotaDays() {
        return Math.max(0, monthlyQuotaDays);
    }

    public double getCarryoverCapDays() {
        return carryoverCapDays;
    }

    /**
     * Ce projet n'a pas de statut d'absence (PENDING/APPROVED/...) : une absence est
     * considérée justifiée dès qu'un motif est renseigné, comme déjà appliqué dans
     * PdfService pour le calcul des bulletins de paie.
     */
    public static boolean isJustified(Absence absence) {
        return absence != null && absence.getJustification() != null && !absence.getJustification().isBlank();
    }

    private static long monthsBetweenInclusive(YearMonth start, YearMonth end) {
        if (start == null || end == null) return 0;
        if (end.isBefore(start)) return 0;
        return ChronoUnit.MONTHS.between(start, end) + 1;
    }

    public static long countJustifiedAbsenceDays(List<Absence> absences, LocalDate rangeStart, LocalDate rangeEnd) {
        return countAbsenceDaysByPredicate(absences, rangeStart, rangeEnd, AbsenceQuotaCalculator::isJustified);
    }

    public static long countAbsenceDaysByPredicate(List<Absence> absences, LocalDate rangeStart, LocalDate rangeEnd,
                                                     Predicate<Absence> predicate) {
        if (absences == null || absences.isEmpty()) return 0;
        if (rangeStart == null || rangeEnd == null) return 0;
        if (rangeEnd.isBefore(rangeStart)) return 0;

        return absences.stream()
                .filter(a -> a != null && predicate.test(a))
                .mapToLong(a -> absenceDaysInRange(a, rangeStart, rangeEnd))
                .sum();
    }

    /**
     * Nombre de jours d'une absence qui recouvrent [rangeStart, rangeEnd]. Gère à la fois les
     * absences à plage (startDate/endDate) et les absences ponctuelles (dateAbsence seul, sans
     * plage saisie), comme déjà fait dans PdfService pour le calcul des bulletins de paie.
     */
    private static long absenceDaysInRange(Absence absence, LocalDate rangeStart, LocalDate rangeEnd) {
        if (absence.getStartDate() != null && absence.getEndDate() != null) {
            if (absence.getEndDate().isBefore(rangeStart) || absence.getStartDate().isAfter(rangeEnd)) {
                return 0;
            }
            return overlapDaysInclusive(absence.getStartDate(), absence.getEndDate(), rangeStart, rangeEnd);
        }
        LocalDate single = absence.getDateAbsence();
        if (single != null && !single.isBefore(rangeStart) && !single.isAfter(rangeEnd)) {
            return 1;
        }
        return 0;
    }

    private static long overlapDaysInclusive(LocalDate aStart, LocalDate aEnd, LocalDate rangeStart, LocalDate rangeEnd) {
        LocalDate overlapStart = aStart.isBefore(rangeStart) ? rangeStart : aStart;
        LocalDate overlapEnd = aEnd.isAfter(rangeEnd) ? rangeEnd : aEnd;
        if (overlapEnd.isBefore(overlapStart)) return 0;
        return ChronoUnit.DAYS.between(overlapStart, overlapEnd) + 1;
    }
}

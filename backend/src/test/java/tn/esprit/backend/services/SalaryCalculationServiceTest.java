package tn.esprit.backend.services;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Couvre le calcul de paie (CNSS + barème IRPP progressif tunisien + abattement forfaitaire
 * plafonné) qui alimente à la fois PaymentService#generateMonthlyPayroll et les fiches de
 * paie affichées sur PdfService/PayrollPage. Aucune dépendance externe : logique pure.
 */
class SalaryCalculationServiceTest {

    private final SalaryCalculationService service = new SalaryCalculationService();

    @Test
    void computesBreakdownWithoutAbsencesInTheZeroPercentBracket() {
        SalaryCalculationService.SalaryBreakdown result = service.compute(1000, 0, 0);

        assertThat(result.gross()).isEqualTo(1000);
        assertThat(result.unjustifiedDeduction()).isEqualTo(0);
        assertThat(result.montantCnss()).isCloseTo(91.8, org.assertj.core.data.Offset.offset(0.001));
        assertThat(result.irppRate()).isEqualTo(0.26);
        assertThat(result.montantIrpp()).isCloseTo(104.185, org.assertj.core.data.Offset.offset(0.001));
        assertThat(result.net()).isCloseTo(804.015, org.assertj.core.data.Offset.offset(0.001));
    }

    @Test
    void deductsUnjustifiedAbsenceDaysAtTheContractualDailyRate() {
        SalaryCalculationService.SalaryBreakdown result = service.compute(660, 0, 2);

        // dailyRate = 660 / 22 working days = 30 exactly
        assertThat(result.unjustifiedDeduction()).isCloseTo(60.0, org.assertj.core.data.Offset.offset(0.001));
        assertThat(result.montantCnss()).isCloseTo(60.588, org.assertj.core.data.Offset.offset(0.001));
        assertThat(result.net()).isCloseTo(521.523, org.assertj.core.data.Offset.offset(0.001));
    }

    @Test
    void zeroSalaryProducesAZeroBreakdownInsteadOfNegativeAmounts() {
        SalaryCalculationService.SalaryBreakdown result = service.compute(0, 0, 0);

        assertThat(result.gross()).isEqualTo(0);
        assertThat(result.montantCnss()).isEqualTo(0);
        assertThat(result.montantIrpp()).isEqualTo(0);
        assertThat(result.irppRate()).isEqualTo(0.0);
        assertThat(result.net()).isEqualTo(0);
    }

    @Test
    void appliesTheTopMarginalBracketAndCapsTheProfessionalAllowance() {
        // Revenu annuel imposable avant abattement = 108 984 TND, largement au-dessus du
        // plafond de l'abattement forfaitaire (2000 TND/an) et de la dernière tranche (50 000).
        SalaryCalculationService.SalaryBreakdown result = service.compute(8000, 2000, 0);

        assertThat(result.gross()).isEqualTo(10000);
        assertThat(result.montantCnss()).isCloseTo(918.0, org.assertj.core.data.Offset.offset(0.001));
        assertThat(result.irppRate()).isEqualTo(0.35);
        assertThat(result.montantIrpp()).isCloseTo(2753.7, org.assertj.core.data.Offset.offset(0.001));
        assertThat(result.net()).isCloseTo(6328.3, org.assertj.core.data.Offset.offset(0.001));
    }

    @Test
    void appliesTheTwentyEightPercentBracketOnceCapForTwentyThousandIsCrossed() {
        SalaryCalculationService.SalaryBreakdown result = service.compute(2900, 0, 0);

        assertThat(result.montantCnss()).isCloseTo(266.22, org.assertj.core.data.Offset.offset(0.001));
        assertThat(result.irppRate()).isEqualTo(0.28);
        assertThat(result.montantIrpp()).isCloseTo(549.125, org.assertj.core.data.Offset.offset(0.001));
        assertThat(result.net()).isCloseTo(2084.655, org.assertj.core.data.Offset.offset(0.001));
    }

    @Test
    void appliesTheThirtyTwoPercentBracketOnceCapForThirtyThousandIsCrossed() {
        SalaryCalculationService.SalaryBreakdown result = service.compute(4000, 0, 0);

        assertThat(result.montantCnss()).isCloseTo(367.2, org.assertj.core.data.Offset.offset(0.001));
        assertThat(result.irppRate()).isEqualTo(0.32);
        assertThat(result.montantIrpp()).isCloseTo(867.496, org.assertj.core.data.Offset.offset(0.001));
        assertThat(result.net()).isCloseTo(2765.304, org.assertj.core.data.Offset.offset(0.001));
    }
}

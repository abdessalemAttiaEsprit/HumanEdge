package tn.esprit.backend.services;

import org.junit.jupiter.api.Test;
import tn.esprit.backend.entities.Contract;
import tn.esprit.backend.exceptions.BadRequestException;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Couvre la grille salariale (catégorie/échelon) et la règle d'avancement automatique
 * (1 échelon tous les 2 ans d'ancienneté), utilisées par ContractService et
 * PaymentService#generateMonthlyPayroll.
 */
class PaymentSuggestionServiceTest {

    private final PaymentSuggestionService service = new PaymentSuggestionService();

    @Test
    void suggestsTheFirstEchelonForABrandNewEmployee() {
        PaymentSuggestionService.CategorySuggestion suggestion = service.suggererProfilRH("A1", 0);

        assertThat(suggestion.echelonSuggere()).isEqualTo(1);
        assertThat(suggestion.salaireBase()).isEqualTo(1950.000);
    }

    @Test
    void normalizesCategoryCodeCaseAndWhitespace() {
        PaymentSuggestionService.CategorySuggestion suggestion = service.suggererProfilRH(" a1 ", 0);

        assertThat(suggestion.categorie()).isEqualTo("A1");
    }

    @Test
    void advancesOneEchelonEveryTwoYearsOfSeniority() {
        assertThat(service.resolveEchelon("A1", 0)).isEqualTo(1);
        assertThat(service.resolveEchelon("A1", 1)).isEqualTo(1);
        assertThat(service.resolveEchelon("A1", 2)).isEqualTo(2);
        assertThat(service.resolveEchelon("A1", 4)).isEqualTo(3);
    }

    @Test
    void capsTheEchelonAtTheLastOneDefinedForTheCategory() {
        // A1 ne définit que 5 échelons : au-delà de 8 ans (échelon théorique 5), ça plafonne.
        assertThat(service.resolveEchelon("A1", 100)).isEqualTo(5);
    }

    @Test
    void treatsNegativeExperienceAsZero() {
        assertThat(service.resolveEchelon("A1", -5)).isEqualTo(1);
    }

    @Test
    void rejectsNegativeYearsOfExperienceInSuggestion() {
        assertThatThrownBy(() -> service.suggererProfilRH("A1", -1))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void rejectsAnUnknownCategory() {
        assertThatThrownBy(() -> service.suggererProfilRH("Z9", 0))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void rejectsABlankCategory() {
        assertThatThrownBy(() -> service.suggererProfilRH("  ", 0))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void getGradeRejectsAnEchelonNotDefinedForTheCategory() {
        // D n'a que 2 échelons.
        assertThatThrownBy(() -> service.getGrade("D", 9))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void applyAutomaticEchelonDoesNothingWhenTheContractHasNoCategory() {
        Contract contract = Contract.builder().dateDebut(LocalDate.now().minusYears(5)).build();

        boolean changed = service.applyAutomaticEchelon(contract);

        assertThat(changed).isFalse();
        assertThat(contract.getEchelon()).isNull();
    }

    @Test
    void applyAutomaticEchelonSetsTheFirstStepForAContractNotYetStarted() {
        Contract contract = Contract.builder()
                .categorie("A2")
                .dateDebut(LocalDate.now().plusYears(1)) // démarre dans le futur
                .build();

        boolean changed = service.applyAutomaticEchelon(contract);

        assertThat(changed).isTrue();
        assertThat(contract.getEchelon()).isEqualTo(1);
        assertThat(contract.getSalaireBase()).isEqualTo(1450.000);
    }

    @Test
    void applyAutomaticEchelonAdvancesTheSalaryGradeWithSeniority() {
        Contract contract = Contract.builder()
                .categorie("a2") // volontairement en minuscule, doit être normalisé
                .dateDebut(LocalDate.now().minusYears(4))
                .echelon(1)
                .salaireBase(1450.000)
                .build();

        boolean changed = service.applyAutomaticEchelon(contract);

        assertThat(changed).isTrue();
        assertThat(contract.getCategorie()).isEqualTo("A2");
        assertThat(contract.getEchelon()).isEqualTo(3); // 4 ans -> échelon 1 + 4/2 = 3
        assertThat(contract.getSalaireBase()).isEqualTo(1650.000);
    }

    @Test
    void applyAutomaticEchelonUsesTheContractEndDateOnceItHasEnded() {
        // Le contrat s'est terminé après seulement 1 an : l'ancienneté ne doit pas continuer
        // à courir jusqu'à aujourd'hui.
        Contract contract = Contract.builder()
                .categorie("A2")
                .dateDebut(LocalDate.now().minusYears(6))
                .dateFin(LocalDate.now().minusYears(5))
                .echelon(1)
                .salaireBase(1450.000)
                .build();

        service.applyAutomaticEchelon(contract);

        assertThat(contract.getEchelon()).isEqualTo(1); // 1 an d'ancienneté au moment de la fin -> toujours échelon 1
    }

    @Test
    void applyAutomaticEchelonReturnsFalseWhenNothingChanged() {
        Contract contract = Contract.builder()
                .categorie("A2")
                .dateDebut(LocalDate.now().minusMonths(6))
                .echelon(1)
                .salaireBase(1450.000)
                .build();

        boolean changed = service.applyAutomaticEchelon(contract);

        assertThat(changed).isFalse();
    }

    @Test
    void getAvailableCategoriesListsAllGridCategories() {
        assertThat(service.getAvailableCategories()).containsKeys("A1", "A2", "A3", "B", "C", "D");
    }
}

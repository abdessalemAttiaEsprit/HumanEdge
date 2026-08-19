package tn.esprit.backend.security;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import tn.esprit.backend.exceptions.BadRequestException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Couvre la protection CSRF du flux OAuth Google : un state signé par nos soins doit permettre
 * de retrouver l'utilisateur qui l'a créé, et tout state altéré/forgé/signé avec une autre clé
 * doit être rejeté (voir GoogleCalendarController#callback).
 */
class GoogleOAuthStateServiceTest {

    private GoogleOAuthStateService stateService;

    @BeforeEach
    void setUp() {
        stateService = new GoogleOAuthStateService();
        ReflectionTestUtils.setField(stateService, "clientSecret", "test-client-secret-value-not-real");
    }

    @Test
    void aStateCanBeVerifiedBackToTheUserThatCreatedIt() {
        String state = stateService.createState(42L);

        assertThat(stateService.verifyState(state)).isEqualTo(42L);
    }

    @Test
    void aTamperedStateIsRejected() {
        String state = stateService.createState(42L);
        String tampered = state.substring(0, state.length() - 1) + (state.endsWith("a") ? "b" : "a");

        assertThatThrownBy(() -> stateService.verifyState(tampered)).isInstanceOf(BadRequestException.class);
    }

    @Test
    void aStateSignedWithADifferentSecretIsRejected() {
        String state = stateService.createState(42L);

        GoogleOAuthStateService otherService = new GoogleOAuthStateService();
        ReflectionTestUtils.setField(otherService, "clientSecret", "a-completely-different-secret");

        assertThatThrownBy(() -> otherService.verifyState(state)).isInstanceOf(BadRequestException.class);
    }

    @Test
    void garbageInputIsRejected() {
        assertThatThrownBy(() -> stateService.verifyState("not-a-real-token")).isInstanceOf(BadRequestException.class);
    }
}

package tn.esprit.backend.security;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Couvre le garde-fou anti-brute-force utilisé par AuthService pour le login et la
 * vérification OTP : verrouillage après 5 échecs consécutifs, remise à zéro sur succès.
 */
class RateLimiterServiceTest {

    private final RateLimiterService rateLimiter = new RateLimiterService();

    @Test
    void allowsRequestsBelowTheFailureThreshold() {
        String key = "login:user1@demo.tn";
        for (int i = 0; i < 4; i++) {
            rateLimiter.recordFailure(key);
        }

        assertThatCode(() -> rateLimiter.checkAllowed(key)).doesNotThrowAnyException();
    }

    @Test
    void locksOutAfterFiveConsecutiveFailures() {
        String key = "login:user2@demo.tn";
        for (int i = 0; i < 5; i++) {
            rateLimiter.recordFailure(key);
        }

        assertThatThrownBy(() -> rateLimiter.checkAllowed(key))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Too many attempts");
    }

    @Test
    void aSuccessClearsThePreviousFailureCount() {
        String key = "login:user3@demo.tn";
        for (int i = 0; i < 4; i++) {
            rateLimiter.recordFailure(key);
        }
        rateLimiter.recordSuccess(key);
        rateLimiter.recordFailure(key); // 1 seul échec après la remise à zéro

        assertThatCode(() -> rateLimiter.checkAllowed(key)).doesNotThrowAnyException();
    }

    @Test
    void tracksEachKeyIndependently() {
        String lockedKey = "login:locked@demo.tn";
        String freshKey = "login:fresh@demo.tn";
        for (int i = 0; i < 5; i++) {
            rateLimiter.recordFailure(lockedKey);
        }

        assertThatThrownBy(() -> rateLimiter.checkAllowed(lockedKey)).isInstanceOf(ResponseStatusException.class);
        assertThatCode(() -> rateLimiter.checkAllowed(freshKey)).doesNotThrowAnyException();
    }
}

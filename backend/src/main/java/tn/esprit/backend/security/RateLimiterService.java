package tn.esprit.backend.security;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory brute-force guard for login and OTP verification. Keyed by caller-provided key
 * (e.g. "login:<email>" or "otp:<email>") — after MAX_ATTEMPTS consecutive failures for a key,
 * further attempts are rejected with 429 until LOCKOUT_DURATION elapses. A success clears the
 * counter. Deliberately simple (no persistence, no per-IP tracking): this is a single-instance
 * dev/small-deployment app, not a distributed system needing a shared store like Redis.
 */
@Component
public class RateLimiterService {

    private static final int MAX_ATTEMPTS = 5;
    private static final Duration LOCKOUT_DURATION = Duration.ofMinutes(15);

    private record Attempts(int count, Instant lockedUntil) {}

    private final ConcurrentHashMap<String, Attempts> attemptsByKey = new ConcurrentHashMap<>();

    public void checkAllowed(String key) {
        Attempts attempts = attemptsByKey.get(key);
        if (attempts != null && attempts.lockedUntil() != null && Instant.now().isBefore(attempts.lockedUntil())) {
            long minutesLeft = Math.max(1, Duration.between(Instant.now(), attempts.lockedUntil()).toMinutes() + 1);
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Too many attempts. Please try again in " + minutesLeft + " minute(s).");
        }
    }

    public void recordFailure(String key) {
        attemptsByKey.compute(key, (k, existing) -> {
            int count = (existing == null ? 0 : existing.count()) + 1;
            Instant lockedUntil = count >= MAX_ATTEMPTS ? Instant.now().plus(LOCKOUT_DURATION) : null;
            return new Attempts(count, lockedUntil);
        });
    }

    public void recordSuccess(String key) {
        attemptsByKey.remove(key);
    }
}

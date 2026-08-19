package tn.esprit.backend.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import tn.esprit.backend.exceptions.BadRequestException;

import java.security.Key;
import java.util.Date;

/**
 * Protège le paramètre "state" du flux OAuth Google contre le CSRF/la falsification : le
 * navigateur transporte ce state à travers une redirection Google (donc hors de notre session
 * applicative), il faut donc pouvoir vérifier qu'il vient bien de nous et retrouver l'utilisateur
 * qui a initié la connexion (voir GoogleCalendarController#authorize/callback) - sans avoir besoin
 * d'un stockage côté serveur (ni table ni cache en mémoire, qui ne survivrait pas à un restart de
 * pod ou ne serait pas partagé entre replicas). Réutilise jjwt (déjà une dépendance, voir
 * JwtService) avec sa propre clé de signature plutôt que jwt.secret, pour ne jamais confondre un
 * state OAuth avec un vrai token de session.
 */
@Service
public class GoogleOAuthStateService {

    private static final long STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes : largement assez pour le clic + le consentement Google

    @Value("${google.oauth.client-secret:}")
    private String clientSecret;

    public String createState(Long userId) {
        return Jwts.builder()
                .setSubject(String.valueOf(userId))
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + STATE_TTL_MS))
                .signWith(getSigningKey(), SignatureAlgorithm.HS256)
                .compact();
    }

    public Long verifyState(String state) {
        try {
            Claims claims = Jwts.parserBuilder()
                    .setSigningKey(getSigningKey())
                    .build()
                    .parseClaimsJws(state)
                    .getBody();
            return Long.valueOf(claims.getSubject());
        } catch (JwtException | IllegalArgumentException e) {
            throw new BadRequestException("Invalid or expired Google OAuth state");
        }
    }

    // La clé HMAC doit faire au moins 256 bits (HS256) : un client-secret Google fait toujours
    // largement plus de 32 caractères, donc pas besoin de padding/dérivation supplémentaire ici.
    private Key getSigningKey() {
        byte[] keyBytes = clientSecret.getBytes();
        return Keys.hmacShaKeyFor(sha256(keyBytes));
    }

    private static byte[] sha256(byte[] input) {
        try {
            return java.security.MessageDigest.getInstance("SHA-256").digest(input);
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}

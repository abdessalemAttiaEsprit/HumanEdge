package tn.esprit.backend.services;

import com.google.api.client.googleapis.auth.oauth2.GoogleAuthorizationCodeFlow;
import com.google.api.client.googleapis.auth.oauth2.GoogleCredential;
import com.google.api.client.googleapis.auth.oauth2.GoogleRefreshTokenRequest;
import com.google.api.client.googleapis.auth.oauth2.GoogleTokenResponse;
import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport;
import com.google.api.client.http.HttpTransport;
import com.google.api.client.json.JsonFactory;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.services.calendar.Calendar;
import com.google.api.services.calendar.CalendarScopes;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tn.esprit.backend.entities.GoogleCalendarAccount;
import tn.esprit.backend.entities.User;
import tn.esprit.backend.exceptions.BadRequestException;
import tn.esprit.backend.repositories.GoogleCalendarAccountRepo;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Gère le flux OAuth Google (URL d'autorisation, échange du code, rafraîchissement du token) et
 * la persistance de la connexion (voir GoogleCalendarAccount). Le détail des événements créés/mis
 * à jour est géré par GoogleCalendarSyncService, qui consomme le client Calendar authentifié
 * fourni ici.
 */
@Service
@RequiredArgsConstructor
public class GoogleOAuthService {

    private static final List<String> SCOPES = List.of(CalendarScopes.CALENDAR);
    private static final JsonFactory JSON_FACTORY = GsonFactory.getDefaultInstance();
    private static final String CALLBACK_PATH = "/api/google/oauth/callback";

    @Value("${google.oauth.client-id:}")
    private String clientId;

    @Value("${google.oauth.client-secret:}")
    private String clientSecret;

    @Value("${app.backend-base-url}")
    private String backendBaseUrl;

    private final GoogleCalendarAccountRepo accountRepo;

    public boolean isConfigured() {
        return clientId != null && !clientId.isBlank() && clientSecret != null && !clientSecret.isBlank();
    }

    private void checkConfigured() {
        if (!isConfigured()) {
            throw new BadRequestException("Google Calendar sync is not configured on this server");
        }
    }

    public String buildAuthorizationUrl(String state) {
        checkConfigured();
        return buildFlow().newAuthorizationUrl()
                .setRedirectUri(redirectUri())
                .setState(state)
                // access_type=offline pour obtenir un refresh_token ; prompt=consent pour en
                // obtenir un À CHAQUE fois (Google ne le renvoie pas systématiquement sinon,
                // par exemple si l'utilisateur avait déjà autorisé l'app par le passé).
                .set("access_type", "offline")
                .set("prompt", "consent")
                .build();
    }

    /** Échange le code d'autorisation contre des tokens et enregistre/rafraîchit la connexion de cet utilisateur. */
    @Transactional
    public GoogleCalendarAccount connect(User user, String code) throws IOException {
        checkConfigured();
        GoogleTokenResponse tokenResponse = buildFlow().newTokenRequest(code).setRedirectUri(redirectUri()).execute();

        GoogleCalendarAccount account = accountRepo.findByUser_IdUser(user.getIdUser())
                .orElseGet(() -> GoogleCalendarAccount.builder().user(user).connectedAt(LocalDateTime.now()).build());

        if (account.getId() == null && tokenResponse.getRefreshToken() == null) {
            // Ne devrait jamais arriver avec prompt=consent, mais évite une NOT NULL en base
            // avec un message clair plutôt qu'une erreur SQL opaque si Google change de comportement.
            throw new BadRequestException("Google did not return a refresh token; please try connecting again");
        }

        account.setAccessToken(tokenResponse.getAccessToken());
        if (tokenResponse.getRefreshToken() != null) {
            account.setRefreshToken(tokenResponse.getRefreshToken());
        }
        account.setAccessTokenExpiry(expiryFrom(tokenResponse.getExpiresInSeconds()));
        return accountRepo.save(account);
    }

    @Transactional
    public void disconnect(Long userId) {
        accountRepo.deleteByUser_IdUser(userId);
    }

    /** Client Calendar authentifié pour ce compte, rafraîchissant l'access token au besoin. */
    public Calendar getCalendarService(GoogleCalendarAccount account) throws IOException {
        checkConfigured();
        if (LocalDateTime.now().isAfter(account.getAccessTokenExpiry().minusMinutes(2))) {
            refreshAccessToken(account);
        }
        GoogleCredential credential = new GoogleCredential.Builder()
                .setTransport(httpTransport())
                .setJsonFactory(JSON_FACTORY)
                .setClientSecrets(clientId, clientSecret)
                .build();
        credential.setAccessToken(account.getAccessToken());
        credential.setRefreshToken(account.getRefreshToken());

        return new Calendar.Builder(httpTransport(), JSON_FACTORY, credential)
                .setApplicationName("HumanEdge HR")
                .build();
    }

    @Transactional
    void refreshAccessToken(GoogleCalendarAccount account) throws IOException {
        GoogleTokenResponse response = new GoogleRefreshTokenRequest(
                httpTransport(), JSON_FACTORY, account.getRefreshToken(), clientId, clientSecret)
                .execute();
        account.setAccessToken(response.getAccessToken());
        account.setAccessTokenExpiry(expiryFrom(response.getExpiresInSeconds()));
        accountRepo.save(account);
    }

    private static LocalDateTime expiryFrom(Long expiresInSeconds) {
        return LocalDateTime.now().plusSeconds(expiresInSeconds != null ? expiresInSeconds : 3600);
    }

    private String redirectUri() {
        return backendBaseUrl + CALLBACK_PATH;
    }

    private GoogleAuthorizationCodeFlow buildFlow() {
        return new GoogleAuthorizationCodeFlow.Builder(httpTransport(), JSON_FACTORY, clientId, clientSecret, SCOPES)
                .build();
    }

    private static HttpTransport httpTransport() {
        try {
            return GoogleNetHttpTransport.newTrustedTransport();
        } catch (GeneralSecurityException | IOException e) {
            throw new IllegalStateException("Unable to initialize the Google HTTP transport", e);
        }
    }
}

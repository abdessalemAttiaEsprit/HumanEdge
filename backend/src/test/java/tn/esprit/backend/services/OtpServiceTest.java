package tn.esprit.backend.services;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.util.ReflectionTestUtils;
import tn.esprit.backend.entities.Enum.Role;
import tn.esprit.backend.entities.LoginOtp;
import tn.esprit.backend.exceptions.BadRequestException;
import tn.esprit.backend.repositories.LoginOtpRepo;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Couvre le MFA par email (voir AuthService#login/verifyOtp) : qui doit passer par un code
 * (COMPANY uniquement), l'échec "fermé" (jamais d'authentification si le mail ne part pas),
 * et l'expiration/consommation du code.
 */
@ExtendWith(MockitoExtension.class)
class OtpServiceTest {

    @Mock
    private LoginOtpRepo loginOtpRepo;
    @Mock
    private JavaMailSender mailSender;

    private OtpService otpService;

    @BeforeEach
    void setUp() {
        otpService = new OtpService(loginOtpRepo, mailSender);
        ReflectionTestUtils.setField(otpService, "mailEnabled", true);
        ReflectionTestUtils.setField(otpService, "fromAddress", "no-reply@humanedge.tn");
        ReflectionTestUtils.setField(otpService, "mailHost", "smtp.humanedge.tn");
    }

    @Test
    void onlyCompanyAccountsRequireMfa() {
        assertThat(OtpService.requiresMfa(Role.COMPANY)).isTrue();
        assertThat(OtpService.requiresMfa(Role.ADMIN)).isFalse();
        assertThat(OtpService.requiresMfa(Role.EMPLOYE)).isFalse();
        assertThat(OtpService.requiresMfa(Role.GUEST)).isFalse();
    }

    @Test
    void generateAndSendOtpFailsClosedWhenMailIsNotConfigured() {
        ReflectionTestUtils.setField(otpService, "mailHost", "");

        assertThatThrownBy(() -> otpService.generateAndSendOtp("company@demo.tn"))
                .isInstanceOf(BadRequestException.class);

        verify(loginOtpRepo, never()).save(any());
        verify(mailSender, never()).send(any(SimpleMailMessage.class));
    }

    @Test
    void generateAndSendOtpFailsClosedWhenMailIsDisabled() {
        ReflectionTestUtils.setField(otpService, "mailEnabled", false);

        assertThatThrownBy(() -> otpService.generateAndSendOtp("company@demo.tn"))
                .isInstanceOf(BadRequestException.class);

        verify(loginOtpRepo, never()).save(any());
    }

    @Test
    void generateAndSendOtpInvalidatesAnyPreviousCodeBeforeIssuingANewOne() {
        otpService.generateAndSendOtp("company@demo.tn");

        verify(loginOtpRepo).deleteUnconsumedByEmail("company@demo.tn");

        ArgumentCaptor<LoginOtp> captor = ArgumentCaptor.forClass(LoginOtp.class);
        verify(loginOtpRepo).save(captor.capture());
        LoginOtp saved = captor.getValue();
        assertThat(saved.getEmail()).isEqualTo("company@demo.tn");
        assertThat(saved.getCode()).matches("\\d{6}");
        assertThat(saved.isConsumed()).isFalse();
        assertThat(saved.getExpiresAt()).isAfter(LocalDateTime.now());

        verify(mailSender).send(any(SimpleMailMessage.class));
    }

    @Test
    void generateAndSendOtpFailsWhenTheMailServerRejectsTheMessage() {
        doThrow(new MailSendException("smtp down")).when(mailSender).send(any(SimpleMailMessage.class));

        assertThatThrownBy(() -> otpService.generateAndSendOtp("company@demo.tn"))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void verifyOtpAcceptsAFreshUnconsumedMatchingCode() {
        LoginOtp otp = LoginOtp.builder()
                .email("company@demo.tn")
                .code("123456")
                .consumed(false)
                .expiresAt(LocalDateTime.now().plusMinutes(5))
                .build();
        when(loginOtpRepo.findTopByEmailAndConsumedFalseOrderByIdDesc("company@demo.tn"))
                .thenReturn(Optional.of(otp));

        otpService.verifyOtp("company@demo.tn", "123456");

        assertThat(otp.isConsumed()).isTrue();
        verify(loginOtpRepo).save(otp);
    }

    @Test
    void verifyOtpRejectsAWrongCode() {
        LoginOtp otp = LoginOtp.builder()
                .email("company@demo.tn")
                .code("123456")
                .consumed(false)
                .expiresAt(LocalDateTime.now().plusMinutes(5))
                .build();
        when(loginOtpRepo.findTopByEmailAndConsumedFalseOrderByIdDesc("company@demo.tn"))
                .thenReturn(Optional.of(otp));

        assertThatThrownBy(() -> otpService.verifyOtp("company@demo.tn", "000000"))
                .isInstanceOf(BadRequestException.class);
        verify(loginOtpRepo, never()).save(any());
    }

    @Test
    void verifyOtpRejectsAnExpiredCode() {
        LoginOtp expired = LoginOtp.builder()
                .email("company@demo.tn")
                .code("123456")
                .consumed(false)
                .expiresAt(LocalDateTime.now().minusMinutes(1))
                .build();
        when(loginOtpRepo.findTopByEmailAndConsumedFalseOrderByIdDesc("company@demo.tn"))
                .thenReturn(Optional.of(expired));

        assertThatThrownBy(() -> otpService.verifyOtp("company@demo.tn", "123456"))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void verifyOtpRejectsWhenNoCodeWasEverIssued() {
        when(loginOtpRepo.findTopByEmailAndConsumedFalseOrderByIdDesc(anyString()))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> otpService.verifyOtp("nobody@demo.tn", "123456"))
                .isInstanceOf(BadRequestException.class);
    }
}

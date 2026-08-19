package tn.esprit.backend.services;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.access.AccessDeniedException;
import tn.esprit.backend.entities.Company;
import tn.esprit.backend.entities.Enum.MessageCategory;
import tn.esprit.backend.entities.Enum.Role;
import tn.esprit.backend.entities.Message;
import tn.esprit.backend.entities.User;
import tn.esprit.backend.exceptions.BadRequestException;
import tn.esprit.backend.repositories.MessageRepo;
import tn.esprit.backend.repositories.UserRepository;
import tn.esprit.backend.security.OwnershipGuard;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Couvre la messagerie EMPLOYE <-> entreprise : un message employé notifie tous les comptes
 * COMPANY de l'entreprise (avec une catégorie, par défaut OTHER), une réponse d'entreprise ne
 * peut cibler qu'un employé de sa propre entreprise, et le téléchargement de pièce jointe n'est
 * accessible qu'aux deux parties de l'échange (ou à leur entreprise commune).
 */
@ExtendWith(MockitoExtension.class)
class MessageServiceTest {

    @Mock private MessageRepo messageRepo;
    @Mock private UserRepository userRepository;
    @Mock private OwnershipGuard ownershipGuard;
    @Mock private NotificationService notificationService;
    @Mock private FileStorageService fileStorageService;

    private MessageService messageService;

    @BeforeEach
    void setUp() {
        messageService = new MessageService(messageRepo, userRepository, ownershipGuard, notificationService, fileStorageService);
    }

    private User userInCompany(long userId, Role role, long companyId) {
        Company company = Company.builder().idCompany(companyId).companyName("Acme").build();
        return User.builder().idUser(userId).firstname("Jane").lastname("Doe").role(role).company(company).build();
    }

    // ---- sendMessageToCompany ----

    @Test
    void sendMessageToCompanyNotifiesEveryCompanyAccountInTheSenderCompany() {
        User employee = userInCompany(1L, Role.EMPLOYE, 10L);
        when(ownershipGuard.currentUser()).thenReturn(employee);
        User companyUser1 = userInCompany(2L, Role.COMPANY, 10L);
        User companyUser2 = userInCompany(3L, Role.COMPANY, 10L);
        when(userRepository.findByCompany_IdCompany(10L)).thenReturn(List.of(companyUser1, companyUser2));
        when(messageRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Message result = messageService.sendMessageToCompany("Hello", MessageCategory.CAREER_DEVELOPMENT);

        assertThat(result.getRecipient()).isNull();
        assertThat(result.getCategory()).isEqualTo(MessageCategory.CAREER_DEVELOPMENT);
        verify(notificationService).notify(eq(companyUser1), contains("Hello"));
        verify(notificationService).notify(eq(companyUser2), contains("Hello"));
    }

    @Test
    void sendMessageToCompanyDefaultsToOtherWhenNoCategoryGiven() {
        User employee = userInCompany(1L, Role.EMPLOYE, 10L);
        when(ownershipGuard.currentUser()).thenReturn(employee);
        when(userRepository.findByCompany_IdCompany(10L)).thenReturn(List.of());
        when(messageRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Message result = messageService.sendMessageToCompany("Hello", null);

        assertThat(result.getCategory()).isEqualTo(MessageCategory.OTHER);
    }

    // ---- replyToEmployee ----

    @Test
    void replyToEmployeeSetsTheRecipientAndTheAttachmentAndNotifiesThem() {
        User companyCaller = userInCompany(2L, Role.COMPANY, 10L);
        when(ownershipGuard.currentUser()).thenReturn(companyCaller);
        User employee = userInCompany(1L, Role.EMPLOYE, 10L);
        when(userRepository.findById(1L)).thenReturn(Optional.of(employee));
        when(fileStorageService.store(any(), anyString(), eq(false))).thenReturn("message_1_abc.pdf");
        when(messageRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        MockMultipartFile file = new MockMultipartFile("file", "policy.pdf", "application/pdf", new byte[]{1, 2, 3});
        Message result = messageService.replyToEmployee(1L, "We received your message", file);

        assertThat(result.getRecipient()).isSameAs(employee);
        assertThat(result.getSender()).isSameAs(companyCaller);
        assertThat(result.getAttachment()).isEqualTo("message_1_abc.pdf");
        verify(notificationService).notify(eq(employee), contains("We received your message"));
    }

    @Test
    void replyToEmployeeWorksWithoutAnAttachment() {
        User companyCaller = userInCompany(2L, Role.COMPANY, 10L);
        when(ownershipGuard.currentUser()).thenReturn(companyCaller);
        User employee = userInCompany(1L, Role.EMPLOYE, 10L);
        when(userRepository.findById(1L)).thenReturn(Optional.of(employee));
        when(messageRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Message result = messageService.replyToEmployee(1L, "No attachment here", null);

        assertThat(result.getAttachment()).isNull();
        verify(fileStorageService, never()).store(any(), anyString(), eq(false));
    }

    @Test
    void replyToEmployeeRejectsATargetThatIsNotAnEmployee() {
        User anotherCompanyUser = userInCompany(4L, Role.COMPANY, 10L);
        when(userRepository.findById(4L)).thenReturn(Optional.of(anotherCompanyUser));

        assertThatThrownBy(() -> messageService.replyToEmployee(4L, "Hi", null))
                .isInstanceOf(BadRequestException.class);
        verify(messageRepo, never()).save(any());
    }

    @Test
    void replyToEmployeeIsScopedToTheCallersCompany() {
        User employeeInAnotherCompany = userInCompany(1L, Role.EMPLOYE, 99L);
        when(userRepository.findById(1L)).thenReturn(Optional.of(employeeInAnotherCompany));
        doThrow(new AccessDeniedException("no")).when(ownershipGuard).checkCompanyAccess(99L);

        assertThatThrownBy(() -> messageService.replyToEmployee(1L, "Hi", null))
                .isInstanceOf(AccessDeniedException.class);
        verify(messageRepo, never()).save(any());
    }

    // ---- conversation queries ----

    @Test
    void getMyConversationQueriesBothDirectionsForTheCurrentUser() {
        User me = userInCompany(1L, Role.EMPLOYE, 10L);
        when(ownershipGuard.currentUser()).thenReturn(me);

        messageService.getMyConversation();

        verify(messageRepo).findBySender_IdUserOrRecipient_IdUserOrderByCreatedAtDesc(1L, 1L);
    }

    @Test
    void getReceivedMessagesQueriesBothDirectionsForTheCurrentCompany() {
        when(ownershipGuard.currentCompanyId()).thenReturn(10L);

        messageService.getReceivedMessages();

        verify(messageRepo).findBySender_Company_IdCompanyOrRecipient_Company_IdCompanyOrderByCreatedAtDesc(10L, 10L);
    }

    // ---- getMessageForAttachment ----

    @Test
    void getMessageForAttachmentAllowsEitherPartyOfTheExchange() {
        User sender = userInCompany(1L, Role.EMPLOYE, 10L);
        User recipient = userInCompany(2L, Role.COMPANY, 10L);
        Message message = Message.builder().id(1L).sender(sender).recipient(recipient).content("hi").build();
        when(messageRepo.findById(1L)).thenReturn(Optional.of(message));
        when(ownershipGuard.currentUser()).thenReturn(recipient);

        assertThat(messageService.getMessageForAttachment(1L)).isSameAs(message);
    }

    @Test
    void getMessageForAttachmentRejectsAnUninvolvedUser() {
        User sender = userInCompany(1L, Role.EMPLOYE, 10L);
        User recipient = userInCompany(2L, Role.COMPANY, 10L);
        Message message = Message.builder().id(1L).sender(sender).recipient(recipient).content("hi").build();
        when(messageRepo.findById(1L)).thenReturn(Optional.of(message));
        User stranger = userInCompany(3L, Role.EMPLOYE, 99L);
        when(ownershipGuard.currentUser()).thenReturn(stranger);

        assertThatThrownBy(() -> messageService.getMessageForAttachment(1L)).isInstanceOf(AccessDeniedException.class);
    }
}

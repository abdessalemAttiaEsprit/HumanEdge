package tn.esprit.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;
import tn.esprit.backend.entities.Enum.MessageCategory;

@Getter
@Setter
public class MessageCreateRequest {

    @NotBlank(message = "Message content is required")
    @Size(max = 1000, message = "Message must be 1000 characters or fewer")
    private String content;

    // Optionnel : par défaut MessageCategory.OTHER côté service si absent (voir
    // MessageService#sendMessageToCompany). Sans objet pour une réponse d'entreprise.
    private MessageCategory category;
}

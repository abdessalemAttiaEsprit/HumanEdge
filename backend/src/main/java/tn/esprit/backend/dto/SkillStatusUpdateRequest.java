package tn.esprit.backend.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;
import tn.esprit.backend.entities.Enum.SkillStatus;

@Getter
@Setter
public class SkillStatusUpdateRequest {

    @NotNull(message = "Status is required")
    private SkillStatus status;
}

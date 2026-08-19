package tn.esprit.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;
import tn.esprit.backend.entities.Enum.SkillCategory;

@Getter
@Setter
public class SkillCreateRequest {

    @NotBlank(message = "Label is required")
    private String label;

    @NotNull(message = "Category is required")
    private SkillCategory category;
}

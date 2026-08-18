package tn.esprit.backend.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;
import tn.esprit.backend.entities.Enum.TaskStatus;

@Getter
@Setter
public class TaskStatusUpdateRequest {

    @NotNull(message = "Status is required")
    private TaskStatus status;
}

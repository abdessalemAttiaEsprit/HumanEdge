package tn.esprit.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.List;

@Getter
@AllArgsConstructor
public class SkillSuggestions {
    private List<String> general;
    private List<String> specific;
}

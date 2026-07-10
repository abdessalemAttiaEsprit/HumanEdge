package tn.esprit.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import tn.esprit.backend.entities.Enum.TypeContrat;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Projection publique d'une offre d'emploi, exposée aux visiteurs non authentifiés
 * sur la page d'accueil. Ne contient volontairement aucune donnée sensible de
 * l'entreprise (pas de fiscalNumber/cnssNumber/rib) — seulement son nom.
 */
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PublicJobResponse {
    private Long id;
    private String title;
    private String description;
    private String department;
    private List<String> requiredSkills;
    private TypeContrat jobType;
    private LocalDateTime datePosted;
    private LocalDateTime deadline;
    private String companyName;
}

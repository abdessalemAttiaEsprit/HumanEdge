package tn.esprit.backend.catalog;

import tn.esprit.backend.dto.SkillSuggestions;

import java.text.Normalizer;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Catalogue statique de suggestions de compétences (pas d'IA/ML : voir contrainte projet - IA
 * réservée à Ollama). Les tags "spécifiques" sont choisis en cherchant, dans le poste
 * (Contract.Work) puis le département (Personnel.department) de l'employé, le premier mot-clé du
 * catalogue qu'ils contiennent ; à défaut, une liste générique de secours est utilisée.
 */
public final class SkillCatalog {

    private SkillCatalog() {
    }

    public static final List<String> GENERAL_TAGS = List.of(
            "Travail d'équipe", "Communication", "Gestion du temps", "Résolution de problèmes",
            "Adaptabilité", "Organisation", "Esprit critique", "Leadership"
    );

    private static final List<String> FALLBACK_SPECIFIC_TAGS = List.of(
            "Bureautique", "Rédaction professionnelle", "Gestion de projet", "Veille métier"
    );

    // LinkedHashMap : l'ordre d'insertion fixe la priorité de correspondance en cas de mots-clés
    // ambigus (ex: "informatique" testé avant un mot-clé plus générique).
    private static final Map<String, List<String>> SPECIFIC_BY_KEYWORD = new LinkedHashMap<>();

    static {
        SPECIFIC_BY_KEYWORD.put("informatique", List.of("Java", "Spring Boot", "React", "SQL", "Docker", "Git"));
        SPECIFIC_BY_KEYWORD.put("developpement", List.of("Java", "Spring Boot", "React", "SQL", "Docker", "Git"));
        SPECIFIC_BY_KEYWORD.put("it", List.of("Java", "Spring Boot", "React", "SQL", "Docker", "Git"));
        SPECIFIC_BY_KEYWORD.put("reseau", List.of("Administration système", "Cybersécurité", "Cloud (Azure/AWS)", "Virtualisation"));
        SPECIFIC_BY_KEYWORD.put("ressources humaines", List.of("Recrutement", "SIRH", "Droit du travail", "Gestion de la paie"));
        SPECIFIC_BY_KEYWORD.put("rh", List.of("Recrutement", "SIRH", "Droit du travail", "Gestion de la paie"));
        SPECIFIC_BY_KEYWORD.put("finance", List.of("Comptabilité générale", "Fiscalité", "Excel avancé", "SAP"));
        SPECIFIC_BY_KEYWORD.put("comptabilite", List.of("Comptabilité générale", "Fiscalité", "Excel avancé", "SAP"));
        SPECIFIC_BY_KEYWORD.put("marketing", List.of("SEO", "Réseaux sociaux", "Analytics", "Copywriting"));
        SPECIFIC_BY_KEYWORD.put("communication", List.of("SEO", "Réseaux sociaux", "Analytics", "Copywriting"));
        SPECIFIC_BY_KEYWORD.put("commercial", List.of("Négociation", "CRM", "Prospection", "Relation client"));
        SPECIFIC_BY_KEYWORD.put("vente", List.of("Négociation", "CRM", "Prospection", "Relation client"));
        SPECIFIC_BY_KEYWORD.put("logistique", List.of("Gestion de stock", "Supply chain", "SAP", "Optimisation des flux"));
        SPECIFIC_BY_KEYWORD.put("production", List.of("Lean management", "Contrôle qualité", "Maintenance industrielle", "Sécurité au travail"));
        SPECIFIC_BY_KEYWORD.put("juridique", List.of("Droit des affaires", "Rédaction contractuelle", "Contentieux", "Veille réglementaire"));
        SPECIFIC_BY_KEYWORD.put("design", List.of("UI/UX", "Figma", "Adobe Creative Suite", "Prototypage"));
    }

    public static SkillSuggestions suggest(String department, String work) {
        String haystack = normalize((work != null ? work : "") + " " + (department != null ? department : ""));

        List<String> specific = FALLBACK_SPECIFIC_TAGS;
        for (Map.Entry<String, List<String>> entry : SPECIFIC_BY_KEYWORD.entrySet()) {
            if (haystack.contains(entry.getKey())) {
                specific = entry.getValue();
                break;
            }
        }

        return new SkillSuggestions(GENERAL_TAGS, specific);
    }

    private static final Pattern DIACRITICS = Pattern.compile("\\p{InCombiningDiacriticalMarks}+");

    private static String normalize(String value) {
        String decomposed = Normalizer.normalize(value, Normalizer.Form.NFD);
        return DIACRITICS.matcher(decomposed).replaceAll("").toLowerCase();
    }
}

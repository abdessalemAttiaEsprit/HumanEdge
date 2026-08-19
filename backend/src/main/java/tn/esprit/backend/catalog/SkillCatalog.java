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
 *
 * <p>Renvoie des clés stables (jamais de texte affichable) : le frontend les traduit via
 * {@code t.skillCatalog} (en.ts/fr.ts), comme TaskStatus/TaskPriority. Une compétence tapée
 * librement par l'employé (hors catalogue) reste un texte brut, jamais traduite - seules les
 * suggestions du catalogue bénéficient du bilinguisme.
 */
public final class SkillCatalog {

    private SkillCatalog() {
    }

    public static final List<String> GENERAL_TAGS = List.of(
            "TEAMWORK", "COMMUNICATION", "TIME_MANAGEMENT", "PROBLEM_SOLVING",
            "ADAPTABILITY", "ORGANIZATION", "CRITICAL_THINKING", "LEADERSHIP"
    );

    private static final List<String> FALLBACK_SPECIFIC_TAGS = List.of(
            "OFFICE_TOOLS", "PROFESSIONAL_WRITING", "PROJECT_MANAGEMENT", "INDUSTRY_WATCH"
    );

    // LinkedHashMap : l'ordre d'insertion fixe la priorité de correspondance en cas de mots-clés
    // ambigus (ex: "informatique" testé avant un mot-clé plus générique). Les clés de cette map
    // (mots-clés département/poste) restent en français - elles ne sont jamais affichées, voir
    // normalize()/suggest() ; seules les VALEURS (clés de compétences) sont traduites côté client.
    private static final Map<String, List<String>> SPECIFIC_BY_KEYWORD = new LinkedHashMap<>();

    static {
        SPECIFIC_BY_KEYWORD.put("informatique", List.of("JAVA", "SPRING_BOOT", "REACT", "SQL", "DOCKER", "GIT"));
        SPECIFIC_BY_KEYWORD.put("developpement", List.of("JAVA", "SPRING_BOOT", "REACT", "SQL", "DOCKER", "GIT"));
        SPECIFIC_BY_KEYWORD.put("it", List.of("JAVA", "SPRING_BOOT", "REACT", "SQL", "DOCKER", "GIT"));
        SPECIFIC_BY_KEYWORD.put("reseau", List.of("SYS_ADMIN", "CYBERSECURITY", "CLOUD", "VIRTUALIZATION"));
        SPECIFIC_BY_KEYWORD.put("ressources humaines", List.of("RECRUITMENT", "HRIS", "LABOR_LAW", "PAYROLL_MGMT"));
        SPECIFIC_BY_KEYWORD.put("rh", List.of("RECRUITMENT", "HRIS", "LABOR_LAW", "PAYROLL_MGMT"));
        SPECIFIC_BY_KEYWORD.put("finance", List.of("ACCOUNTING", "TAXATION", "EXCEL_ADVANCED", "SAP"));
        SPECIFIC_BY_KEYWORD.put("comptabilite", List.of("ACCOUNTING", "TAXATION", "EXCEL_ADVANCED", "SAP"));
        SPECIFIC_BY_KEYWORD.put("marketing", List.of("SEO", "SOCIAL_MEDIA", "ANALYTICS", "COPYWRITING"));
        SPECIFIC_BY_KEYWORD.put("communication", List.of("SEO", "SOCIAL_MEDIA", "ANALYTICS", "COPYWRITING"));
        SPECIFIC_BY_KEYWORD.put("commercial", List.of("NEGOTIATION", "CRM", "PROSPECTING", "CLIENT_RELATIONS"));
        SPECIFIC_BY_KEYWORD.put("vente", List.of("NEGOTIATION", "CRM", "PROSPECTING", "CLIENT_RELATIONS"));
        SPECIFIC_BY_KEYWORD.put("logistique", List.of("INVENTORY_MGMT", "SUPPLY_CHAIN", "SAP", "FLOW_OPTIMIZATION"));
        SPECIFIC_BY_KEYWORD.put("production", List.of("LEAN_MGMT", "QUALITY_CONTROL", "INDUSTRIAL_MAINTENANCE", "WORKPLACE_SAFETY"));
        SPECIFIC_BY_KEYWORD.put("juridique", List.of("BUSINESS_LAW", "CONTRACT_DRAFTING", "LITIGATION", "REGULATORY_WATCH"));
        SPECIFIC_BY_KEYWORD.put("design", List.of("UI_UX", "FIGMA", "ADOBE_SUITE", "PROTOTYPING"));
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

package tn.esprit.backend.services;

import org.springframework.stereotype.Service;
import tn.esprit.backend.entities.Contract;
import tn.esprit.backend.exceptions.BadRequestException;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.Map;

/**
 * Grille salariale tunisienne (catégorie de diplôme / échelon) et règle d'avancement :
 * un échelon est acquis en moyenne tous les 2 ans d'ancienneté, à partir de l'échelon 1.
 * Un contrat rattaché à une catégorie voit son échelon et son salaire de base avancer
 * automatiquement (voir {@link #applyAutomaticEchelon}) ; sans catégorie, le salaire reste
 * géré manuellement comme avant.
 */
@Service
public class PaymentSuggestionService {

    public record SalaryGrade(double salaireBase, int pointsIndiciaires) {}

    public record CategorySuggestion(String categorie, String description, int echelonSuggere,
                                      double salaireBase, int pointsIndiciaires, int anneesExperience) {}

    private record Category(String description, Map<Integer, SalaryGrade> echelons) {}

    private static final Map<String, Category> GRILLE_SALARIALE = buildGrilleSalariale();

    public CategorySuggestion suggererProfilRH(String categorie, int anneesExperience) {
        if (anneesExperience < 0) {
            throw new BadRequestException("Years of experience cannot be negative");
        }
        String catKey = normalizeCategorie(categorie);
        Category category = getCategoryOrThrow(catKey);
        int echelonSuggere = resolveEchelon(catKey, anneesExperience);
        SalaryGrade grade = category.echelons().get(echelonSuggere);

        return new CategorySuggestion(catKey, category.description(), echelonSuggere,
                grade.salaireBase(), grade.pointsIndiciaires(), anneesExperience);
    }

    /**
     * Échelon atteint pour une catégorie donnée après N années d'ancienneté (plafonné au
     * dernier échelon défini pour cette catégorie).
     */
    public int resolveEchelon(String categorie, int anneesExperience) {
        Category category = getCategoryOrThrow(normalizeCategorie(categorie));
        int maxEchelonDispo = category.echelons().keySet().stream().max(Integer::compareTo).orElse(1);
        int annees = Math.max(anneesExperience, 0);
        return Math.min(1 + (annees / 2), maxEchelonDispo);
    }

    public SalaryGrade getGrade(String categorie, int echelon) {
        Category category = getCategoryOrThrow(normalizeCategorie(categorie));
        SalaryGrade grade = category.echelons().get(echelon);
        if (grade == null) {
            throw new BadRequestException("Step " + echelon + " is invalid for category " + categorie);
        }
        return grade;
    }

    /**
     * Recalcule l'échelon d'un contrat rattaché à une catégorie, à partir de son ancienneté
     * (dateDebut → aujourd'hui, ou dateFin si le contrat est terminé), et met à jour l'échelon
     * et le salaire de base sur l'objet en mémoire si l'échelon a changé. Ne fait rien si le
     * contrat n'a pas de catégorie (salaire géré manuellement) : n'effectue aucune persistance,
     * c'est à l'appelant de sauvegarder le contrat si cette méthode retourne {@code true}.
     */
    public boolean applyAutomaticEchelon(Contract contract) {
        if (contract == null || contract.getCategorie() == null || contract.getCategorie().isBlank()
                || contract.getDateDebut() == null) {
            return false;
        }

        LocalDate today = LocalDate.now();
        LocalDate referenceDate = (contract.getDateFin() != null && contract.getDateFin().isBefore(today))
                ? contract.getDateFin() : today;

        // Un contrat qui n'a pas encore démarré (dateDebut future) a une ancienneté de 0, pas
        // "pas encore calculable" : il doit quand même afficher le salaire de l'échelon 1 dès
        // sa création, plutôt que de rester sans salaire de base jusqu'à sa date de début.
        String catKey = normalizeCategorie(contract.getCategorie());
        int anciennete = referenceDate.isBefore(contract.getDateDebut())
                ? 0
                : (int) ChronoUnit.YEARS.between(contract.getDateDebut(), referenceDate);
        int echelonCalcule = resolveEchelon(catKey, anciennete);

        boolean changed = !catKey.equals(contract.getCategorie())
                || contract.getEchelon() == null || contract.getEchelon() != echelonCalcule;
        if (!changed) {
            return false;
        }

        SalaryGrade grade = getGrade(catKey, echelonCalcule);
        contract.setCategorie(catKey);
        contract.setEchelon(echelonCalcule);
        contract.setSalaireBase(grade.salaireBase());
        return true;
    }

    public Map<String, String> getAvailableCategories() {
        Map<String, String> out = new HashMap<>();
        GRILLE_SALARIALE.forEach((key, cat) -> out.put(key, cat.description()));
        return out;
    }

    private static String normalizeCategorie(String categorie) {
        if (categorie == null || categorie.isBlank()) {
            throw new BadRequestException("Category is required");
        }
        return categorie.trim().toUpperCase();
    }

    private static Category getCategoryOrThrow(String catKey) {
        Category category = GRILLE_SALARIALE.get(catKey);
        if (category == null) {
            throw new BadRequestException("Invalid category \"" + catKey + "\". Available categories: "
                    + String.join(", ", GRILLE_SALARIALE.keySet()));
        }
        return category;
    }

    private static Map<String, Category> buildGrilleSalariale() {
        Map<String, Category> matrice = new HashMap<>();

        matrice.put("A1", categorie("Cadres supérieurs (Ingénieurs, Doctorat, Master)",
                grade(1, 1950.000, 450), grade(2, 2100.000, 485), grade(3, 2250.000, 520),
                grade(4, 2400.000, 555), grade(5, 2600.000, 600)));

        matrice.put("A2", categorie("Cadres (Licence, Maîtrise)",
                grade(1, 1450.000, 335), grade(2, 1550.000, 360), grade(3, 1650.000, 385),
                grade(4, 1750.000, 410)));

        matrice.put("A3", categorie("Techniciens supérieurs, BTS",
                grade(1, 1150.000, 265), grade(2, 1220.000, 280), grade(3, 1290.000, 295)));

        matrice.put("B", categorie("Agents de maîtrise (Niveau Bac)",
                grade(1, 950.000, 220), grade(2, 1000.000, 232), grade(3, 1050.000, 244)));

        matrice.put("C", categorie("Agents d'exécution (9ème année)",
                grade(1, 700.000, 160), grade(2, 740.000, 170)));

        matrice.put("D", categorie("Ouvriers (Base SMIG)",
                grade(1, 528.000, 120), grade(2, 550.000, 125)));

        return matrice;
    }

    private static Category categorie(String description, EchelonEntry... entries) {
        Map<Integer, SalaryGrade> echelons = new HashMap<>();
        for (EchelonEntry entry : entries) {
            echelons.put(entry.echelon(), entry.grade());
        }
        return new Category(description, echelons);
    }

    private static EchelonEntry grade(int echelon, double salaireBase, int pointsIndiciaires) {
        return new EchelonEntry(echelon, new SalaryGrade(salaireBase, pointsIndiciaires));
    }

    private record EchelonEntry(int echelon, SalaryGrade grade) {}
}

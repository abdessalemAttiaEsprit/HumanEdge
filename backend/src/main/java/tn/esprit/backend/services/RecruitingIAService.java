package tn.esprit.backend.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Évalue l'adéquation d'un CV candidat avec une offre d'emploi via un LLM local (Ollama).
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class RecruitingIAService {

    private final RestTemplate restTemplate;
    private final PdfService pdfService;

    @Value("${ai.provider:ollama}")
    private String aiProvider;

    @Value("${ollama.base-url:http://localhost:11434}")
    private String ollamaBaseUrl;

    @Value("${ollama.model:llama3.1:latest}")
    private String ollamaModel;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private boolean isOllamaProvider() {
        return aiProvider != null && aiProvider.trim().equalsIgnoreCase("ollama");
    }

    public Map<String, Object> getRuntimeAiConfig() {
        if (!isOllamaProvider()) {
            log.warn("Provider IA non supporté: {}", aiProvider);
            return null;
        }
        return Map.of(
                "provider", "ollama",
                "baseUrl", ollamaBaseUrl,
                "model", ollamaModel
        );
    }

    public Map<String, Object> listAvailableModels() {
        if (!isOllamaProvider()) {
            log.warn("Provider IA non supporté: {}", aiProvider);
            return null;
        }
        String url = String.format("%s/api/tags", ollamaBaseUrl);
        log.debug("Liste modèles Ollama: {}", url);

        String response = restTemplate.getForObject(url, String.class);
        try {
            JsonNode root = objectMapper.readTree(response);
            JsonNode modelsNode = root.path("models");

            List<String> modelIds = new ArrayList<>();
            List<Map<String, Object>> modelsDetailed = new ArrayList<>();

            if (modelsNode.isArray()) {
                for (JsonNode modelNode : modelsNode) {
                    String name = modelNode.path("name").asText(null);
                    if (name != null && !name.isBlank()) {
                        modelIds.add(name);
                        Map<String, Object> modelInfo = new HashMap<>();
                        modelInfo.put("name", name);
                        modelInfo.put("modelId", name);
                        modelsDetailed.add(modelInfo);
                    }
                }
            }

            return Map.of(
                    "modelIds", modelIds,
                    "models", modelIds,
                    "modelsDetailed", modelsDetailed
            );
        } catch (Exception e) {
            log.warn("Impossible de parser la liste des modèles Ollama", e);
            return Map.of("modelIds", List.of(), "models", List.of(), "modelsDetailed", List.of());
        }
    }

    /**
     * Compare un CV (PDF) avec une offre d'emploi et retourne un score + feedback.
     */
    public Map<String, Object> evaluateCandidateMatch(String jobDescription, MultipartFile cvPdfFile) throws IOException {
        log.info("=== ÉVALUATION CANDIDAT AVEC PDF ===");
        if (cvPdfFile == null || cvPdfFile.isEmpty()) {
            throw new IllegalArgumentException("The CV PDF file cannot be empty");
        }
        if (jobDescription == null || jobDescription.trim().isEmpty()) {
            throw new IllegalArgumentException("The job description cannot be empty");
        }
        String candidateCv = extractCvText(cvPdfFile);
        return evaluateCandidateMatchWithText(jobDescription, candidateCv);
    }

    public Map<String, Object> evaluateCandidateMatch(String jobDescription, byte[] cvPdfBytes) throws IOException {
        log.info("=== ÉVALUATION CANDIDAT AVEC PDF (BYTES) ===");
        if (cvPdfBytes == null || cvPdfBytes.length == 0) {
            throw new IllegalArgumentException("The CV PDF content cannot be empty");
        }
        if (jobDescription == null || jobDescription.trim().isEmpty()) {
            throw new IllegalArgumentException("The job description cannot be empty");
        }
        String candidateCv = extractCvText(cvPdfBytes);
        return evaluateCandidateMatchWithText(jobDescription, candidateCv);
    }

    public Map<String, Object> evaluateCandidateMatchWithText(String jobDescription, String candidateCv) {
        if (jobDescription == null || jobDescription.trim().isEmpty()) {
            return errorResult("Description du poste manquante");
        }
        if (candidateCv == null || candidateCv.trim().isEmpty()) {
            return errorResult("Texte du CV manquant (PDF scanné). Essayez un PDF texte");
        }
        if (!isValidCv(candidateCv)) {
            return errorResult("Document invalide : le fichier fourni n'est pas un CV.");
        }

        String prompt = String.format(
                "Compare ce CV à cette offre d'emploi. Donne une note de 0 à 100 basée sur les compétences techniques et l'expérience. Justifie brièvement.\n\n" +
                        "OFFRE D'EMPLOI:\n%s\n\n" +
                        "CV DU CANDIDAT:\n%s\n\n" +
                        "Réponds UNIQUEMENT en JSON valide (pas de ``` et aucun texte hors JSON).\n" +
                        "Le champ 'score' doit être un ENTIER entre 0 et 100.\n" +
                        "Structure exacte:\n" +
                        "{\"score\": <entier 0-100>, \"feedback\": \"<justification brève>\", \"competences_requises\": [<list de compétences manquantes>]}",
                jobDescription, candidateCv
        );

        try {
            String response = callOllamaAPI(prompt);
            return parseAIResponse(response);
        } catch (Exception e) {
            log.error("Erreur lors de l'évaluation du candidat", e);
            return errorResult("Erreur lors de l'évaluation: " + e.getMessage());
        }
    }

    private boolean isValidCv(String documentContent) {
        String verificationPrompt = String.format(
                "Tu es un validateur de documents RH.\n" +
                        "Réponds UNIQUEMENT par le mot 'true' ou 'false', rien d'autre.\n\n" +
                        "Un CV valide doit contenir AU MOINS 2 de ces éléments :\n" +
                        "- Des expériences professionnelles (postes, entreprises, dates)\n" +
                        "- Des compétences techniques ou soft skills\n" +
                        "- Une formation ou des diplômes\n" +
                        "- Des informations de contact (nom, email, téléphone)\n\n" +
                        "Réponds 'false' si le document est :\n" +
                        "- Une facture, bon de commande, contrat, ou document commercial\n" +
                        "- Un texte aléatoire ou incohérent\n" +
                        "- Vide ou quasi-vide\n" +
                        "- Tout autre chose qu'un CV\n\n" +
                        "Document à analyser :\n%s\n\n" +
                        "Réponds uniquement par 'true' ou 'false' :",
                documentContent
        );

        try {
            String response = callOllamaAPI(verificationPrompt);
            return response.trim().toLowerCase().contains("true");
        } catch (Exception e) {
            return false; // par sécurité, on rejette si erreur
        }
    }

    private String extractCvText(MultipartFile cvPdfFile) throws IOException {
        return normalizeCvText(pdfService.extractTextFromPdf(cvPdfFile));
    }

    private String extractCvText(byte[] cvPdfBytes) throws IOException {
        return normalizeCvText(pdfService.extractTextFromPdfBytes(cvPdfBytes));
    }

    private String normalizeCvText(String text) {
        String normalized = text != null ? text.trim() : "";
        log.info("Texte du CV extrait - {} caractères", normalized.length());
        if (normalized.length() < 30) {
            log.warn("Texte CV très court après extraction ({} chars). PDF scanné/image possible.", normalized.length());
        }
        return normalized;
    }

    private String callOllamaAPI(String prompt) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            Map<String, Object> options = Map.of(
                    "temperature", 0.2,
                    "num_predict", 1000
            );

            Map<String, Object> body = new HashMap<>();
            body.put("model", ollamaModel);
            body.put("prompt", prompt);
            body.put("stream", false);
            body.put("format", "json");
            body.put("options", options);

            HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);
            String apiUrl = String.format("%s/api/generate", ollamaBaseUrl);

            log.debug("Appel Ollama API (model={}): {}", ollamaModel, apiUrl);
            String response = restTemplate.postForObject(apiUrl, request, String.class);
            log.debug("Réponse Ollama reçue");
            return response;
        } catch (Exception e) {
            String hint = "Vérifie que Ollama tourne (service démarré) et que le modèle est présent. " +
                    "Exemples: `ollama serve` puis `ollama pull " + (ollamaModel != null ? ollamaModel : "<model>") + "`.";
            log.error("Erreur lors de l'appel à Ollama API. {}", hint, e);
            throw new IllegalStateException("Erreur Ollama: " + e.getMessage() + ". " + hint, e);
        }
    }

    private Map<String, Object> parseAIResponse(String response) {
        try {
            JsonNode root = objectMapper.readTree(response);
            String generatedText = root.path("response").asText("");
            return parseGeneratedJsonText(generatedText, response);
        } catch (Exception e) {
            log.error("Erreur lors du parsing de la réponse Ollama", e);
            return errorResult("Erreur lors du parsing de la réponse");
        }
    }

    private Map<String, Object> parseGeneratedJsonText(String generatedText, String rawResponse) {
        try {
            String cleanedText = stripCodeFences(generatedText);
            log.debug("Texte généré par IA: {}", cleanedText);

            String jsonText = extractFirstJsonObject(cleanedText);
            JsonNode jsonContent = objectMapper.readTree(jsonText);

            Map<String, Object> result = new HashMap<>();
            int score = parseScoreValue(jsonContent.get("score"), cleanedText);
            result.put("score", score);
            result.put("feedback", jsonContent.path("feedback").asText("Pas de feedback"));
            result.put("competences_requises", extractCompetencesRequises(jsonContent.get("competences_requises")));
            return result;
        } catch (Exception e) {
            log.warn("Impossible de parser la sortie IA en JSON (rawResponse={})", rawResponse, e);
            return errorResult("Réponse IA invalide (JSON non parsable)");
        }
    }

    private List<String> extractCompetencesRequises(JsonNode node) {
        if (node == null || node.isNull() || node.isMissingNode()) {
            return List.of();
        }
        List<String> out = new ArrayList<>();
        if (node.isArray()) {
            for (JsonNode item : node) {
                if (item == null || item.isNull()) {
                    continue;
                }
                if (item.isTextual()) {
                    addIfNotBlank(out, item.asText());
                } else if (item.isObject()) {
                    String v = item.path("nom").asText("");
                    if (v.isBlank()) {
                        v = item.path("name").asText("");
                    }
                    addIfNotBlank(out, v);
                } else {
                    addIfNotBlank(out, item.asText(""));
                }
            }
            return out;
        }
        if (node.isTextual()) {
            addIfNotBlank(out, node.asText());
        }
        return out;
    }

    private void addIfNotBlank(List<String> out, String value) {
        if (value != null && !value.trim().isEmpty()) {
            out.add(value.trim());
        }
    }

    private String stripCodeFences(String text) {
        if (text == null) {
            return "";
        }
        String cleaned = text.trim();
        if (cleaned.startsWith("```")) {
            cleaned = cleaned.replaceFirst("^```[a-zA-Z0-9]*", "").trim();
        }
        if (cleaned.endsWith("```")) {
            cleaned = cleaned.substring(0, cleaned.length() - 3).trim();
        }
        return cleaned;
    }

    private String extractFirstJsonObject(String text) {
        if (text == null) {
            return "";
        }
        String trimmed = text.trim();
        int start = trimmed.indexOf('{');
        int end = trimmed.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return trimmed.substring(start, end + 1);
        }
        return trimmed;
    }

    private int parseScoreValue(JsonNode scoreNode, String fallbackText) {
        int score = 0;
        if (scoreNode != null && !scoreNode.isNull()) {
            if (scoreNode.isNumber()) {
                score = scoreNode.asInt();
            } else if (scoreNode.isTextual()) {
                score = extractScoreFromText(scoreNode.asText());
            }
        }
        if (score == 0 && fallbackText != null) {
            int extracted = extractScoreFromText(fallbackText);
            if (extracted > 0) {
                score = extracted;
            }
        }
        return Math.max(0, Math.min(score, 100));
    }

    private int extractScoreFromText(String text) {
        if (text == null) {
            return 0;
        }
        Matcher m = Pattern.compile("(\\b\\d{1,3}\\b)").matcher(text);
        while (m.find()) {
            int value = Integer.parseInt(m.group(1));
            if (value >= 0 && value <= 100) {
                return value;
            }
        }
        return 0;
    }

    private Map<String, Object> errorResult(String feedback) {
        return Map.of("score", 0, "feedback", feedback, "competences_requises", List.of());
    }
}

package tn.esprit.backend.services;

import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Génère un CSV minimal (en-têtes + lignes) à partir de tableaux de chaînes déjà formatées -
 * pas de dépendance externe (Apache POI/OpenCSV) pour un besoin aussi simple, et le CSV
 * s'ouvre nativement dans Excel/LibreOffice, contrairement à un vrai .xlsx qui aurait
 * nécessité une nouvelle dépendance.
 */
@Service
public class CsvExportService {

    public byte[] toCsv(List<String> headers, List<List<String>> rows) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        // BOM UTF-8 : Excel n'auto-détecte l'encodage d'un CSV qu'en sa présence, sinon les
        // caractères accentués (noms, départements...) s'affichent mal à l'ouverture.
        out.write(0xEF);
        out.write(0xBB);
        out.write(0xBF);
        try (PrintWriter writer = new PrintWriter(out, true, StandardCharsets.UTF_8)) {
            writer.println(toLine(headers));
            for (List<String> row : rows) {
                writer.println(toLine(row));
            }
        }
        return out.toByteArray();
    }

    private String toLine(List<String> values) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append(escape(values.get(i)));
        }
        return sb.toString();
    }

    private String escape(String value) {
        if (value == null) {
            return "";
        }
        boolean needsQuoting = value.contains(",") || value.contains("\"") || value.contains("\n");
        String escaped = value.replace("\"", "\"\"");
        return needsQuoting ? "\"" + escaped + "\"" : escaped;
    }
}

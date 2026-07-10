package tn.esprit.backend.services;

import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import tn.esprit.backend.exceptions.BadRequestException;

import java.net.MalformedURLException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class FileStorageService {

    // Chemin de stockage des fichiers (à adapter selon l'environnement)
    private final Path rootLocation = Paths.get("uploads");

    // Extension dérivée du Content-Type validé, jamais du nom de fichier fourni par le client :
    // un Content-Type "image/png" avec un nom de fichier "shell.jsp" ne doit jamais produire
    // un fichier stocké en .jsp. SVG exclu (peut embarquer du <script>, exécuté si le fichier
    // est ouvert directement depuis /uploads/**, qui est public).
    private static final Map<String, String> CONTENT_TYPE_EXTENSIONS = Map.of(
            "image/png", "png",
            "image/jpeg", "jpg",
            "image/gif", "gif",
            "application/pdf", "pdf",
            "application/msword", "doc",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"
    );

    private static final List<String> ALLOWED_IMAGE_TYPES = List.copyOf(CONTENT_TYPE_EXTENSIONS.keySet());

    private static final List<String> ALLOWED_LOGO_TYPES = Arrays.asList(
            "image/png", "image/jpeg", "image/gif"
    );

    private static final long MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

    public String store(MultipartFile file, String fileNamePrefix, boolean isLogo) {
        if (file == null || file.isEmpty()) {
            return null;
        }

        // Vérification du type de fichier
        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED_IMAGE_TYPES.contains(contentType)) {
            if (isLogo) {
                throw new BadRequestException("The logo must be an image (PNG, JPEG, GIF).");
            }
            throw new BadRequestException("The file must be an image, a PDF or a Word document.");
        }
        if (isLogo && !ALLOWED_LOGO_TYPES.contains(contentType)) {
            throw new BadRequestException("The logo must be an image (PNG, JPEG, GIF).");
        }

        // Vérification de la taille du fichier
        if (file.getSize() > MAX_FILE_SIZE) {
            throw new BadRequestException("The file must not exceed 5 MB.");
        }

        try {
            // Création du répertoire s'il n'existe pas
            if (!Files.exists(rootLocation)) {
                Files.createDirectories(rootLocation);
            }

            // Nom de fichier unique ; l'extension vient uniquement du Content-Type validé ci-dessus,
            // jamais du nom de fichier original fourni par le client.
            String extension = CONTENT_TYPE_EXTENSIONS.get(contentType);
            String filename = fileNamePrefix + "_" + UUID.randomUUID() + "." + extension;

            Path destinationFile = this.rootLocation.resolve(filename).normalize().toAbsolutePath();
            Files.copy(file.getInputStream(), destinationFile, StandardCopyOption.REPLACE_EXISTING);

            return filename;
        } catch (Exception e) {
            throw new RuntimeException("Failed to store file: " + e.getMessage(), e);
        }
    }

    /**
     * Résout un nom de fichier stocké vers son chemin sur disque. Ne conserve que le nom de
     * fichier (jamais de composants de répertoire) et vérifie que le chemin résolu reste bien
     * sous le répertoire racine, pour empêcher toute traversée de répertoire — {@code filename}
     * peut provenir d'un champ base de données modifiable par le client (cvFileId, justification,
     * image, ...), donc jamais faire confiance à sa forme brute.
     */
    public Resource loadAsResource(String filename) {
        if (filename == null || filename.isBlank()) {
            throw new RuntimeException("File not found");
        }
        try {
            Path root = this.rootLocation.toAbsolutePath().normalize();
            String cleanName = Paths.get(filename).getFileName().toString();
            Path filePath = root.resolve(cleanName).normalize();
            if (!filePath.startsWith(root)) {
                throw new RuntimeException("File not found");
            }

            Resource resource = new UrlResource(filePath.toUri());
            if (resource.exists() && resource.isReadable()) {
                return resource;
            } else {
                throw new RuntimeException("File not found");
            }
        } catch (MalformedURLException e) {
            throw new RuntimeException("File not found");
        }
    }
}

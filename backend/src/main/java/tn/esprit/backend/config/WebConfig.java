package tn.esprit.backend.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Expose le contenu du dossier de stockage local ({@code uploads/}) en HTTP sous
 * {@code /uploads/**}, afin que le frontend puisse afficher les logos d'entreprise,
 * signatures et avatars via une simple URL (ex. balise {@code <img src>}).
 *
 * <p>Le dossier est résolu de la même manière que {@link tn.esprit.backend.services.FileStorageService}
 * (chemin relatif {@code uploads} par rapport au répertoire de lancement), puis converti en URI
 * absolue {@code file:///...} pour être portable (Windows/Linux).</p>
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        Path uploadDir = Paths.get("uploads").toAbsolutePath().normalize();
        String uploadLocation = uploadDir.toUri().toString(); // ex. file:///C:/.../uploads/

        registry.addResourceHandler("/uploads/**")
                .addResourceLocations(uploadLocation)
                .setCachePeriod(3600);
    }
}

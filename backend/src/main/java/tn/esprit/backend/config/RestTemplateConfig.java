package tn.esprit.backend.config;

import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

@Configuration
public class RestTemplateConfig {

    @Bean
    public RestTemplate restTemplate(RestTemplateBuilder builder) {
        // Ollama tourne dans un pod séparé (voir infra/k8s/base/ollama-deployment.yaml) :
        // sans timeout, un Ollama lent ou injoignable bloquerait indéfiniment le thread de
        // requête du backend (RecruitingIAService l'appelle en synchrone).
        return builder
                .connectTimeout(Duration.ofSeconds(5))
                .readTimeout(Duration.ofSeconds(90))
                .build();
    }
}

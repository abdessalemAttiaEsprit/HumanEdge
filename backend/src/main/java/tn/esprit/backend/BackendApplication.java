package tn.esprit.backend;

import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.security.crypto.password.PasswordEncoder;
import tn.esprit.backend.entities.Enum.Role;
import tn.esprit.backend.entities.User;
import tn.esprit.backend.repositories.UserRepository;

@SpringBootApplication
@EnableScheduling
public class BackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(BackendApplication.class, args);
    }
    @Bean
    CommandLineRunner run(UserRepository userRepository, PasswordEncoder passwordEncoder) { // <-- Injecte-le ici
        return args -> {
            if (userRepository.count() == 0) {
                userRepository.save(User.builder()
                        .firstname("Admin")
                        .lastname("HumanEdge")
                        .email("admin@esprit.tn")
                        .password(passwordEncoder.encode("admin")) // <--- CORRECTION ICI
                        .role(Role.ADMIN)
                        .enabled(true)
                        .build());
            }
        };
    }
}

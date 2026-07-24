package tn.esprit.backend.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import tn.esprit.backend.entities.PasswordResetToken;

import java.util.Optional;

@Repository
public interface PasswordResetTokenRepo extends JpaRepository<PasswordResetToken, Long> {

    Optional<PasswordResetToken> findByTokenAndConsumedFalse(String token);

    @Modifying
    @Query("delete from PasswordResetToken t where t.email = :email and t.consumed = false")
    void deleteUnconsumedByEmail(String email);
}

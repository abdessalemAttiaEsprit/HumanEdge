package tn.esprit.backend.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import tn.esprit.backend.entities.LoginOtp;

import java.util.Optional;

@Repository
public interface LoginOtpRepo extends JpaRepository<LoginOtp, Long> {

    Optional<LoginOtp> findTopByEmailAndConsumedFalseOrderByIdDesc(String email);

    @Modifying
    @Query("delete from LoginOtp o where o.email = :email and o.consumed = false")
    void deleteUnconsumedByEmail(String email);
}

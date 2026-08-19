package tn.esprit.backend.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import tn.esprit.backend.entities.GoogleCalendarAccount;

import java.util.Optional;

@Repository
public interface GoogleCalendarAccountRepo extends JpaRepository<GoogleCalendarAccount, Long> {
    Optional<GoogleCalendarAccount> findByUser_IdUser(Long userId);

    void deleteByUser_IdUser(Long userId);
}

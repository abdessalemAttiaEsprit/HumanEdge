package tn.esprit.backend.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import tn.esprit.backend.entities.Candidate;

import java.util.Optional;

@Repository
public interface CondidateRepo extends JpaRepository<Candidate,Long> {
    Optional<Candidate> findByUser_IdUser(Long userId);
}

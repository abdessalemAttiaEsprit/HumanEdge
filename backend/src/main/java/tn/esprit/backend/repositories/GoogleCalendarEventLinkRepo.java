package tn.esprit.backend.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import tn.esprit.backend.entities.Enum.SyncSourceType;
import tn.esprit.backend.entities.GoogleCalendarEventLink;

import java.util.List;
import java.util.Optional;

@Repository
public interface GoogleCalendarEventLinkRepo extends JpaRepository<GoogleCalendarEventLink, Long> {
    Optional<GoogleCalendarEventLink> findBySourceTypeAndSourceIdAndUser_IdUser(SyncSourceType sourceType, Long sourceId, Long userId);

    List<GoogleCalendarEventLink> findBySourceTypeAndSourceId(SyncSourceType sourceType, Long sourceId);
}

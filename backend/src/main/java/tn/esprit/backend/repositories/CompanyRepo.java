package tn.esprit.backend.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import tn.esprit.backend.entities.Company;

@Repository
public interface CompanyRepo extends JpaRepository<Company, Long> {

    boolean existsByFiscalNumber(String fiscalNumber);

    boolean existsByCnssNumber(String cnssNumber);

    boolean existsByRib(String rib);

}

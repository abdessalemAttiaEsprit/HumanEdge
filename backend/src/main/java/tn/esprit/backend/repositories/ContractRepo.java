package tn.esprit.backend.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import tn.esprit.backend.entities.Contract;

import java.util.List;

@Repository
public interface ContractRepo extends JpaRepository<Contract,Long > {
    List<Contract> findByPersonnel_User_Company_IdCompany(Long companyId);
}

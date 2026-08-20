package tn.esprit.backend.exceptions;

public class CompanyNotOperationalException extends RuntimeException {
    public CompanyNotOperationalException(String message) {
        super(message);
    }
}

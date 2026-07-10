package tn.esprit.backend.services;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import tn.esprit.backend.entities.Candidate;
import tn.esprit.backend.entities.Interview;
import tn.esprit.backend.entities.JobPosting;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class InterviewEmailNotificationService {

    private final JavaMailSender mailSender;

    @Value("${notifications.mail.enabled:true}")
    private boolean mailEnabled;

    @Value("${spring.mail.username:}")
    private String fromAddress;

    @Value("${spring.mail.host:}")
    private String mailHost;

    @Value("${notifications.mail.recruitment.cc:}")
    private String recruitmentCc;

    public void notifyInterviewScheduled(Candidate candidate, JobPosting jobPosting, Interview interview) {
        if (!mailEnabled) {
            return;
        }
        if (candidate == null || interview == null) {
            return;
        }
        if (mailHost == null || mailHost.isBlank()) {
            log.warn("Mail not configured (spring.mail.host missing). Skipping interview scheduled email.");
            return;
        }

        String to = candidate.getEmail();
        if (to == null || to.isBlank() || hasCrlf(to)) {
            log.warn("Candidate email missing/invalid for candidateId {}. Skipping interview scheduled email.", candidate.getId());
            return;
        }

        String fullName = (candidate.getFirstName() != null ? candidate.getFirstName() : "")
                + (candidate.getLastName() != null ? (" " + candidate.getLastName()) : "");
        fullName = fullName.trim();
        if (fullName.isBlank()) {
            fullName = "candidate";
        }

        String jobTitle = (jobPosting != null && jobPosting.getTitle() != null) ? jobPosting.getTitle().trim() : "";

        LocalDateTime dateTime = interview.getInterviewDate();
        String dateLabel = dateTime != null
                ? dateTime.format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"))
                : "(not specified)";

        String location = interview.getInterviewLocation() != null ? interview.getInterviewLocation().trim() : "";
        if (location.isBlank()) {
            location = "(not specified)";
        }

        String subject = "Interview scheduled" + (!jobTitle.isBlank() ? (" - " + jobTitle) : "");
        subject = stripCrlf(subject);

        String body = "Hello " + fullName + ",\n\n"
                + "Your interview" + (!jobTitle.isBlank() ? (" for the \"" + jobTitle + "\" position") : "") + " has been scheduled.\n\n"
                + "Date/time: " + dateLabel + "\n"
                + "Location : " + location + "\n\n"
                + "Please confirm your attendance by replying to this email.\n\n"
                + "Best regards,\n"
                + "The HR team";

        try {
            SimpleMailMessage message = new SimpleMailMessage();
            if (fromAddress != null && !fromAddress.isBlank() && !hasCrlf(fromAddress)) {
                message.setFrom(fromAddress);
            }
            message.setTo(to);

            String[] ccList = parseRecipients(recruitmentCc);
            if (ccList.length > 0) {
                message.setCc(ccList);
            }

            message.setSubject(subject);
            message.setText(body);

            mailSender.send(message);
            log.info("Interview scheduled email sent to {} (cc={}, interviewId={})", to, ccList.length, interview.getId());
        } catch (Exception e) {
            // On ne bloque pas la planification de l'entretien si l'email échoue.
            log.warn("Failed to send interview scheduled email to {} (interviewId={}). Cause: {}",
                    to, interview.getId(), e.getMessage());
        }
    }

    /** Envoyé automatiquement quand un entretien passe au statut COMPLETED (voir InterviewService). */
    public void notifyInterviewCompleted(Candidate candidate, JobPosting jobPosting, Interview interview) {
        if (!mailEnabled) {
            return;
        }
        if (candidate == null || interview == null) {
            return;
        }
        if (mailHost == null || mailHost.isBlank()) {
            log.warn("Mail not configured (spring.mail.host missing). Skipping interview completed email.");
            return;
        }

        String to = candidate.getEmail();
        if (to == null || to.isBlank() || hasCrlf(to)) {
            log.warn("Candidate email missing/invalid for candidateId {}. Skipping interview completed email.", candidate.getId());
            return;
        }

        String fullName = (candidate.getFirstName() != null ? candidate.getFirstName() : "")
                + (candidate.getLastName() != null ? (" " + candidate.getLastName()) : "");
        fullName = fullName.trim();
        if (fullName.isBlank()) {
            fullName = "candidate";
        }

        String jobTitle = (jobPosting != null && jobPosting.getTitle() != null) ? jobPosting.getTitle().trim() : "";

        String subject = "Thank you for your interview" + (!jobTitle.isBlank() ? (" - " + jobTitle) : "");
        subject = stripCrlf(subject);

        String body = "Hello " + fullName + ",\n\n"
                + "Thank you for taking the time to interview" + (!jobTitle.isBlank() ? (" for the \"" + jobTitle + "\" position") : "") + ".\n\n"
                + "We are now reviewing your interview and will be in touch soon with an update on next steps.\n\n"
                + "Best regards,\n"
                + "The HR team";

        try {
            SimpleMailMessage message = new SimpleMailMessage();
            if (fromAddress != null && !fromAddress.isBlank() && !hasCrlf(fromAddress)) {
                message.setFrom(fromAddress);
            }
            message.setTo(to);

            String[] ccList = parseRecipients(recruitmentCc);
            if (ccList.length > 0) {
                message.setCc(ccList);
            }

            message.setSubject(subject);
            message.setText(body);

            mailSender.send(message);
            log.info("Interview completed email sent to {} (cc={}, interviewId={})", to, ccList.length, interview.getId());
        } catch (Exception e) {
            // On ne bloque pas la mise à jour du statut si l'email échoue.
            log.warn("Failed to send interview completed email to {} (interviewId={}). Cause: {}",
                    to, interview.getId(), e.getMessage());
        }
    }

    private static String[] parseRecipients(String raw) {
        if (raw == null) {
            return new String[0];
        }
        String trimmed = raw.trim();
        if (trimmed.isEmpty()) {
            return new String[0];
        }

        String[] parts = trimmed.split("[;,]");
        List<String> out = new ArrayList<>();
        for (String p : parts) {
            if (p == null) {
                continue;
            }
            String v = p.trim();
            if (v.isEmpty()) {
                continue;
            }
            if (hasCrlf(v)) {
                continue;
            }
            out.add(v);
        }
        return out.toArray(new String[0]);
    }

    private static boolean hasCrlf(String value) {
        return value != null && (value.contains("\r") || value.contains("\n"));
    }

    private static String stripCrlf(String value) {
        if (value == null) {
            return null;
        }
        return value.replace("\r", "").replace("\n", "");
    }
}

package tn.esprit.backend.services;

import com.lowagie.text.*;
import com.lowagie.text.Font;
import com.lowagie.text.Image;
import com.lowagie.text.Rectangle;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import lombok.extern.slf4j.Slf4j;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import tn.esprit.backend.entities.Absence;
import tn.esprit.backend.entities.Company;
import tn.esprit.backend.entities.Contract;
import tn.esprit.backend.entities.Payment;
import tn.esprit.backend.entities.Personnel;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * Génère les documents RH au format PDF : bulletin de paie, contrat de travail
 * et attestation de travail, à partir des entités du domaine ({@link Payment},
 * {@link Personnel}, {@link Contract}, {@link Company}).
 */
@Service
@Slf4j
public class PdfService {

    private static final Path UPLOADS_ROOT = Paths.get("uploads");

    public byte[] generateFichePaie(Payment payment) {
        if (payment == null) {
            throw new IllegalArgumentException("Cannot generate a PDF from a null payment");
        }

        Personnel personnel = payment.getPersonnel();
        Contract contract = payment.getContrat();
        Company company = resolveCompany(payment, personnel);

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Document document = new Document(PageSize.A4, 30, 30, 30, 30);

        try {
            PdfWriter.getInstance(document, out);
            document.open();

            Font companyFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 14, Color.BLACK);
            Font titleFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 12, Color.BLACK);
            Font boldFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 9);
            Font normalFont = FontFactory.getFont(FontFactory.HELVETICA, 9);
            Font headerFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 9, Color.BLACK);

            Color borderColor = new Color(180, 180, 180);
            Color headerBg = new Color(235, 235, 235);
            Color lightGray = new Color(250, 250, 250);

            // 1. EN-TÊTE SOCIÉTÉ
            PdfPTable headerTable = new PdfPTable(new float[]{2, 1.2f});
            headerTable.setWidthPercentage(100);

            PdfPCell leftHeader = new PdfPCell();
            leftHeader.setBorder(Rectangle.NO_BORDER);
            leftHeader.addElement(new Paragraph(safe(company.getCompanyName()), companyFont));
            leftHeader.addElement(new Paragraph(orNA(company.getAddress()), normalFont));
            leftHeader.addElement(new Paragraph("MF: " + orNA(company.getFiscalNumber()), normalFont));
            headerTable.addCell(leftHeader);

            PdfPCell rightHeader = new PdfPCell();
            rightHeader.setBorder(Rectangle.NO_BORDER);
            rightHeader.setHorizontalAlignment(Element.ALIGN_RIGHT);
            Paragraph titlePara = new Paragraph("BULLETIN DE PAIE", titleFont);
            titlePara.setAlignment(Element.ALIGN_RIGHT);
            rightHeader.addElement(titlePara);
            rightHeader.addElement(new Paragraph("Période: " + payment.getMonth() + " " + payment.getYear(), boldFont));
            headerTable.addCell(rightHeader);

            document.add(headerTable);
            document.add(new Chunk("\n"));

            // 2. BLOC EMPLOYÉ
            PdfPTable empTable = new PdfPTable(new float[]{1.5f, 2.5f, 1.5f, 2.5f});
            empTable.setWidthPercentage(100);

            addLabelValue(empTable, "Matricule", personnel != null ? personnel.getMatricule() : null, boldFont, normalFont, borderColor);
            addLabelValue(empTable, "Nom & Prénom", fullName(personnel), boldFont, normalFont, borderColor);
            addLabelValue(empTable, "C.I.N", personnel != null ? personnel.getCin() : null, boldFont, normalFont, borderColor);
            addLabelValue(empTable, "RIB", personnel != null ? personnel.getRib() : null, boldFont, normalFont, borderColor);

            document.add(empTable);

            // 3. TABLEAU RUBRIQUES
            PdfPTable mainTable = new PdfPTable(new float[]{3.5f, 1.2f, 1f, 1f, 1.5f, 1.5f});
            mainTable.setWidthPercentage(100);
            mainTable.setSpacingBefore(10);

            String[] colHeaders = {"Rubrique", "Base", "Taux %", "Nombre", "Gains", "Retenues"};
            for (String h : colHeaders) {
                PdfPCell hCell = new PdfPCell(new Phrase(h, headerFont));
                hCell.setBackgroundColor(headerBg);
                hCell.setPadding(5);
                hCell.setHorizontalAlignment(Element.ALIGN_CENTER);
                mainTable.addCell(hCell);
            }

            double salaireBase = (contract != null && contract.getSalaireBase() != null) ? contract.getSalaireBase() : 0;
            double avantages = (contract != null && contract.getAvantages() != null) ? contract.getAvantages() : 0;
            int workingDays = 22;
            double dailyRate = salaireBase / workingDays;

            List<Absence> periodAbsences = payment.getAbsences();
            int totalAbsenceDays = 0;
            int nonJustifiedDays = 0;
            if (periodAbsences != null) {
                for (Absence absence : periodAbsences) {
                    int days = absenceDays(absence);
                    totalAbsenceDays += days;
                    if (absence.getJustification() == null || absence.getJustification().isBlank()) {
                        nonJustifiedDays += days;
                    }
                }
            }
            long payableDays = Math.max(workingDays - totalAbsenceDays, 0);

            addPayRow(mainTable, "Salaire de base", fmt(dailyRate), "", String.valueOf(payableDays), fmt(salaireBase), "", normalFont, Color.WHITE, borderColor);

            if (avantages > 0) {
                addPayRow(mainTable, "Avantages", "", "", "", fmt(avantages), "", normalFont, Color.WHITE, borderColor);
            }

            double salaireBrutCotisable = salaireBase + avantages;
            addPayRow(mainTable, "SALAIRE BRUT COTISABLE", "", "", "", fmt(salaireBrutCotisable), "", boldFont, headerBg, borderColor);

            if (totalAbsenceDays > 0) {
                addPayRow(mainTable, "Absences (" + totalAbsenceDays + " jours)", "", "", String.valueOf(totalAbsenceDays), "", "", normalFont, lightGray, borderColor);
            }

            double deductionAbsence = dailyRate * nonJustifiedDays;
            if (nonJustifiedDays > 0) {
                addPayRow(mainTable, "Déduction absences non justifiées (" + nonJustifiedDays + " jours)",
                        fmt(dailyRate), "", String.valueOf(nonJustifiedDays), "", fmt(deductionAbsence), normalFont, lightGray, borderColor);
            }

            double montantCnss = payment.getMontantCnss() != null ? payment.getMontantCnss() : 0;
            if (montantCnss > 0) {
                addPayRow(mainTable, "Cotisation CNSS Employé", fmt(salaireBrutCotisable), "9.18", "", "", fmt(montantCnss), normalFont, Color.WHITE, borderColor);
            }

            double montantIrpp = payment.getMontantIrpp() != null ? payment.getMontantIrpp() : 0;
            if (montantIrpp > 0) {
                addPayRow(mainTable, "I.R.P.P", fmt(salaireBrutCotisable - deductionAbsence), "", "", "", fmt(montantIrpp), normalFont, lightGray, borderColor);
            }

            document.add(mainTable);

            // 4. PIED DE PAGE
            PdfPTable footerTable = new PdfPTable(new float[]{4f, 2f});
            footerTable.setWidthPercentage(100);
            footerTable.setSpacingBefore(10);

            PdfPCell payInfo = new PdfPCell();
            payInfo.setBorder(Rectangle.BOX);
            payInfo.setPadding(8);
            payInfo.addElement(new Paragraph("Mode de paiement : VIREMENT", boldFont));
            payInfo.addElement(new Paragraph("RIB : " + orNA(personnel != null ? personnel.getRib() : null), normalFont));
            footerTable.addCell(payInfo);

            PdfPCell netCell = new PdfPCell();
            netCell.setBackgroundColor(headerBg);
            netCell.setVerticalAlignment(Element.ALIGN_MIDDLE);
            Paragraph netP = new Paragraph("Salaire Net  ", boldFont);
            double netToPay = payment.getPayed() != null
                    ? payment.getPayed()
                    : (salaireBrutCotisable - deductionAbsence - montantCnss - montantIrpp);
            Paragraph netV = new Paragraph(fmt(netToPay) + " TND", titleFont);
            netP.setAlignment(Element.ALIGN_CENTER);
            netV.setAlignment(Element.ALIGN_CENTER);
            netCell.addElement(netP);
            netCell.addElement(netV);
            footerTable.addCell(netCell);

            document.add(footerTable);

            addSignatureBlock(document, company);

        } catch (Exception e) {
            log.error("Erreur lors de la génération de la fiche de paie: ", e);
            failDocument(document, e);
        } finally {
            closeIfOpen(document);
        }
        return out.toByteArray();
    }

    public byte[] generateContratTravail(Personnel personnel) {
        if (personnel == null) {
            throw new IllegalArgumentException("Personnel is null");
        }
        Contract contract = personnel.getContract();
        if (contract == null) {
            throw new IllegalStateException("No contract found for this personnel record");
        }
        Company company = resolveCompany(null, personnel);

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Document document = new Document(PageSize.A4, 40, 40, 40, 40);

        try {
            PdfWriter.getInstance(document, out);
            document.open();

            Font titleFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 13, Color.BLACK);
            Font sectionFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 11, Color.BLACK);
            Font boldFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 10, Color.BLACK);
            Font normalFont = FontFactory.getFont(FontFactory.HELVETICA, 10, Color.BLACK);

            Paragraph title = new Paragraph("CONTRAT DE TRAVAIL", titleFont);
            title.setAlignment(Element.ALIGN_CENTER);
            document.add(title);
            document.add(new Chunk("\n"));

            document.add(new Paragraph("Entre les soussignés :", boldFont));
            document.add(new Chunk("\n"));

            document.add(new Paragraph("La société :", sectionFont));
            document.add(new Paragraph(safe(company.getCompanyName()), normalFont));
            document.add(new Paragraph("Adresse : " + orNA(company.getAddress()), normalFont));
            document.add(new Paragraph("Représentée par : Le Responsable des Ressources Humaines", normalFont));
            document.add(new Chunk("\n"));
            document.add(new Paragraph("Ci-après dénommée \"l'Employeur\"", boldFont));
            document.add(new Chunk("\n"));

            document.add(new Paragraph("ET", sectionFont));
            document.add(new Chunk("\n"));

            document.add(new Paragraph("Monsieur/Madame :", sectionFont));
            document.add(new Paragraph(orNA(fullName(personnel)), normalFont));
            document.add(new Paragraph("Numéro CIN : " + orNA(personnel.getCin()), normalFont));
            document.add(new Chunk("\n"));
            document.add(new Paragraph("Ci-après dénommé(e) \"le Salarié\"", boldFont));

            document.add(new Chunk("\n"));
            addDividerLine(document);
            document.add(new Chunk("\n"));

            document.add(new Paragraph("Article 1 : Objet du contrat", sectionFont));
            {
                Phrase ph = new Phrase();
                ph.add(new Chunk(
                        "Le présent contrat a pour objet de définir les conditions dans lesquelles le salarié est recruté en qualité de ",
                        normalFont));
                ph.add(new Chunk(orNA(contract.getWork()), boldFont));
                ph.add(new Chunk(".", normalFont));
                document.add(new Paragraph(ph));
            }

            document.add(new Chunk("\n"));
            addDividerLine(document);
            document.add(new Chunk("\n"));

            document.add(new Paragraph("Article 2 : Nature et durée du contrat", sectionFont));
            document.add(new Paragraph("Type de contrat : " + orNA(contract.getTypeContrat() != null ? contract.getTypeContrat().name() : null), normalFont));
            document.add(new Paragraph("Le présent contrat prend effet à compter du " + formatDate(contract.getDateDebut())
                    + (contract.getDateFin() != null ? " jusqu'au " + formatDate(contract.getDateFin()) : "") + ".", normalFont));

            document.add(new Chunk("\n"));
            addDividerLine(document);
            document.add(new Chunk("\n"));

            document.add(new Paragraph("Article 3 : Lieu de travail", sectionFont));
            document.add(new Paragraph("Le salarié exercera ses fonctions à :", normalFont));
            document.add(new Paragraph(orNA(company.getAddress()), normalFont));

            document.add(new Chunk("\n"));
            addDividerLine(document);
            document.add(new Chunk("\n"));

            document.add(new Paragraph("Article 4 : Rémunération", sectionFont));
            String salaire = (contract.getSalaireBase() != null) ? (fmtMoney(contract.getSalaireBase()) + " TND") : "Non renseigné";
            String primes = (contract.getAvantages() != null) ? (fmtMoney(contract.getAvantages()) + " TND") : "0,000 TND";
            {
                Phrase ph = new Phrase();
                ph.add(new Chunk("En contrepartie de son travail, le salarié percevra un salaire mensuel brut de : ", normalFont));
                ph.add(new Chunk(salaire, boldFont));
                ph.add(new Chunk(", payable à la fin de chaque mois.", normalFont));
                document.add(new Paragraph(ph));
                Phrase ph2 = new Phrase();
                ph2.add(new Chunk("Le salarié percevra en outre des avantages d'un montant de : ", normalFont));
                ph2.add(new Chunk(primes, boldFont));
                document.add(new Paragraph(ph2));
            }

            document.add(new Chunk("\n"));
            addDividerLine(document);
            document.add(new Chunk("\n"));

            document.add(new Paragraph("Article 5 : Temps de travail", sectionFont));
            {
                Phrase ph = new Phrase();
                ph.add(new Chunk("La durée de travail est fixée à ", normalFont));
                ph.add(new Chunk("48", boldFont));
                ph.add(new Chunk(" heures par semaine, conformément à la législation en vigueur.", normalFont));
                document.add(new Paragraph(ph));
            }

            document.add(new Chunk("\n"));
            addDividerLine(document);
            document.add(new Chunk("\n"));

            document.add(new Paragraph("Article 6 : Congés", sectionFont));
            document.add(new Paragraph("Le salarié bénéficie de congés payés conformément à la législation tunisienne.", normalFont));

            document.add(new Chunk("\n"));
            addDividerLine(document);
            document.add(new Chunk("\n"));

            document.add(new Paragraph("Article 7 : Obligations du salarié", sectionFont));
            document.add(new Paragraph("Le salarié s'engage à :", normalFont));
            com.lowagie.text.List list = new com.lowagie.text.List(com.lowagie.text.List.UNORDERED);
            list.setListSymbol("• ");
            list.add(new ListItem("Respecter le règlement intérieur", normalFont));
            list.add(new ListItem("Exécuter ses tâches avec sérieux et professionnalisme", normalFont));
            list.add(new ListItem("Garder la confidentialité des informations", normalFont));
            document.add(list);

            document.add(new Chunk("\n"));
            addDividerLine(document);
            document.add(new Chunk("\n"));

            document.add(new Paragraph("Article 8 : Droit applicable", sectionFont));
            document.add(new Paragraph("Le présent contrat est soumis au droit du travail tunisien.", normalFont));

            document.add(new Chunk("\n"));
            addDividerLine(document);
            document.add(new Chunk("\n"));

            document.add(new Paragraph("Article 9 : Résiliation", sectionFont));
            document.add(new Paragraph("Le contrat peut être résilié par l'une ou l'autre des parties dans le respect des dispositions légales.", normalFont));

            document.add(new Chunk("\n"));
            addDividerLine(document);
            document.add(new Chunk("\n"));

            document.add(new Paragraph(
                    "Fait à " + defaultCity() + ", le " + LocalDate.now().format(DateTimeFormatter.ofPattern("dd/MM/yyyy")),
                    normalFont));

            document.add(new Chunk("\n"));
            addContractSignaturesBlock(document, company, normalFont, boldFont);

        } catch (Exception e) {
            log.error("Erreur génération contrat PDF", e);
            failDocument(document, e);
        } finally {
            closeIfOpen(document);
        }

        return out.toByteArray();
    }

    public byte[] generateAttestationTravail(Personnel personnel) {
        if (personnel == null) {
            throw new IllegalArgumentException("Personnel is null");
        }
        Company company = resolveCompany(null, personnel);
        Contract contract = personnel.getContract();

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Document document = new Document(PageSize.A4, 50, 50, 60, 60);

        try {
            PdfWriter.getInstance(document, out);
            document.open();

            Font titleFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 13, Color.BLACK);
            Font sectionFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 11, Color.BLACK);
            Font normalFont = FontFactory.getFont(FontFactory.HELVETICA, 11, Color.BLACK);
            Font boldFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 11, Color.BLACK);

            Paragraph title = new Paragraph("ATTESTATION DE TRAVAIL", titleFont);
            title.setAlignment(Element.ALIGN_CENTER);
            document.add(title);
            document.add(new Chunk("\n"));

            document.add(new Paragraph("Je soussigné(e),", normalFont));
            document.add(new Paragraph("Responsable des Ressources Humaines,", boldFont));
            document.add(new Paragraph("au sein de la société " + safe(company.getCompanyName()) + ",", normalFont));
            document.add(new Chunk("\n"));
            document.add(new Paragraph("atteste que :", sectionFont));
            document.add(new Chunk("\n"));

            String fullName = orNA(fullName(personnel));
            String cin = orNA(personnel.getCin());
            String role = (contract != null) ? orNA(contract.getWork()) : "Non renseigné";

            String debut = (contract != null) ? formatDate(contract.getDateDebut()) : "Non renseigné";
            String periode;
            if (contract != null && contract.getDateDebut() != null) {
                if (contract.getDateFin() != null) {
                    periode = "du " + debut + " au " + formatDate(contract.getDateFin());
                } else {
                    periode = "depuis le " + debut + " jusqu'à ce jour";
                }
            } else {
                periode = "Non renseigné";
            }

            document.add(new Paragraph(
                    "Monsieur/Madame " + fullName + ", titulaire de la CIN n° " + cin + ",",
                    normalFont));
            {
                Phrase ph = new Phrase();
                ph.add(new Chunk("a été employé(e) dans notre société en qualité de ", normalFont));
                ph.add(new Chunk(role, boldFont));
                ph.add(new Chunk(",", normalFont));
                document.add(new Paragraph(ph));
            }
            document.add(new Chunk("\n"));
            document.add(new Paragraph(periode + ".", normalFont));
            document.add(new Chunk("\n"));
            document.add(new Paragraph("Durant cette période, l'intéressé(e) a fait preuve de sérieux, de compétence et de professionnalisme.", normalFont));
            document.add(new Chunk("\n"));
            document.add(new Paragraph("La présente attestation est délivrée à l'intéressé(e) pour servir et valoir ce que de droit.", normalFont));
            document.add(new Chunk("\n"));
            document.add(new Paragraph(
                    "Fait à " + defaultCity() + ", le " + LocalDate.now().format(DateTimeFormatter.ofPattern("dd/MM/yyyy")),
                    normalFont));

            document.add(new Chunk("\n"));
            addAttestationSignatureBlock(document, company);

        } catch (Exception e) {
            log.error("Erreur génération attestation PDF", e);
            failDocument(document, e);
        } finally {
            closeIfOpen(document);
        }

        return out.toByteArray();
    }

    public String extractTextFromPdf(MultipartFile pdfFile) throws IOException {
        if (pdfFile == null || pdfFile.isEmpty()) {
            throw new IllegalArgumentException("The PDF file cannot be empty");
        }
        return extractTextFromPdfBytes(pdfFile.getBytes());
    }

    public String extractTextFromPdfBytes(byte[] pdfBytes) throws IOException {
        if (pdfBytes == null || pdfBytes.length == 0) {
            throw new IllegalArgumentException("The PDF content cannot be empty");
        }
        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            PDFTextStripper stripper = new PDFTextStripper();
            String text = stripper.getText(document);
            log.info("Texte extrait du PDF - {} caractères", text.length());
            return text;
        } catch (IOException e) {
            log.error("Erreur lors de l'extraction du texte du PDF", e);
            throw new IOException("Impossible d'extraire le texte du PDF", e);
        }
    }

    // ==================== Méthodes privées ====================

    private Company resolveCompany(Payment payment, Personnel personnel) {
        Company company = null;
        if (payment != null && payment.getCompany() != null) {
            company = payment.getCompany();
        } else if (personnel != null && personnel.getUser() != null) {
            company = personnel.getUser().getCompany();
        }
        if (company != null) {
            return company;
        }
        Company defaults = new Company();
        defaults.setCompanyName("Société non renseignée");
        defaults.setAddress("Adresse non renseignée");
        defaults.setFiscalNumber("Non renseigné");
        return defaults;
    }

    private String fullName(Personnel personnel) {
        if (personnel == null || personnel.getUser() == null) {
            return null;
        }
        String name = (safe(personnel.getUser().getFirstname()) + " " + safe(personnel.getUser().getLastname())).trim();
        return name.isEmpty() ? null : name;
    }

    private int absenceDays(Absence absence) {
        if (absence.getStartDate() != null && absence.getEndDate() != null) {
            long days = java.time.temporal.ChronoUnit.DAYS.between(absence.getStartDate(), absence.getEndDate()) + 1;
            return (int) Math.max(days, 1);
        }
        return absence.getDateAbsence() != null ? 1 : 0;
    }

    private void addSignatureBlock(Document document, Company company) {
        try {
            String fileName = company != null ? company.getSignatureFileName() : null;
            Path signaturePath = resolveUploadPath(fileName);
            if (signaturePath == null) return;

            document.add(new Chunk("\n"));

            PdfPTable sigTable = new PdfPTable(new float[]{3f, 2f});
            sigTable.setWidthPercentage(100);

            PdfPCell left = new PdfPCell(new Phrase(""));
            left.setBorder(Rectangle.NO_BORDER);
            sigTable.addCell(left);

            PdfPCell right = new PdfPCell();
            right.setBorder(Rectangle.NO_BORDER);
            right.setHorizontalAlignment(Element.ALIGN_RIGHT);

            Paragraph label = new Paragraph("Signature", FontFactory.getFont(FontFactory.HELVETICA_BOLD, 9));
            label.setAlignment(Element.ALIGN_RIGHT);
            right.addElement(label);

            Image img = Image.getInstance(signaturePath.toAbsolutePath().toString());
            img.scaleToFit(140, 70);
            img.setAlignment(Image.ALIGN_RIGHT);
            right.addElement(img);

            sigTable.addCell(right);
            document.add(sigTable);
        } catch (Exception e) {
            log.warn("Impossible d'ajouter la signature au PDF: {}", e.getMessage());
        }
    }

    private void addContractSignaturesBlock(Document document, Company company, Font normalFont, Font boldFont) {
        try {
            PdfPTable table = new PdfPTable(new float[]{1f, 1f});
            table.setWidthPercentage(100);

            PdfPCell employer = new PdfPCell();
            employer.setBorder(Rectangle.NO_BORDER);
            employer.setPadding(6);
            employer.addElement(new Paragraph("Signature de l'employeur", boldFont));
            employer.addElement(new Paragraph("(Signature)", normalFont));
            addSignatureImageToCell(employer, company);
            table.addCell(employer);

            PdfPCell employee = new PdfPCell();
            employee.setBorder(Rectangle.NO_BORDER);
            employee.setPadding(6);
            employee.addElement(new Paragraph("Signature du salarié", boldFont));
            employee.addElement(new Paragraph("(Signature précédée de la mention \"Lu et approuvé\")", normalFont));
            employee.addElement(new Chunk("\n\n\n"));
            employee.addElement(new Paragraph("___________________________", normalFont));
            table.addCell(employee);

            document.add(table);
        } catch (Exception e) {
            log.warn("Impossible d'ajouter le bloc signatures contrat: {}", e.getMessage());
        }
    }

    private void addAttestationSignatureBlock(Document document, Company company) {
        try {
            Paragraph p = new Paragraph("Signature ", FontFactory.getFont(FontFactory.HELVETICA_BOLD, 11));
            p.setAlignment(Element.ALIGN_RIGHT);
            document.add(p);

            String fileName = company != null ? company.getSignatureFileName() : null;
            Path signaturePath = resolveUploadPath(fileName);
            if (signaturePath == null) return;

            Image img = Image.getInstance(signaturePath.toAbsolutePath().toString());
            img.scaleToFit(160, 80);
            img.setAlignment(Image.ALIGN_RIGHT);
            document.add(img);
        } catch (Exception e) {
            log.warn("Impossible d'ajouter le bloc signature attestation: {}", e.getMessage());
        }
    }

    private void addSignatureImageToCell(PdfPCell cell, Company company) {
        try {
            String fileName = company != null ? company.getSignatureFileName() : null;
            Path signaturePath = resolveUploadPath(fileName);
            if (signaturePath == null) return;

            Image img = Image.getInstance(signaturePath.toAbsolutePath().toString());
            img.scaleToFit(140, 70);
            img.setAlignment(Image.ALIGN_LEFT);
            cell.addElement(img);
        } catch (Exception e) {
            log.warn("Impossible d'ajouter image signature au cell: {}", e.getMessage());
        }
    }

    /**
     * Résout un nom de fichier stocké par {@link FileStorageService} vers son chemin sur disque,
     * en ne conservant que le nom de fichier pour empêcher toute traversée de répertoire.
     */
    private Path resolveUploadPath(String fileName) {
        if (fileName == null || fileName.isBlank()) return null;
        String cleanName = Paths.get(fileName).getFileName().toString();
        Path path = UPLOADS_ROOT.resolve(cleanName).normalize();
        if (!path.startsWith(UPLOADS_ROOT) || !Files.exists(path)) {
            return null;
        }
        return path;
    }

    private void addDividerLine(Document document) {
        try {
            PdfPTable t = new PdfPTable(1);
            t.setWidthPercentage(100);
            PdfPCell c = new PdfPCell(new Phrase(""));
            c.setBorder(Rectangle.BOTTOM);
            c.setBorderWidthBottom(0.7f);
            c.setPaddingTop(2);
            c.setPaddingBottom(2);
            c.setBorderColorBottom(new Color(200, 200, 200));
            t.addCell(c);
            document.add(t);
        } catch (Exception ignored) {
        }
    }

    private void failDocument(Document document, Exception e) {
        try {
            if (document.isOpen()) {
                document.add(new Paragraph("Erreur technique lors de la génération: " + e.getMessage()));
            }
        } catch (DocumentException ex) {
            log.error("Impossible d'ajouter le paragraphe d'erreur", ex);
        }
    }

    private void closeIfOpen(Document document) {
        if (document.isOpen()) {
            document.close();
        }
    }

    private String orNA(String s) {
        return (s == null || s.trim().isEmpty()) ? "Non renseigné" : s;
    }

    private String defaultCity() {
        return "Tunis";
    }

    private String safe(String s) {
        return (s == null) ? "" : s;
    }

    private void addLabelValue(PdfPTable table, String label, String value, Font bold, Font normal, Color border) {
        PdfPCell cell = new PdfPCell();
        cell.setPadding(5);
        cell.setBorderColor(border);
        Phrase ph = new Phrase();
        ph.add(new Chunk(label + " : ", bold));
        ph.add(new Chunk(value != null ? value : "", normal));
        cell.setPhrase(ph);
        table.addCell(cell);
    }

    private void addPayRow(PdfPTable table, String desc, String base, String taux, String nb, String gain, String retenue, Font font, Color bg, Color border) {
        PdfPCell cDesc = new PdfPCell(new Phrase(desc, font));
        cDesc.setBackgroundColor(bg);
        cDesc.setBorderColor(border);
        cDesc.setPadding(4);
        table.addCell(cDesc);

        String[] values = {base, taux, nb, gain, retenue};
        for (String v : values) {
            PdfPCell c = new PdfPCell(new Phrase(v != null ? v : "", font));
            c.setBackgroundColor(bg);
            c.setBorderColor(border);
            c.setPadding(4);
            c.setHorizontalAlignment(Element.ALIGN_RIGHT);
            table.addCell(c);
        }
    }

    private String fmt(double v) {
        if (v <= 0) return "";
        return String.format("%.3f", v).replace(".", ",");
    }

    private String fmtMoney(double v) {
        return String.format("%.3f", v).replace(".", ",");
    }

    private String fmtMoney(Double v) {
        if (v == null) return "0,000";
        return fmtMoney(v.doubleValue());
    }

    private String formatDate(LocalDate d) {
        return d != null ? d.format(DateTimeFormatter.ofPattern("dd/MM/yyyy")) : "N/A";
    }
}

// =============================================================================
// Types TypeScript alignés sur les entités / DTO du backend Spring Boot.
//
// Note : la plupart des endpoints renvoient les entités JPA telles quelles, avec
// des objets imbriqués. Les champs marqués optionnels (?) peuvent être absents ou
// null selon le contexte de sérialisation (@JsonIgnore / @JsonBackReference).
// À affiner au besoin en inspectant les payloads réels.
// =============================================================================

// ----------------------------- Enums -----------------------------------------

export type Role = 'ADMIN' | 'COMPANY' | 'EMPLOYE' | 'GUEST';

export type TypeContrat =
  | 'CDI'
  | 'CDD'
  | 'CDD_AI'
  | 'PROJET'
  | 'INTERIM'
  | 'APPRENTISSAGE'
  | 'STAGE'
  | 'CONVENTION';

export type Month =
  | 'JANUARY'
  | 'FEBRUARY'
  | 'MARCH'
  | 'APRIL'
  | 'MAY'
  | 'JUNE'
  | 'JULY'
  | 'AUGUST'
  | 'SEPTEMBER'
  | 'OCTOBER'
  | 'NOVEMBER'
  | 'DECEMBER';

// ------------------------- Auth (DTO) -----------------------------------------

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  firstname: string;
  lastname: string;
  email: string;
  password: string;
  role: Role;
  // Champs entreprise (obligatoires uniquement si role === 'COMPANY')
  companyName?: string;
  fiscalNumber?: string;
  cnssNumber?: string;
  rib?: string;
  // Champs entreprise optionnels
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  // Abonnement plateforme + paiement simulé (COMPANY uniquement) — voir
  // SubscriptionPlan / PaymentSimulatorService côté backend. Aucune vraie charge n'a lieu.
  subscriptionPlan?: string;
  cardHolder?: string;
  cardNumber?: string;
  cardExpiry?: string;
  cardCvv?: string;
  // Avatar utilisateur
  img?: string;
}

// GET /api/auth/subscription-plans — public catalog shown on company registration.
export interface SubscriptionPlan {
  code: string;
  label: string;
  monthlyPrice: number;
  description: string;
}

// GET /api/companies/{id}/subscription — the company's active platform subscription,
// created at registration (see PaymentSimulatorService). No card number, only last 4 digits.
export interface Subscription {
  id: number;
  companyId?: number;
  plan: string;
  amount: number;
  currency: string;
  status: string;
  cardLast4?: string;
  transactionRef?: string;
  paidAt?: string;
  periodEnd?: string;
}

// PUT /api/companies/{id}/subscription — renews (same plan) or changes plan (different plan);
// either way a new simulated payment is made (see PaymentSimulatorService).
export interface SubscriptionPaymentRequest {
  plan: string;
  cardHolder: string;
  cardNumber: string;
  cardExpiry: string;
  cardCvv: string;
}

export interface AuthResponse {
  token: string;
  idUser: number;
  firstname: string;
  lastname: string;
  email: string;
  role: Role;
  companyId: number | null;
  img: string | null;
}

// Response of POST /api/auth/login. COMPANY/ADMIN accounts require a follow-up
// verify-otp call before `auth` is populated (see VerifyOtpRequest/ResendOtpRequest).
export interface LoginResponse {
  mfaRequired: boolean;
  maskedEmail: string | null;
  auth: AuthResponse | null;
}

export interface VerifyOtpRequest {
  email: string;
  code: string;
}

export interface ResendOtpRequest {
  email: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

// PUT /api/account/password — self-service, any authenticated role.
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// ------------------------- Entités --------------------------------------------

export interface Company {
  idCompany: number;
  companyName: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  logoUrl?: string;
  fiscalNumber: string;
  cnssNumber: string;
  signatureFileName?: string;
  rib: string;
  verified: boolean;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// PUT /api/companies/{id} — companyName/fiscalNumber/cnssNumber/rib mirror the entity's
// NOT NULL constraints (verified/active are admin-only, changed via separate endpoints).
export interface CompanyUpdateRequest {
  companyName: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  logoUrl?: string;
  fiscalNumber: string;
  cnssNumber: string;
  signatureFileName?: string;
  rib: string;
}

export interface User {
  idUser: number;
  firstname: string;
  lastname: string;
  email: string;
  role: Role;
  enabled: boolean;
  img?: string;
  company?: Company;
}

export interface Contract {
  idContract: number;
  work?: string;
  typeContrat?: TypeContrat;
  dateDebut?: string;
  dateFin?: string;
  categorie?: string;
  echelon?: number;
  salaireBase?: number;
  salaireComplementaire?: number;
  tauxHoraireSup?: number;
  avantages?: number;
  // Never populated on read (Contract.personnel is a JsonBackReference) — the link is
  // only ever sent, never received, and only on create (see ContractCreateRequest).
  personnel?: Personnel;
}

// POST /api/contracts — categorie and dateDebut are required (salaireBase/echelon are
// always server-derived from the salary grid, never accepted from the client).
export interface ContractCreateRequest {
  work?: string;
  typeContrat?: TypeContrat;
  dateDebut: string;
  dateFin?: string;
  categorie: string;
  salaireComplementaire?: number;
  tauxHoraireSup?: number;
  avantages?: number;
  personnel: { idPersonnel: number };
}

// PUT /api/contracts/{id} — personnel re-assignment isn't supported by this endpoint.
export interface ContractUpdateRequest {
  work?: string;
  typeContrat?: TypeContrat;
  dateDebut: string;
  dateFin?: string;
  categorie: string;
  salaireComplementaire?: number;
  tauxHoraireSup?: number;
  avantages?: number;
}

export interface Personnel {
  idPersonnel: number;
  telephone?: string;
  cin: string;
  matricule?: string;
  cnssNumber: string;
  rib: string;
  image?: string;
  user?: User;
  contract?: Contract;
  absences?: Absence[];
}

// POST /api/personnel/employee — creates the EMPLOYE user account and the
// Personnel record in one call (there is no other way to provision an employee).
export interface PersonnelCreateRequest {
  firstname: string;
  lastname: string;
  email: string;
  password: string;
  telephone?: string;
  cin: string;
  cnssNumber: string;
  rib: string;
  /** Required for ADMIN callers only; COMPANY callers are attached to their own company. */
  companyId?: number;
}

// PUT /api/personnel/{id} — only these fields are actually persisted server-side.
// matricule is never accepted here: it's auto-generated on the employee's first contract
// (see ContractService.assignMatriculeIfMissing) and stays stable afterwards.
export interface PersonnelUpdateRequest {
  telephone?: string;
  cin: string;
  cnssNumber: string;
  rib: string;
  image?: string;
  user: { idUser: number };
}

// PUT /api/personnel/me — self-service (EMPLOYE): only phone/RIB are editable this way;
// administrative identifiers (cin, matricule, cnssNumber) stay company/admin-controlled.
export interface PersonnelSelfUpdateRequest {
  telephone?: string;
  rib: string;
}

export interface Absence {
  idAbsence: number;
  dateAbsence?: string;
  startDate?: string;
  endDate?: string;
  reason?: string;
  /** Stored filename of the uploaded justification document, if any — see absencesApi.uploadJustification/downloadJustification. */
  justification?: string;
  personnel?: Personnel;
  payment?: Payment;
}

// POST /api/absences — either a single dateAbsence, or a startDate/endDate range.
// The justification is uploaded separately afterwards via absencesApi.uploadJustification.
export interface AbsenceCreateRequest {
  dateAbsence?: string;
  startDate?: string;
  endDate?: string;
  reason?: string;
  personnel: { idPersonnel: number };
}

// PUT /api/absences/{id}
export interface AbsenceUpdateRequest {
  dateAbsence?: string;
  startDate?: string;
  endDate?: string;
  reason?: string;
}

export interface Payment {
  id: number;
  paymentDate?: string;
  month?: Month;
  year: number;
  absences?: Absence[];
  montantCnss?: number;
  montantIrpp?: number;
  status?: string;
  payed?: number;
  company?: Company;
  personnel?: Personnel;
  contrat?: Contract;
}

// POST /api/payments — no field is server-computed here (unlike Contract's salaireBase);
// personnel/contrat/company are all owning-side FKs on Payment so nested {id} refs persist
// correctly. `absences` is intentionally omitted: linking absences to a payment has no
// working backend path today (Payment owns the inverse/read-only side of that relation).
export interface PaymentCreateRequest {
  paymentDate?: string;
  month?: Month;
  year: number;
  montantCnss?: number;
  montantIrpp?: number;
  status?: string;
  payed?: number;
  personnel?: { idPersonnel: number };
  contrat?: { idContract: number };
  company?: { idCompany: number };
}

// PUT /api/payments/{id} — same shape as create.
export type PaymentUpdateRequest = PaymentCreateRequest;

// POST /api/payments/generate — bulk-creates DRAFT payments (CNSS/IRPP/net all
// server-computed, see SalaryCalculationService) for every staff member with an active
// contract that month. companyId is required for ADMIN (who has no own company), ignored
// for COMPANY (always scoped to their own company server-side).
export interface PayrollGenerationSummary {
  created: Payment[];
  alreadyGenerated: number;
  skippedNoActiveContract: number;
}

// JobPosting.applications/interviews are never serialized (@JsonIgnore on the backend, to
// break the JSON cycle) — use applicationsApi.listByJob()/interviewsApi.listByJob() instead.
export interface JobPosting {
  id: number;
  title?: string;
  description?: string;
  department?: string;
  requiredSkills?: string[];
  jobType?: TypeContrat;
  datePosted?: string;
  deadline?: string;
  status?: string;
  createdByCompany?: Company;
}

// POST /api/job — status and datePosted are always server-set ("OPEN" / now()), never
// accepted from the client. COMPANY callers are auto-attached to their own company;
// only ADMIN needs to supply createdByCompany explicitly.
export interface JobPostingCreateRequest {
  title?: string;
  description?: string;
  department?: string;
  requiredSkills?: string[];
  jobType?: TypeContrat;
  deadline?: string;
  createdByCompany?: { idCompany: number };
}

// PUT /api/job/{id} — only these fields are actually persisted server-side (status is
// changed separately via PATCH /api/job/{id}/status).
export interface JobPostingUpdateRequest {
  title?: string;
  description?: string;
  department?: string;
  requiredSkills?: string[];
  jobType?: TypeContrat;
  deadline?: string;
}

// Projection publique d'une offre (endpoint GET /api/job/public, sans authentification).
export interface PublicJobResponse {
  id: number;
  title?: string;
  description?: string;
  department?: string;
  requiredSkills?: string[];
  jobType?: TypeContrat;
  datePosted?: string;
  deadline?: string;
  companyName?: string;
}

// Candidate.applications/interviews are never serialized (@JsonIgnore on the backend,
// to break the JSON cycle) — use applicationsApi.listByCandidate()/interviewsApi.listByCandidate().
export interface Candidate {
  id: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  cin?: string;
  dateOfBirth?: string;
  yearsOfExperience?: number;
  cvFileId?: string;
  registrationDate?: string;
  user?: User;
}

// POST /api/candidate — a GUEST's own `user` link is always server-set from the
// authenticated caller; never send a `user` field from a self-service form.
export interface CandidateCreateRequest {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  cin?: string;
  dateOfBirth?: string;
  yearsOfExperience?: number;
}

// PUT /api/candidate/{id} — only these fields are actually persisted server-side.
export interface CandidateUpdateRequest {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  cin?: string;
  dateOfBirth?: string;
  yearsOfExperience?: number;
  cvFileId?: string;
}

export type ApplicationStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'SHORTLISTED' | 'ACCEPTED' | 'REJECTED';

// Application.interviews is never serialized (@JsonIgnore, breaks the JSON cycle) —
// use interviewsApi.listByApplication() instead.
export interface Application {
  id: number;
  candidate?: Candidate;
  jobPosting?: JobPosting;
  status?: ApplicationStatus | string;
  coverLetter?: string;
  aiScore?: number;
  aiFeedback?: string;
  evaluatedAt?: string;
  appliedDate?: string;
  interviewDate?: string;
  interviewLocation?: string;
}

export type InterviewStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';

export interface Interview {
  id: number;
  candidate?: Candidate;
  application?: Application;
  job?: JobPosting;
  interviewDate?: string;
  interviewLocation?: string;
  status?: InterviewStatus | string;
  createdAt?: string;
}

// GET /api/absences/quota/{personnelId} — AbsenceQuotaCalculator.QuotaSnapshot.
export interface QuotaSnapshot {
  monthlyQuotaDays: number;
  carriedOverDays: number;
  earnedDaysThisYear: number;
  usedJustifiedDaysThisYear: number;
  remainingDays: number;
  asOfDate: string;
}

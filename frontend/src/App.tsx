import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { Layout } from '@/components/Layout';
import { HomePage } from '@/pages/HomePage';
import { LoginPage } from '@/pages/LoginPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { RegisterChooserPage } from '@/pages/RegisterChooserPage';
import { RegisterCompanyPage } from '@/pages/RegisterCompanyPage';
import { RegisterCandidatePage } from '@/pages/RegisterCandidatePage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { CompaniesPage } from '@/pages/CompaniesPage';
import { PersonnelPage } from '@/pages/PersonnelPage';
import { ContractsPage } from '@/pages/ContractsPage';
import { AttendancePage } from '@/pages/AttendancePage';
import { AbsencesPage } from '@/pages/AbsencesPage';
import { JobPostingsPage } from '@/pages/JobPostingsPage';
import { PayrollPage } from '@/pages/PayrollPage';
import { CandidatesPage } from '@/pages/CandidatesPage';
import { ApplicationsPage } from '@/pages/ApplicationsPage';
import { InterviewsPage } from '@/pages/InterviewsPage';
import { TasksPage } from '@/pages/TasksPage';
import { SkillsPage } from '@/pages/SkillsPage';
import { SkillsValidationPage } from '@/pages/SkillsValidationPage';
import { ReceivedMessagesPage } from '@/pages/ReceivedMessagesPage';
import { ModulePlaceholderPage } from '@/pages/ModulePlaceholderPage';
import { UnauthorizedPage } from '@/pages/UnauthorizedPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { PrivacyPolicyPage } from '@/pages/PrivacyPolicyPage';
import { NAV_ITEMS } from '@/config/navigation';

export function App() {
  // Modules shown in the signed-in bottom nav (dashboard/personnel/contracts/absences/jobs
  // excluded: they have their own explicit route below).
  const moduleItems = NAV_ITEMS.filter(
    (item) =>
      ![
        '/dashboard',
        '/companies',
        '/personnel',
        '/contracts',
        '/attendance',
        '/absences',
        '/jobs',
        '/payments',
        '/candidates',
        '/applications',
        '/interviews',
        '/tasks',
        '/messages',
        '/skills',
        '/skills/validation',
      ].includes(item.path),
  );

  return (
    <Routes>
      {/* Public showcase */}
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/register" element={<RegisterChooserPage />} />
      <Route path="/register/company" element={<RegisterCompanyPage />} />
      <Route path="/register/candidate" element={<RegisterCandidatePage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />

      {/* Signed-in area (session required) */}
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          {/* Profil = self-service de compte (ex: changer son mot de passe), reste ouvert à
              tous les rôles y compris ADMIN, même si ADMIN est sinon cantonné au Dashboard. */}
          <Route path="/profile" element={<ProfilePage />} />

          {/* ADMIN n'a accès qu'aux modules plateforme (Companies ci-dessous) : un accès direct
              par URL à un module opérationnel d'entreprise (ex: /jobs) redirige ADMIN vers
              /unauthorized comme n'importe quel rôle non autorisé. */}
          <Route element={<ProtectedRoute allowedRoles={['COMPANY', 'EMPLOYE', 'GUEST']} />}>
            <Route path="/jobs" element={<JobPostingsPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
            <Route path="/companies" element={<CompaniesPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['COMPANY']} />}>
            <Route path="/personnel" element={<PersonnelPage />} />
            <Route path="/contracts" element={<ContractsPage />} />
            <Route path="/attendance" element={<AttendancePage />} />
            <Route path="/messages" element={<ReceivedMessagesPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['COMPANY', 'EMPLOYE']} />}>
            <Route path="/absences" element={<AbsencesPage />} />
            <Route path="/payments" element={<PayrollPage />} />
            <Route path="/tasks" element={<TasksPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['EMPLOYE']} />}>
            <Route path="/skills" element={<SkillsPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['COMPANY']} />}>
            <Route path="/skills/validation" element={<SkillsValidationPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['GUEST']} />}>
            <Route path="/candidates" element={<CandidatesPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['COMPANY', 'GUEST']} />}>
            <Route path="/applications" element={<ApplicationsPage />} />
            <Route path="/interviews" element={<InterviewsPage />} />
          </Route>

          {moduleItems.map((item) => (
            <Route key={item.path} element={<ProtectedRoute allowedRoles={item.roles} />}>
              <Route
                path={item.path}
                element={<ModulePlaceholderPage title={item.label} icon={item.icon} />}
              />
            </Route>
          ))}
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

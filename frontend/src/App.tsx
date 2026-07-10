import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { Layout } from '@/components/Layout';
import { HomePage } from '@/pages/HomePage';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterChooserPage } from '@/pages/RegisterChooserPage';
import { RegisterCompanyPage } from '@/pages/RegisterCompanyPage';
import { RegisterCandidatePage } from '@/pages/RegisterCandidatePage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { CompaniesPage } from '@/pages/CompaniesPage';
import { PersonnelPage } from '@/pages/PersonnelPage';
import { ContractsPage } from '@/pages/ContractsPage';
import { AbsencesPage } from '@/pages/AbsencesPage';
import { JobPostingsPage } from '@/pages/JobPostingsPage';
import { PayrollPage } from '@/pages/PayrollPage';
import { CandidatesPage } from '@/pages/CandidatesPage';
import { ApplicationsPage } from '@/pages/ApplicationsPage';
import { InterviewsPage } from '@/pages/InterviewsPage';
import { ModulePlaceholderPage } from '@/pages/ModulePlaceholderPage';
import { UnauthorizedPage } from '@/pages/UnauthorizedPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { NAV_ITEMS } from '@/config/navigation';

export function App() {
  // Modules shown in the signed-in sidebar (dashboard/personnel/contracts/absences/jobs
  // excluded: they have their own explicit route below).
  const moduleItems = NAV_ITEMS.filter(
    (item) =>
      ![
        '/dashboard',
        '/companies',
        '/personnel',
        '/contracts',
        '/absences',
        '/jobs',
        '/payments',
        '/candidates',
        '/applications',
        '/interviews',
      ].includes(item.path),
  );

  return (
    <Routes>
      {/* Public showcase */}
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterChooserPage />} />
      <Route path="/register/company" element={<RegisterCompanyPage />} />
      <Route path="/register/candidate" element={<RegisterCandidatePage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      {/* Signed-in area (session required) */}
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/jobs" element={<JobPostingsPage />} />

          <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
            <Route path="/companies" element={<CompaniesPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'COMPANY']} />}>
            <Route path="/personnel" element={<PersonnelPage />} />
            <Route path="/contracts" element={<ContractsPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'COMPANY', 'EMPLOYE']} />}>
            <Route path="/absences" element={<AbsencesPage />} />
            <Route path="/payments" element={<PayrollPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'COMPANY', 'GUEST']} />}>
            <Route path="/candidates" element={<CandidatesPage />} />
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

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Users, CalendarX2, Briefcase } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { navItemsForRole } from '@/config/navigation';
import { personnelApi } from '@/api/personnel';
import { paymentsApi } from '@/api/payments';
import { companiesApi } from '@/api/companies';
import { subscriptionsApi } from '@/api/subscriptions';
import { absencesApi } from '@/api/absences';
import { jobPostingsApi } from '@/api/jobPostings';
import { applicationsApi } from '@/api/applications';
import { interviewsApi } from '@/api/interviews';
import { formatInt, formatTnd, formatDateFr } from '@/lib/format';
import { BarChart, StackedBarChart, type StackedDatum } from '@/components/charts';
import { TableSkeleton } from '@/components/TableSkeleton';
import type { Absence, Interview, Month, Personnel } from '@/types';

const CNSS_RATE = 0.0918; // fixed employee CNSS rate — see PayrollPage.suggestAmounts

const MONTHS: Month[] = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];
const MONTH_SHORT: Record<Month, string> = {
  JANUARY: 'Jan', FEBRUARY: 'Feb', MARCH: 'Mar', APRIL: 'Apr', MAY: 'May', JUNE: 'Jun',
  JULY: 'Jul', AUGUST: 'Aug', SEPTEMBER: 'Sep', OCTOBER: 'Oct', NOVEMBER: 'Nov', DECEMBER: 'Dec',
};

function formatDateTime(v?: string): string {
  return v ? v.replace('T', ' ').slice(0, 16) : '—';
}

export function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;

  if (user.role === 'COMPANY') {
    return <CompanyDashboard firstname={user.firstname} />;
  }

  if (user.role === 'ADMIN') {
    return <AdminDashboard firstname={user.firstname} />;
  }

  // Cartes d'accès rapide : les modules du rôle, hors tableau de bord lui-même.
  const cards = navItemsForRole(user.role).filter((item) => item.path !== '/dashboard');

  return (
    <div className="page">
      <div className="page__header">
        <h1>Hello {user.firstname} 👋</h1>
        <p className="page__subtitle">
          Your personal workspace, with quick access to the modules relevant to your role.
          Use the shortcuts below to manage your day-to-day HR tasks — absences, payslips,
          and open positions — without digging through menus.
        </p>
      </div>

      <div className="card-grid">
        {cards.map((item) => (
          <Link key={item.path} to={item.path} className="module-card">
            <span className="module-card__icon">{item.icon}</span>
            <span className="module-card__label">{item.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function CompanyDashboard({ firstname }: { firstname: string }) {
  const [year, setYear] = useState<number | null>(null);

  const { data: personnelList, isLoading: personnelLoading } = useQuery({
    queryKey: ['personnel'],
    queryFn: personnelApi.list,
  });

  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: paymentsApi.list,
  });

  // Requêtes dédiées aux Quick stats (voir QuickStatsDomains) : absences, offres
  // d'emploi et candidatures/entretiens de l'entreprise. Les query keys sont
  // partagées avec les pages dédiées (Absences/JobPostings/Applications/Interviews)
  // pour réutiliser leur cache au lieu de re-fetcher les mêmes données.
  const { data: absences, isLoading: absencesLoading } = useQuery({
    queryKey: ['absences'],
    queryFn: absencesApi.list,
  });
  const { data: companyJobPostings, isLoading: jobPostingsLoading } = useQuery({
    queryKey: ['job-postings', 'mine'],
    queryFn: jobPostingsApi.myCompanyList,
  });
  const { data: applications, isLoading: applicationsLoading } = useQuery({
    queryKey: ['applications'],
    queryFn: applicationsApi.list,
  });
  const { data: interviews, isLoading: interviewsLoading } = useQuery({
    queryKey: ['interviews'],
    queryFn: interviewsApi.list,
  });
  const quickStatsLoading =
    personnelLoading || absencesLoading || jobPostingsLoading || applicationsLoading || interviewsLoading;

  const years = useMemo(() => {
    const set = new Set((payments ?? []).map((p) => p.year));
    return [...set].sort((a, b) => b - a);
  }, [payments]);

  const selectedYear = year ?? years[0] ?? new Date().getFullYear();

  const yearPayments = useMemo(
    () => (payments ?? []).filter((p) => p.year === selectedYear),
    [payments, selectedYear],
  );

  const totals = useMemo(
    () =>
      yearPayments.reduce(
        (acc, p) => ({
          net: acc.net + (p.payed ?? 0),
          cnss: acc.cnss + (p.montantCnss ?? 0),
          irpp: acc.irpp + (p.montantIrpp ?? 0),
        }),
        { net: 0, cnss: 0, irpp: 0 },
      ),
    [yearPayments],
  );

  const monthlyData: StackedDatum[] = useMemo(
    () =>
      MONTHS.map((m) => {
        const monthPayments = yearPayments.filter((p) => p.month === m);
        return {
          label: MONTH_SHORT[m],
          values: {
            net: monthPayments.reduce((s, p) => s + (p.payed ?? 0), 0),
            cnss: monthPayments.reduce((s, p) => s + (p.montantCnss ?? 0), 0),
            irpp: monthPayments.reduce((s, p) => s + (p.montantIrpp ?? 0), 0),
          },
        };
      }),
    [yearPayments],
  );

  const contractBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    (personnelList ?? []).forEach((p) => {
      const label = p.contract?.typeContrat ? p.contract.typeContrat.replace(/_/g, ' ') : 'Unassigned';
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return [...counts.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [personnelList]);

  const loading = personnelLoading || paymentsLoading;

  return (
    <div className="page">
      <div className="page__header">
        <h1>Hello {firstname} 👋</h1>
        <p className="page__subtitle">
          A real-time snapshot of your company's HR activity: headcount and payroll by role
          and pay grade, absence trends, and recruitment pipeline health. Use it to spot
          issues early and track payroll costs across the year.
        </p>
      </div>

      <div className="stat-grid">
        <StatTile label="Personnel" value={formatInt((personnelList ?? []).length)} />
        <StatTile label={`Net payroll (${selectedYear})`} value={formatTnd(totals.net)} />
        <StatTile label={`CNSS contributions (${(CNSS_RATE * 100).toFixed(2)}%)`} value={formatTnd(totals.cnss)} />
        <StatTile label={`IRPP (${selectedYear})`} value={formatTnd(totals.irpp)} />
      </div>

      {quickStatsLoading && <p className="jobs__status">Loading quick stats…</p>}
      {!quickStatsLoading && (
        <QuickStatsDomains
          personnelList={personnelList}
          absences={absences}
          jobPostingsCount={(companyJobPostings ?? []).length}
          applicationsCount={(applications ?? []).length}
          interviews={interviews}
        />
      )}

      <div className="dashboard-grid">
        <div className="chart-card">
          <h2 className="chart-card__title">Personnel by contract type</h2>
          {!loading && <BarChart data={contractBreakdown} formatValue={formatInt} />}
        </div>

        <div className="chart-card">
          <div className="chart-card__header">
            <h2 className="chart-card__title">Monthly payroll breakdown</h2>
            {years.length > 1 && (
              <select
                className="chart-card__year-select"
                value={selectedYear}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            )}
          </div>
          {!loading && (
            <StackedBarChart
              data={monthlyData}
              series={[
                { key: 'net', label: 'Net pay', color: '#3b5bdb' },
                { key: 'cnss', label: 'CNSS', color: '#1baf7a' },
                { key: 'irpp', label: 'IRPP', color: '#eda100' },
              ]}
              formatValue={(v) => `${Math.round(v)}`}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function planLabel(code: string): string {
  return code.charAt(0) + code.slice(1).toLowerCase();
}

// ============================================================================
// ADMIN: platform-wide overview across every company — délibérément limité aux données
// qui décrivent les entreprises elles-mêmes (nombre, vérification, abonnement/MRR) : pas
// de personnel, pas de masse salariale, pas de détails internes par entreprise (voir
// [[hr-deployment-infra]] côté rôles — ADMIN est cantonné au Dashboard). See
// SubscriptionController for the global subscription endpoint.
// ============================================================================
function AdminDashboard({ firstname }: { firstname: string }) {
  const { data: companies, isLoading: companiesLoading, isError: companiesError } = useQuery({
    queryKey: ['companies'],
    queryFn: companiesApi.list,
  });

  const { data: subscriptions, isLoading: subscriptionsLoading, isError: subscriptionsError } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: subscriptionsApi.list,
  });

  const companiesSectionLoading = companiesLoading || subscriptionsLoading;
  const companiesSectionError = companiesError || subscriptionsError;
  const chartsLoading = subscriptionsLoading;
  const chartsError = subscriptionsError;

  const activeSubscriptions = useMemo(
    () => (subscriptions ?? []).filter((s) => s.status === 'ACTIVE'),
    [subscriptions],
  );

  const mrr = useMemo(() => activeSubscriptions.reduce((sum, s) => sum + s.amount, 0), [activeSubscriptions]);

  const planBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    activeSubscriptions.forEach((s) => {
      const label = planLabel(s.plan);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [activeSubscriptions]);

  // Nombre d'entreprises vérifiées — remplace l'ancien total "Personnel (all companies)"
  // (retiré : le rôle ADMIN ne doit plus voir de statistiques de personnel, voir en-tête
  // de fonction). Purement dérivé de Company.verified, aucune donnée RH derrière.
  const verifiedCompaniesCount = useMemo(
    () => (companies ?? []).filter((c) => c.verified).length,
    [companies],
  );

  const subscriptionByCompany = useMemo(() => {
    const map = new Map<number, (typeof activeSubscriptions)[number]>();
    (subscriptions ?? []).forEach((s) => {
      if (s.companyId != null) map.set(s.companyId, s);
    });
    return map;
  }, [subscriptions]);

  return (
    <div className="page">
      <div className="page__header">
        <h1>Hello {firstname} 👋</h1>
        <p className="page__subtitle">
          A platform-wide view across every company on HumanEdge: registration and
          verification status, active subscriptions, and recurring revenue. Use it to
          monitor platform health without drilling into any single company's internal data.
        </p>
      </div>

      <div className="stat-grid">
        <StatTile label="Companies" value={formatInt((companies ?? []).length)} />
        <StatTile label="Verified companies" value={formatInt(verifiedCompaniesCount)} />
        <StatTile label="Active subscriptions" value={formatInt(activeSubscriptions.length)} />
        <StatTile label="MRR" value={formatTnd(mrr)} />
      </div>

      <div className="chart-card" style={{ maxWidth: 480 }}>
        <h2 className="chart-card__title">Active subscriptions by plan</h2>
        {chartsError && <p className="jobs__status">Unable to load subscriptions.</p>}
        {!chartsLoading && !chartsError && planBreakdown.length > 0 && (
          <BarChart data={planBreakdown} formatValue={formatInt} />
        )}
        {!chartsLoading && !chartsError && planBreakdown.length === 0 && (
          <p className="jobs__status">No active subscriptions.</p>
        )}
      </div>

      <div className="page__header" style={{ marginTop: 32 }}>
        <h2 style={{ margin: 0 }}>Companies</h2>
      </div>

      {companiesSectionLoading && <TableSkeleton columns={5} />}
      {!companiesSectionLoading && companiesSectionError && (
        <p className="jobs__status">Unable to load companies.</p>
      )}
      {!companiesSectionLoading && !companiesSectionError && (companies ?? []).length === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">No records</span>
          <p>No companies registered yet.</p>
        </div>
      )}
      {!companiesSectionLoading && !companiesSectionError && (companies ?? []).length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Plan</th>
                <th>Subscription</th>
                <th>Verified</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(companies ?? []).map((c) => {
                const sub = subscriptionByCompany.get(c.idCompany);
                return (
                  <tr key={c.idCompany}>
                    <td data-label="Company">{c.companyName}</td>
                    <td data-label="Plan">{sub ? planLabel(sub.plan) : '—'}</td>
                    <td data-label="Subscription">
                      {sub ? (
                        <span className={sub.status === 'ACTIVE' ? 'badge badge--success' : 'badge badge--muted'}>
                          {sub.status}
                          {sub.status === 'ACTIVE' && sub.periodEnd ? ` · ${formatDateFr(sub.periodEnd)}` : ''}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td data-label="Verified">
                      {c.verified ? (
                        <span className="badge badge--success">Verified</span>
                      ) : (
                        <span className="badge badge--warning">Pending</span>
                      )}
                    </td>
                    <td data-label="Status">
                      {c.active ? (
                        <span className="badge badge--success">Active</span>
                      ) : (
                        <span className="badge badge--muted">Inactive</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-tile">
      <span className="stat-tile__label">{label}</span>
      <span className="stat-tile__value">{value}</span>
    </div>
  );
}

// =============================================================================
// Quick stats — regroupées par domaine métier plutôt que noyées dans une seule
// grille : (1) Personnel (rôles/échelons + masse salariale de base), (2) Absences
// (justifiées vs non justifiées), (3) Recrutement (offres, candidatures, prochain
// entretien). Réservé au dashboard Company (données de sa propre entreprise) : le
// dashboard Admin ne montre plus de données personnel/RH par entreprise, seulement
// des statistiques au niveau entreprise (nombre, vérification, abonnement).
// =============================================================================
function QuickStatsDomains({
  personnelList,
  absences,
  jobPostingsCount,
  applicationsCount,
  interviews,
}: {
  personnelList?: Personnel[];
  absences?: Absence[];
  jobPostingsCount: number;
  applicationsCount: number;
  interviews?: Interview[];
}) {
  // --- Domaine Personnel : répartition par rôle (Contract.categorie) et par
  // échelon (Contract.echelon), plus la somme des salaires de base des contrats.
  const roleBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    (personnelList ?? []).forEach((p) => {
      const label = p.contract?.categorie || 'Unassigned';
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return [...counts.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [personnelList]);

  const echelonBreakdown = useMemo(() => {
    const counts = new Map<number | 'Unassigned', number>();
    (personnelList ?? []).forEach((p) => {
      const key = p.contract?.echelon ?? 'Unassigned';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => {
        if (a[0] === 'Unassigned') return 1;
        if (b[0] === 'Unassigned') return -1;
        return (a[0] as number) - (b[0] as number);
      })
      .map(([key, value]) => ({ label: key === 'Unassigned' ? key : `Échelon ${key}`, value }));
  }, [personnelList]);

  const totalBaseSalary = useMemo(
    () => (personnelList ?? []).reduce((sum, p) => sum + (p.contract?.salaireBase ?? 0), 0),
    [personnelList],
  );

  // --- Domaine Absences : une absence est "justifiée" dès qu'un justificatif a
  // été déposé (voir Absence.justification / absencesApi.uploadJustification).
  const justifiedCount = (absences ?? []).filter((a) => !!a.justification).length;
  const unjustifiedCount = (absences ?? []).length - justifiedCount;

  // --- Domaine Recrutement : offres publiées, candidatures reçues, et l'entretien
  // planifié le plus proche (on exclut les entretiens annulés ou déjà passés).
  const nextInterview = useMemo(() => {
    const now = Date.now();
    return [...(interviews ?? [])]
      .filter((iv) => iv.status !== 'CANCELLED' && iv.interviewDate && new Date(iv.interviewDate).getTime() >= now)
      .sort((a, b) => (a.interviewDate ?? '').localeCompare(b.interviewDate ?? ''))[0];
  }, [interviews]);

  return (
    <div className="quick-stats-domains">
      <div className="domain-row domain-row--personnel">
        <div className="domain-row__icon">
          <Users size={20} aria-hidden="true" />
        </div>
        <div className="domain-row__content">
          <h3 className="domain-row__title">Personnel — roles &amp; échelons</h3>
          <div className="domain-row__metrics">
            <div className="domain-row__metric">
              <span className="domain-row__metric-value">{formatTnd(totalBaseSalary)}</span>
              <span className="domain-row__metric-label">Base salary total</span>
            </div>
          </div>
          <div className="domain-row__breakdowns">
            <div>
              <p className="quick-stats__label">By role (category)</p>
              <BarChart data={roleBreakdown} formatValue={formatInt} />
            </div>
            <div>
              <p className="quick-stats__label">By échelon (pay grade)</p>
              <BarChart data={echelonBreakdown} formatValue={formatInt} />
            </div>
          </div>
        </div>
      </div>

      <div className="domain-row domain-row--absences">
        <div className="domain-row__icon">
          <CalendarX2 size={20} aria-hidden="true" />
        </div>
        <div className="domain-row__content">
          <h3 className="domain-row__title">Absences</h3>
          <div className="domain-row__metrics">
            <div className="domain-row__metric">
              <span className="domain-row__metric-value">{formatInt(justifiedCount)}</span>
              <span className="domain-row__metric-label">Justified</span>
            </div>
            <div className="domain-row__metric">
              <span className="domain-row__metric-value">{formatInt(unjustifiedCount)}</span>
              <span className="domain-row__metric-label">Unjustified</span>
            </div>
          </div>
        </div>
      </div>

      <div className="domain-row domain-row--recruitment">
        <div className="domain-row__icon">
          <Briefcase size={20} aria-hidden="true" />
        </div>
        <div className="domain-row__content">
          <h3 className="domain-row__title">Recruitment</h3>
          <div className="domain-row__metrics">
            <div className="domain-row__metric">
              <span className="domain-row__metric-value">{formatInt(jobPostingsCount)}</span>
              <span className="domain-row__metric-label">Job postings</span>
            </div>
            <div className="domain-row__metric">
              <span className="domain-row__metric-value">{formatInt(applicationsCount)}</span>
              <span className="domain-row__metric-label">Applications</span>
            </div>
            <div className="domain-row__metric">
              <span className="domain-row__metric-value">
                {nextInterview ? formatDateTime(nextInterview.interviewDate) : 'None scheduled'}
              </span>
              <span className="domain-row__metric-label">Next interview</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

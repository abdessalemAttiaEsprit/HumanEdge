import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, CalendarX2, Briefcase } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { useLanguage } from '@/i18n/useLanguage';
import { navItemsForRole } from '@/config/navigation';
import { personnelApi } from '@/api/personnel';
import { paymentsApi } from '@/api/payments';
import { companiesApi } from '@/api/companies';
import { subscriptionsApi } from '@/api/subscriptions';
import { absencesApi } from '@/api/absences';
import { jobPostingsApi } from '@/api/jobPostings';
import { applicationsApi } from '@/api/applications';
import { interviewsApi } from '@/api/interviews';
import { messagesApi } from '@/api/messages';
import { formatInt, formatTnd, formatDateFr } from '@/lib/format';
import { getErrorMessage } from '@/lib/errors';
import { BarChart, StackedBarChart, type StackedDatum } from '@/components/charts';
import { TableSkeleton } from '@/components/TableSkeleton';
import { timeAgo } from '@/components/NotificationBell';
import { useToast } from '@/components/ToastProvider';
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
  const { t } = useLanguage();
  if (!user) return null;

  if (user.role === 'COMPANY') {
    return <CompanyDashboard firstname={user.firstname} />;
  }

  if (user.role === 'ADMIN') {
    return <AdminDashboard firstname={user.firstname} />;
  }

  if (user.role === 'EMPLOYE') {
    return <EmployeeDashboard firstname={user.firstname} />;
  }

  // Cartes d'accès rapide : les modules du rôle, hors tableau de bord lui-même.
  const cards = navItemsForRole(user.role).filter((item) => item.path !== '/dashboard');

  return (
    <div className="page">
      <div className="page__header">
        <h1>{t.dashboard.greeting(user.firstname)} 👋</h1>
        <p className="page__subtitle">{t.dashboard.employeeSubtitle}</p>
      </div>

      <div className="card-grid">
        {cards.map((item) => (
          <Link key={item.path} to={item.path} className="module-card">
            <span className="module-card__icon">{item.icon}</span>
            <span className="module-card__label">{t.nav[item.key]}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function CompanyDashboard({ firstname }: { firstname: string }) {
  const { t } = useLanguage();
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
      const label = p.contract?.typeContrat ? p.contract.typeContrat.replace(/_/g, ' ') : t.dashboard.quickStats.unassigned;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return [...counts.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [personnelList, t]);

  const loading = personnelLoading || paymentsLoading;

  return (
    <div className="page">
      <div className="page__header">
        <h1>{t.dashboard.greeting(firstname)} 👋</h1>
        <p className="page__subtitle">{t.dashboard.company.subtitle}</p>
      </div>

      <div className="stat-grid">
        <StatTile label={t.dashboard.company.statPersonnel} value={formatInt((personnelList ?? []).length)} />
        <StatTile label={t.dashboard.company.statNetPayroll(selectedYear)} value={formatTnd(totals.net)} />
        <StatTile
          label={t.dashboard.company.statCnss((CNSS_RATE * 100).toFixed(2))}
          value={formatTnd(totals.cnss)}
        />
        <StatTile label={t.dashboard.company.statIrpp(selectedYear)} value={formatTnd(totals.irpp)} />
      </div>

      {quickStatsLoading && <p className="jobs__status">{t.dashboard.company.loadingQuickStats}</p>}
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
          <h2 className="chart-card__title">{t.dashboard.company.personnelByContractType}</h2>
          {!loading && <BarChart data={contractBreakdown} formatValue={formatInt} />}
        </div>

        <div className="chart-card">
          <div className="chart-card__header">
            <h2 className="chart-card__title">{t.dashboard.company.monthlyPayrollBreakdown}</h2>
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
                { key: 'net', label: t.dashboard.company.seriesNetPay, color: '#3b5bdb' },
                { key: 'cnss', label: t.dashboard.company.seriesCnss, color: '#1baf7a' },
                { key: 'irpp', label: t.dashboard.company.seriesIrpp, color: '#eda100' },
              ]}
              formatValue={(v) => `${Math.round(v)}`}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// EMPLOYE: le dashboard n'affiche qu'un espace de messagerie vers l'entreprise
// (voir MessageController côté backend) — envoyer un message crée une notification
// pour tous les comptes COMPANY de l'entreprise (cloche du header), c'est le seul
// canal de retour : pas de fil de discussion bidirectionnel ici.
// ============================================================================
function EmployeeDashboard({ firstname }: { firstname: string }) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [content, setContent] = useState('');

  const { data: messages, isLoading, isError } = useQuery({
    queryKey: ['messages', 'mine'],
    queryFn: messagesApi.list,
  });

  const sendMutation = useMutation({
    mutationFn: messagesApi.send,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', 'mine'] });
      setContent('');
      toast.showSuccess(t.dashboard.employee.successSent);
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.dashboard.employee.errorSend)),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;
    sendMutation.mutate({ content: trimmed });
  };

  return (
    <div className="page">
      <div className="page__header">
        <h1>{t.dashboard.greeting(firstname)} 👋</h1>
        <p className="page__subtitle">{t.dashboard.employee.subtitle}</p>
      </div>

      <div className="message-space">
        <form className="chart-card" onSubmit={handleSubmit}>
          <h2 className="chart-card__title">{t.dashboard.employee.composerTitle}</h2>
          <label className="field">
            <textarea
              rows={3}
              maxLength={1000}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t.dashboard.employee.placeholder}
            />
          </label>
          <div className="message-composer__actions">
            <button type="submit" className="btn btn--primary" disabled={!content.trim() || sendMutation.isPending}>
              {sendMutation.isPending ? t.dashboard.employee.sending : t.dashboard.employee.send}
            </button>
          </div>
        </form>

        <div className="chart-card">
          <h2 className="chart-card__title">{t.dashboard.employee.historyTitle}</h2>
          {isLoading && <p className="jobs__status">{t.dashboard.employee.loading}</p>}
          {isError && <p className="jobs__status">{t.dashboard.employee.errorLoad}</p>}
          {!isLoading && !isError && (messages ?? []).length === 0 && (
            <p className="jobs__status">{t.dashboard.employee.noMessagesYet}</p>
          )}
          {!isLoading && !isError && (messages ?? []).length > 0 && (
            <ul className="message-list">
              {(messages ?? []).map((m) => (
                <li key={m.id} className="message-list__item">
                  <p className="message-list__content">{m.content}</p>
                  <span className="message-list__time">{timeAgo(m.createdAt, t)}</span>
                </li>
              ))}
            </ul>
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
  const { t } = useLanguage();
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
        <h1>{t.dashboard.greeting(firstname)} 👋</h1>
        <p className="page__subtitle">{t.dashboard.admin.subtitle}</p>
      </div>

      <div className="stat-grid">
        <StatTile label={t.dashboard.admin.statCompanies} value={formatInt((companies ?? []).length)} />
        <StatTile label={t.dashboard.admin.statVerifiedCompanies} value={formatInt(verifiedCompaniesCount)} />
        <StatTile label={t.dashboard.admin.statActiveSubscriptions} value={formatInt(activeSubscriptions.length)} />
        <StatTile label={t.dashboard.admin.statMrr} value={formatTnd(mrr)} />
      </div>

      <div className="chart-card" style={{ maxWidth: 480 }}>
        <h2 className="chart-card__title">{t.dashboard.admin.activeSubscriptionsByPlan}</h2>
        {chartsError && <p className="jobs__status">{t.dashboard.admin.unableToLoadSubscriptions}</p>}
        {!chartsLoading && !chartsError && planBreakdown.length > 0 && (
          <BarChart data={planBreakdown} formatValue={formatInt} />
        )}
        {!chartsLoading && !chartsError && planBreakdown.length === 0 && (
          <p className="jobs__status">{t.dashboard.admin.noActiveSubscriptions}</p>
        )}
      </div>

      <div className="page__header" style={{ marginTop: 32 }}>
        <h2 style={{ margin: 0 }}>{t.dashboard.admin.companiesTitle}</h2>
      </div>

      {companiesSectionLoading && <TableSkeleton columns={5} />}
      {!companiesSectionLoading && companiesSectionError && (
        <p className="jobs__status">{t.dashboard.admin.unableToLoadCompanies}</p>
      )}
      {!companiesSectionLoading && !companiesSectionError && (companies ?? []).length === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">{t.common.noRecords}</span>
          <p>{t.dashboard.admin.noCompaniesYet}</p>
        </div>
      )}
      {!companiesSectionLoading && !companiesSectionError && (companies ?? []).length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.dashboard.admin.tableCompany}</th>
                <th>{t.dashboard.admin.tablePlan}</th>
                <th>{t.dashboard.admin.tableSubscription}</th>
                <th>{t.dashboard.admin.tableVerified}</th>
                <th>{t.dashboard.admin.tableStatus}</th>
              </tr>
            </thead>
            <tbody>
              {(companies ?? []).map((c) => {
                const sub = subscriptionByCompany.get(c.idCompany);
                return (
                  <tr key={c.idCompany}>
                    <td data-label={t.dashboard.admin.tableCompany}>{c.companyName}</td>
                    <td data-label={t.dashboard.admin.tablePlan}>{sub ? planLabel(sub.plan) : '—'}</td>
                    <td data-label={t.dashboard.admin.tableSubscription}>
                      {sub ? (
                        <span className={sub.status === 'ACTIVE' ? 'badge badge--success' : 'badge badge--muted'}>
                          {sub.status}
                          {sub.status === 'ACTIVE' && sub.periodEnd ? ` · ${formatDateFr(sub.periodEnd)}` : ''}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td data-label={t.dashboard.admin.tableVerified}>
                      {c.verified ? (
                        <span className="badge badge--success">{t.dashboard.admin.verified}</span>
                      ) : (
                        <span className="badge badge--warning">{t.dashboard.admin.pending}</span>
                      )}
                    </td>
                    <td data-label={t.dashboard.admin.tableStatus}>
                      {c.active ? (
                        <span className="badge badge--success">{t.dashboard.admin.active}</span>
                      ) : (
                        <span className="badge badge--muted">{t.dashboard.admin.inactive}</span>
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
  const { t } = useLanguage();
  const unassigned = t.dashboard.quickStats.unassigned;

  // --- Domaine Personnel : répartition par rôle (Contract.categorie) et par
  // échelon (Contract.echelon), plus la somme des salaires de base des contrats.
  const roleBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    (personnelList ?? []).forEach((p) => {
      const label = p.contract?.categorie || unassigned;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return [...counts.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [personnelList, unassigned]);

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
      .map(([key, value]) => ({ label: key === 'Unassigned' ? unassigned : t.dashboard.quickStats.echelon(key), value }));
  }, [personnelList, unassigned, t]);

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
          <h3 className="domain-row__title">{t.dashboard.quickStats.personnelTitle}</h3>
          <div className="domain-row__metrics">
            <div className="domain-row__metric">
              <span className="domain-row__metric-value">{formatTnd(totalBaseSalary)}</span>
              <span className="domain-row__metric-label">{t.dashboard.quickStats.baseSalaryTotal}</span>
            </div>
          </div>
          <div className="domain-row__breakdowns">
            <div>
              <p className="quick-stats__label">{t.dashboard.quickStats.byRole}</p>
              <BarChart data={roleBreakdown} formatValue={formatInt} />
            </div>
            <div>
              <p className="quick-stats__label">{t.dashboard.quickStats.byEchelon}</p>
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
          <h3 className="domain-row__title">{t.dashboard.quickStats.absencesTitle}</h3>
          <div className="domain-row__metrics">
            <div className="domain-row__metric">
              <span className="domain-row__metric-value">{formatInt(justifiedCount)}</span>
              <span className="domain-row__metric-label">{t.dashboard.quickStats.justified}</span>
            </div>
            <div className="domain-row__metric">
              <span className="domain-row__metric-value">{formatInt(unjustifiedCount)}</span>
              <span className="domain-row__metric-label">{t.dashboard.quickStats.unjustified}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="domain-row domain-row--recruitment">
        <div className="domain-row__icon">
          <Briefcase size={20} aria-hidden="true" />
        </div>
        <div className="domain-row__content">
          <h3 className="domain-row__title">{t.dashboard.quickStats.recruitmentTitle}</h3>
          <div className="domain-row__metrics">
            <div className="domain-row__metric">
              <span className="domain-row__metric-value">{formatInt(jobPostingsCount)}</span>
              <span className="domain-row__metric-label">{t.dashboard.quickStats.jobPostings}</span>
            </div>
            <div className="domain-row__metric">
              <span className="domain-row__metric-value">{formatInt(applicationsCount)}</span>
              <span className="domain-row__metric-label">{t.dashboard.quickStats.applications}</span>
            </div>
            <div className="domain-row__metric">
              <span className="domain-row__metric-value">
                {nextInterview ? formatDateTime(nextInterview.interviewDate) : t.dashboard.quickStats.noneScheduled}
              </span>
              <span className="domain-row__metric-label">{t.dashboard.quickStats.nextInterview}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/useAuth';
import { navItemsForRole } from '@/config/navigation';
import { personnelApi } from '@/api/personnel';
import { paymentsApi } from '@/api/payments';
import { companiesApi } from '@/api/companies';
import { subscriptionsApi } from '@/api/subscriptions';
import { formatInt, formatTnd, formatDateFr } from '@/lib/format';
import { BarChart, StackedBarChart, type StackedDatum } from '@/components/charts';
import type { Month, Payment, Personnel } from '@/types';

const CNSS_RATE = 0.0918; // fixed employee CNSS rate — see PayrollPage.suggestAmounts

const MONTHS: Month[] = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];
const MONTH_SHORT: Record<Month, string> = {
  JANUARY: 'Jan', FEBRUARY: 'Feb', MARCH: 'Mar', APRIL: 'Apr', MAY: 'May', JUNE: 'Jun',
  JULY: 'Jul', AUGUST: 'Aug', SEPTEMBER: 'Sep', OCTOBER: 'Oct', NOVEMBER: 'Nov', DECEMBER: 'Dec',
};

function personnelName(p: Personnel): string {
  return p.user ? `${p.user.firstname} ${p.user.lastname}` : '—';
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
        <p className="page__subtitle">Here is your workspace.</p>
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

  const latestPayByPersonnel = useMemo(() => {
    const map = new Map<number, Payment>();
    (payments ?? []).forEach((p) => {
      if (!p.personnel) return;
      const id = p.personnel.idPersonnel;
      const current = map.get(id);
      if (!current || p.year > current.year || (p.year === current.year && MONTHS.indexOf(p.month!) > MONTHS.indexOf(current.month!))) {
        map.set(id, p);
      }
    });
    return map;
  }, [payments]);

  const loading = personnelLoading || paymentsLoading;

  return (
    <div className="page">
      <div className="page__header">
        <h1>Hello {firstname} 👋</h1>
        <p className="page__subtitle">Quick statistics for your company.</p>
      </div>

      <div className="stat-grid">
        <StatTile label="Personnel" value={formatInt((personnelList ?? []).length)} />
        <StatTile label={`Net payroll (${selectedYear})`} value={formatTnd(totals.net)} />
        <StatTile label={`CNSS contributions (${(CNSS_RATE * 100).toFixed(2)}%)`} value={formatTnd(totals.cnss)} />
        <StatTile label={`IRPP (${selectedYear})`} value={formatTnd(totals.irpp)} />
      </div>

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

      <div className="page__header" style={{ marginTop: 32 }}>
        <h2 style={{ margin: 0 }}>Personnel</h2>
      </div>

      {loading && <p className="jobs__status">Loading personnel…</p>}
      {!loading && (personnelList ?? []).length === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">No records</span>
          <p>No personnel records yet.</p>
        </div>
      )}
      {!loading && (personnelList ?? []).length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>CIN</th>
                <th>Contract</th>
                <th>Latest net pay</th>
              </tr>
            </thead>
            <tbody>
              {(personnelList ?? []).map((p) => {
                const latest = latestPayByPersonnel.get(p.idPersonnel);
                return (
                  <tr key={p.idPersonnel}>
                    <td>{personnelName(p)}</td>
                    <td>{p.user?.email ?? '—'}</td>
                    <td>{p.cin}</td>
                    <td>
                      {p.contract ? (
                        <span className="badge badge--soft">{p.contract.typeContrat}</span>
                      ) : (
                        <span className="badge badge--muted">None</span>
                      )}
                    </td>
                    <td>{latest?.payed != null ? formatTnd(latest.payed) : '—'}</td>
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

function planLabel(code: string): string {
  return code.charAt(0) + code.slice(1).toLowerCase();
}

// ============================================================================
// ADMIN: platform-wide overview across every company — companies, personnel, payroll,
// subscriptions (MRR, plan breakdown). See SubscriptionController for the global endpoint.
// ============================================================================
function AdminDashboard({ firstname }: { firstname: string }) {
  const { data: companies, isLoading: companiesLoading } = useQuery({
    queryKey: ['companies'],
    queryFn: companiesApi.list,
  });

  const { data: personnelList, isLoading: personnelLoading } = useQuery({
    queryKey: ['personnel'],
    queryFn: personnelApi.list,
  });

  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: paymentsApi.list,
  });

  const { data: subscriptions, isLoading: subscriptionsLoading } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: subscriptionsApi.list,
  });

  const loading = companiesLoading || personnelLoading || paymentsLoading || subscriptionsLoading;

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

  const currentYear = new Date().getFullYear();
  const yearPayments = useMemo(() => (payments ?? []).filter((p) => p.year === currentYear), [payments, currentYear]);

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

  const staffCountByCompany = useMemo(() => {
    const counts = new Map<number, number>();
    (personnelList ?? []).forEach((p) => {
      const id = p.user?.company?.idCompany;
      if (id == null) return;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    });
    return counts;
  }, [personnelList]);

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
        <p className="page__subtitle">Platform-wide overview across every company.</p>
      </div>

      <div className="stat-grid">
        <StatTile label="Companies" value={formatInt((companies ?? []).length)} />
        <StatTile label="Personnel (all companies)" value={formatInt((personnelList ?? []).length)} />
        <StatTile label="Active subscriptions" value={formatInt(activeSubscriptions.length)} />
        <StatTile label="MRR" value={formatTnd(mrr)} />
      </div>

      <div className="dashboard-grid">
        <div className="chart-card">
          <h2 className="chart-card__title">Active subscriptions by plan</h2>
          {!loading && planBreakdown.length > 0 && <BarChart data={planBreakdown} formatValue={formatInt} />}
          {!loading && planBreakdown.length === 0 && <p className="jobs__status">No active subscriptions.</p>}
        </div>

        <div className="chart-card">
          <h2 className="chart-card__title">Payroll across all companies ({currentYear})</h2>
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

      <div className="page__header" style={{ marginTop: 32 }}>
        <h2 style={{ margin: 0 }}>Companies</h2>
      </div>

      {loading && <p className="jobs__status">Loading companies…</p>}
      {!loading && (companies ?? []).length === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">No records</span>
          <p>No companies registered yet.</p>
        </div>
      )}
      {!loading && (companies ?? []).length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Personnel</th>
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
                    <td>{c.companyName}</td>
                    <td>{formatInt(staffCountByCompany.get(c.idCompany) ?? 0)}</td>
                    <td>{sub ? planLabel(sub.plan) : '—'}</td>
                    <td>
                      {sub ? (
                        <span className={sub.status === 'ACTIVE' ? 'badge badge--soft' : 'badge badge--muted'}>
                          {sub.status}
                          {sub.status === 'ACTIVE' && sub.periodEnd ? ` · ${formatDateFr(sub.periodEnd)}` : ''}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {c.verified ? (
                        <span className="badge badge--soft">Verified</span>
                      ) : (
                        <span className="badge badge--muted">Pending</span>
                      )}
                    </td>
                    <td>
                      {c.active ? (
                        <span className="badge badge--soft">Active</span>
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

import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calculator, CheckCircle2, Download, Eye, Pencil, Plus, Receipt, Trash2 } from 'lucide-react';
import { paymentsApi } from '@/api/payments';
import { personnelApi } from '@/api/personnel';
import { companiesApi } from '@/api/companies';
import { useAuth } from '@/auth/useAuth';
import { getErrorMessage } from '@/lib/errors';
import { usePagination } from '@/lib/usePagination';
import { useEscapeKey } from '@/lib/useEscapeKey';
import { useConfirm } from '@/lib/useConfirm';
import { useSort } from '@/lib/useSort';
import { IconButton } from '@/components/IconButton';
import { Pagination } from '@/components/Pagination';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TableSkeleton } from '@/components/TableSkeleton';
import { SortableTh } from '@/components/SortableTh';
import { RowActionsMenu } from '@/components/RowActionsMenu';
import { useToast } from '@/components/ToastProvider';
import type { Absence, Month, Payment, PayrollGenerationSummary, Personnel } from '@/types';

const MONTHS: Month[] = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];

const CNSS_RATE = 0.0918; // matches the 9.18% rate PdfService labels on the payslip

// Mirrors SalaryCalculationService's Tunisian IRPP bracket table (backend/.../SalaryCalculationService.java)
// so "Suggest amounts" can preview the IRPP amount/rate client-side before saving.
const IRPP_BRACKET_CEILINGS = [5000, 20000, 30000, 50000];
const IRPP_BRACKET_RATES = [0, 0.26, 0.28, 0.32, 0.35];
const PROFESSIONAL_ALLOWANCE_RATE = 0.1;
const PROFESSIONAL_ALLOWANCE_ANNUAL_CAP = 2000;

const EMPTY_FORM = {
  personnelId: '' as number | '',
  month: 'JANUARY' as Month,
  year: new Date().getFullYear(),
  paymentDate: '',
  montantCnss: '' as number | '',
  montantIrpp: '' as number | '',
  /** Percentage (e.g. 26 for 26%) for display; converted to a 0-1 fraction in buildPayload. */
  irppRate: '' as number | '',
  payed: '' as number | '',
  justifiedAbsenceDays: '' as number | '',
  unjustifiedAbsenceDays: '' as number | '',
  absenceDeduction: '' as number | '',
};

function personnelName(p?: Personnel): string {
  if (!p?.user) return '—';
  return `${p.user.firstname} ${p.user.lastname}`;
}

function isJustified(a: Absence): boolean {
  return Boolean(a.reason?.trim() || a.justification?.trim());
}

function absenceDayCount(a: Absence): number {
  if (a.startDate && a.endDate) {
    const days = (new Date(a.endDate).getTime() - new Date(a.startDate).getTime()) / 86_400_000;
    return Math.max(1, Math.round(days) + 1);
  }
  return 1;
}

/** Annual progressive tax for a given taxable income, per IRPP_BRACKET_CEILINGS/RATES. */
function annualBareme(annualTaxable: number): number {
  let tax = 0;
  let previousCeiling = 0;
  for (let i = 0; i < IRPP_BRACKET_CEILINGS.length; i++) {
    const ceiling = IRPP_BRACKET_CEILINGS[i];
    if (annualTaxable <= ceiling) {
      return tax + (annualTaxable - previousCeiling) * IRPP_BRACKET_RATES[i];
    }
    tax += (ceiling - previousCeiling) * IRPP_BRACKET_RATES[i];
    previousCeiling = ceiling;
  }
  return tax + (annualTaxable - previousCeiling) * IRPP_BRACKET_RATES[IRPP_BRACKET_RATES.length - 1];
}

/** Marginal rate (highest bracket reached) for a given taxable income. */
function marginalIrppRate(annualTaxable: number): number {
  for (let i = 0; i < IRPP_BRACKET_CEILINGS.length; i++) {
    if (annualTaxable <= IRPP_BRACKET_CEILINGS[i]) return IRPP_BRACKET_RATES[i];
  }
  return IRPP_BRACKET_RATES[IRPP_BRACKET_RATES.length - 1];
}

/** Rough estimate only (net salary suggestion) — always editable before saving. */
function suggestAmounts(personnel: Personnel, month: Month, year: number) {
  const contract = personnel.contract;
  const salaireBase = contract?.salaireBase ?? 0;
  const avantages = contract?.avantages ?? 0;
  const grossBase = salaireBase + avantages;
  const dailyRate = salaireBase / 22;

  const monthPrefix = `${year}-${String(MONTHS.indexOf(month) + 1).padStart(2, '0')}`;
  const monthAbsences = (personnel.absences ?? []).filter((a) =>
    (a.dateAbsence ?? a.startDate ?? '').startsWith(monthPrefix),
  );
  const justifiedDays = monthAbsences.filter(isJustified).reduce((sum, a) => sum + absenceDayCount(a), 0);
  const nonJustifiedDays = monthAbsences
    .filter((a) => !isJustified(a))
    .reduce((sum, a) => sum + absenceDayCount(a), 0);

  const deduction = Math.round(dailyRate * nonJustifiedDays * 1000) / 1000;
  const montantCnss = Math.round(grossBase * CNSS_RATE * 1000) / 1000;

  // Same formula as SalaryCalculationService.compute: 10%-of-annual-income allowance
  // (capped at 2000 TND/year) applied before the progressive bracket table.
  const monthlyTaxableBeforeAllowance = Math.max(0, grossBase - montantCnss - deduction);
  const annualBeforeAllowance = monthlyTaxableBeforeAllowance * 12;
  const allowance = Math.min(annualBeforeAllowance * PROFESSIONAL_ALLOWANCE_RATE, PROFESSIONAL_ALLOWANCE_ANNUAL_CAP);
  const annualTaxable = Math.max(0, annualBeforeAllowance - allowance);
  const montantIrpp = Math.round((annualBareme(annualTaxable) / 12) * 1000) / 1000;
  const irppRate = marginalIrppRate(annualTaxable);

  const payed = Math.round((grossBase - deduction - montantCnss - montantIrpp) * 1000) / 1000;

  return { montantCnss, montantIrpp, irppRate, payed, justifiedDays, nonJustifiedDays, deduction, grossBase };
}

type PaymentSortKey = 'employee' | 'period' | 'paymentDate' | 'netPay' | 'status';

function getPaymentSortValue(p: Payment, key: PaymentSortKey): string | number {
  switch (key) {
    case 'employee':
      return personnelName(p.personnel);
    case 'period':
      return `${p.year}-${p.month ? MONTHS.indexOf(p.month) : -1}`;
    case 'paymentDate':
      return p.paymentDate ?? '';
    case 'netPay':
      return p.payed ?? -1;
    case 'status':
      return p.status ?? '';
  }
}

function StatusBadge({ status }: { status?: string }) {
  return status === 'VALIDATED' ? (
    <span className="badge badge--success">Validated</span>
  ) : (
    <span className="badge badge--warning">{status || 'Draft'}</span>
  );
}

/**
 * Read-only payslip breakdown — surfaces absence days/deduction and the IRPP rate that the
 * PDF (PdfService.generateFichePaie) also shows, without requiring a download. Payments
 * created before this feature (or entered manually without "Suggest amounts") show "—" for
 * fields that were never captured, rather than guessing.
 */
function PayslipDetailModal({
  payment,
  showEmployee,
  onClose,
}: {
  payment: Payment;
  showEmployee?: boolean;
  onClose: () => void;
}) {
  useEscapeKey(onClose, true);

  const contract = payment.contrat;
  const salaireBase = contract?.salaireBase ?? 0;
  const avantages = contract?.avantages ?? 0;
  const gross = salaireBase + avantages;
  const irppRateLabel = payment.irppRate != null ? `${(payment.irppRate * 100).toFixed(2)}%` : '—';
  const tnd = (v?: number) => (v != null ? `${v.toFixed(3)} TND` : '—');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Payslip — {payment.month} {payment.year}</h2>
        {showEmployee && <p className="page__subtitle">{personnelName(payment.personnel)}</p>}

        <div className="contract-panel">
          <div className="contract-panel__grid">
            <div className="contract-panel__item">
              <span className="contract-panel__label">Base salary</span>
              <span className="contract-panel__value">{tnd(salaireBase || undefined)}</span>
            </div>
            <div className="contract-panel__item">
              <span className="contract-panel__label">Benefits</span>
              <span className="contract-panel__value">{tnd(avantages || undefined)}</span>
            </div>
            <div className="contract-panel__item">
              <span className="contract-panel__label">Gross</span>
              <span className="contract-panel__value">{tnd(gross || undefined)}</span>
            </div>
            <div className="contract-panel__item">
              <span className="contract-panel__label">Justified absence days</span>
              <span className="contract-panel__value">{payment.justifiedAbsenceDays ?? '—'}</span>
            </div>
            <div className="contract-panel__item">
              <span className="contract-panel__label">Unjustified absence days</span>
              <span className="contract-panel__value">{payment.unjustifiedAbsenceDays ?? '—'}</span>
            </div>
            <div className="contract-panel__item">
              <span className="contract-panel__label">Absence deduction</span>
              <span className="contract-panel__value">{tnd(payment.absenceDeduction)}</span>
            </div>
            <div className="contract-panel__item">
              <span className="contract-panel__label">CNSS ({(CNSS_RATE * 100).toFixed(2)}%)</span>
              <span className="contract-panel__value">{tnd(payment.montantCnss)}</span>
            </div>
            <div className="contract-panel__item">
              <span className="contract-panel__label">IRPP ({irppRateLabel})</span>
              <span className="contract-panel__value">{tnd(payment.montantIrpp)}</span>
            </div>
            <div className="contract-panel__item">
              <span className="contract-panel__label">Net pay</span>
              <span className="contract-panel__value">{tnd(payment.payed)}</span>
            </div>
            <div className="contract-panel__item">
              <span className="contract-panel__label">Status</span>
              <span className="contract-panel__value">
                <StatusBadge status={payment.status} />
              </span>
            </div>
          </div>
        </div>

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={() => paymentsApi.downloadPayslipPdf(payment.id)}>
            <Receipt size={16} aria-hidden="true" />
            Download PDF
          </button>
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function PayrollPage() {
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'COMPANY';
  return canManage ? <ManagePayroll /> : <MyPayslips />;
}

// ============================================================================
// EMPLOYE: self-service — view own payslips, download PDF.
// ============================================================================
function MyPayslips() {
  const { data: payments, isLoading, isError } = useQuery({
    queryKey: ['payments', 'me'],
    queryFn: paymentsApi.getMine,
  });

  const [viewing, setViewing] = useState<Payment | null>(null);
  const { page, setPage, pageCount, pageItems } = usePagination(payments ?? [], 10);

  return (
    <div>
      <div className="page__header">
        <h1>My payslips</h1>
        <p className="page__subtitle">
          Browse your payment history and download any payslip as a PDF. Each one details
          your gross salary, absence deductions, CNSS and IRPP contributions, and net pay.
        </p>
      </div>

      {isLoading && <TableSkeleton columns={5} />}
      {isError && <p className="jobs__status">Unable to load your payslips.</p>}
      {!isLoading && !isError && (payments?.length ?? 0) === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">No records</span>
          <p>No payslips yet.</p>
        </div>
      )}

      {(payments?.length ?? 0) > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Payment date</th>
                <th>Net pay</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((p) => (
                <tr key={p.id}>
                  <td data-label="Period">{p.month} {p.year}</td>
                  <td data-label="Payment date">{p.paymentDate || '—'}</td>
                  <td data-label="Net pay">{p.payed != null ? `${p.payed.toFixed(3)} TND` : '—'}</td>
                  <td data-label="Status"><StatusBadge status={p.status} /></td>
                  <td className="data-table__actions" data-label="">
                    <IconButton
                      icon={<Eye size={15} aria-hidden="true" />}
                      label="View payslip details"
                      onClick={() => setViewing(p)}
                    />
                    <IconButton
                      icon={<Receipt size={15} aria-hidden="true" />}
                      label="Download PDF"
                      onClick={() => paymentsApi.downloadPayslipPdf(p.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />

      {viewing && <PayslipDetailModal payment={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

// ============================================================================
// ADMIN / COMPANY: manage payroll.
// ============================================================================
function ManagePayroll() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const queryClient = useQueryClient();
  const toast = useToast();
  const { confirmOptions, requestConfirm, closeConfirm, handleConfirm } = useConfirm();

  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);
  const [viewing, setViewing] = useState<Payment | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateMonth, setGenerateMonth] = useState<Month>('JANUARY');
  const [generateYear, setGenerateYear] = useState(new Date().getFullYear());
  const [generateCompanyId, setGenerateCompanyId] = useState<number | ''>('');
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateResult, setGenerateResult] = useState<PayrollGenerationSummary | null>(null);

  const { data: payments, isLoading, isError } = useQuery({
    queryKey: ['payments'],
    queryFn: paymentsApi.list,
  });

  const { data: personnelList } = useQuery({
    queryKey: ['personnel'],
    queryFn: personnelApi.list,
  });

  const { data: companies } = useQuery({
    queryKey: ['companies'],
    queryFn: companiesApi.list,
    enabled: isAdmin && showGenerateModal,
  });

  const createMutation = useMutation({
    mutationFn: paymentsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setShowAddModal(false);
      setForm(EMPTY_FORM);
      setFormError(null);
      toast.showSuccess('Payment created.');
    },
    onError: (err) => setFormError(getErrorMessage(err, 'Unable to create the payment')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ReturnType<typeof buildPayload> }) =>
      paymentsApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setEditing(null);
      setFormError(null);
      toast.showSuccess('Payment updated.');
    },
    onError: (err) => setFormError(getErrorMessage(err, 'Unable to update the payment')),
  });

  const validateMutation = useMutation({
    mutationFn: paymentsApi.validate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast.showSuccess('Payment validated.');
    },
    onError: (err) => toast.showError(getErrorMessage(err, 'Unable to validate this payment')),
  });

  const deleteMutation = useMutation({
    mutationFn: paymentsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast.showSuccess('Payment deleted.');
    },
    onError: (err) => toast.showError(getErrorMessage(err, 'Unable to delete this payment')),
  });

  const generateMutation = useMutation({
    mutationFn: () => paymentsApi.generate(generateMonth, generateYear, generateCompanyId || undefined),
    onSuccess: (summary) => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setGenerateResult(summary);
      setGenerateError(null);
    },
    onError: (err) => setGenerateError(getErrorMessage(err, 'Unable to generate payroll')),
  });

  function buildPayload(f: typeof EMPTY_FORM) {
    return {
      month: f.month,
      year: Number(f.year),
      paymentDate: f.paymentDate || undefined,
      montantCnss: f.montantCnss === '' ? undefined : Number(f.montantCnss),
      montantIrpp: f.montantIrpp === '' ? undefined : Number(f.montantIrpp),
      irppRate: f.irppRate === '' ? undefined : Number(f.irppRate) / 100,
      payed: f.payed === '' ? undefined : Number(f.payed),
      justifiedAbsenceDays: f.justifiedAbsenceDays === '' ? undefined : Number(f.justifiedAbsenceDays),
      unjustifiedAbsenceDays: f.unjustifiedAbsenceDays === '' ? undefined : Number(f.unjustifiedAbsenceDays),
      absenceDeduction: f.absenceDeduction === '' ? undefined : Number(f.absenceDeduction),
    };
  }

  const visiblePayments = useMemo(() => {
    if (!payments) return [];
    if (isAdmin) return payments;
    return payments.filter((p) => p.company?.idCompany === user?.companyId);
  }, [payments, isAdmin, user?.companyId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return visiblePayments;
    return visiblePayments.filter((p) =>
      [personnelName(p.personnel), p.month, String(p.year)].filter(Boolean).join(' ').toLowerCase().includes(q),
    );
  }, [visiblePayments, search]);

  const selectedPersonnel = useMemo(
    () => (personnelList ?? []).find((p) => p.idPersonnel === form.personnelId),
    [personnelList, form.personnelId],
  );

  const { sorted, sortKey, direction, toggleSort } = useSort<Payment, PaymentSortKey>(filtered, getPaymentSortValue);
  const { page, setPage, pageCount, pageItems } = usePagination(sorted, 10);

  const openAddModal = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowAddModal(true);
  };

  const openGenerateModal = () => {
    setGenerateMonth('JANUARY');
    setGenerateYear(new Date().getFullYear());
    setGenerateCompanyId('');
    setGenerateError(null);
    setGenerateResult(null);
    setShowGenerateModal(true);
  };

  const closeGenerateModal = () => {
    setShowGenerateModal(false);
    setGenerateResult(null);
    setGenerateError(null);
  };

  const handleGenerateSubmit = (e: FormEvent) => {
    e.preventDefault();
    setGenerateError(null);
    if (isAdmin && !generateCompanyId) {
      setGenerateError('Please select a company');
      return;
    }
    generateMutation.mutate();
  };

  useEscapeKey(() => setShowAddModal(false), showAddModal);
  useEscapeKey(() => setEditing(null), !!editing);
  useEscapeKey(closeGenerateModal, showGenerateModal);

  const openEditModal = (p: Payment) => {
    setEditing(p);
    setForm({
      personnelId: p.personnel?.idPersonnel ?? '',
      month: p.month ?? 'JANUARY',
      year: p.year,
      paymentDate: p.paymentDate ?? '',
      montantCnss: p.montantCnss ?? '',
      montantIrpp: p.montantIrpp ?? '',
      irppRate: p.irppRate != null ? Math.round(p.irppRate * 10000) / 100 : '',
      payed: p.payed ?? '',
      justifiedAbsenceDays: p.justifiedAbsenceDays ?? '',
      unjustifiedAbsenceDays: p.unjustifiedAbsenceDays ?? '',
      absenceDeduction: p.absenceDeduction ?? '',
    });
    setFormError(null);
  };

  const applySuggestion = () => {
    if (!selectedPersonnel) return;
    const { montantCnss, montantIrpp, irppRate, payed, justifiedDays, nonJustifiedDays, deduction } = suggestAmounts(
      selectedPersonnel,
      form.month,
      Number(form.year),
    );
    setForm((f) => ({
      ...f,
      montantCnss,
      montantIrpp,
      irppRate: Math.round(irppRate * 10000) / 100,
      payed,
      justifiedAbsenceDays: justifiedDays,
      unjustifiedAbsenceDays: nonJustifiedDays,
      absenceDeduction: deduction,
    }));
  };

  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.personnelId) {
      setFormError('Please select an employee');
      return;
    }
    // Payment.company is never auto-attached server-side (unlike JobPosting) and
    // getAllPayments() filters COMPANY users by company_id — omitting this would make a
    // COMPANY user's own newly created payment invisible to themselves.
    const companyId = isAdmin ? selectedPersonnel?.user?.company?.idCompany : user?.companyId;
    createMutation.mutate({
      ...buildPayload(form),
      status: 'DRAFT',
      personnel: { idPersonnel: form.personnelId },
      ...(selectedPersonnel?.contract ? { contrat: { idContract: selectedPersonnel.contract.idContract } } : {}),
      ...(companyId ? { company: { idCompany: companyId } } : {}),
    });
  };

  const handleEditSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setFormError(null);
    updateMutation.mutate({ id: editing.id, payload: buildPayload(form) });
  };

  const handleDelete = (p: Payment) => {
    requestConfirm({
      title: 'Delete payment',
      message: `Delete this payment for ${personnelName(p.personnel)}? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: () => deleteMutation.mutate(p.id),
    });
  };

  return (
    <div>
      <div className="page__header page__header--row">
        <div>
          <h1>Payroll</h1>
          <p className="page__subtitle">
            Generate, review, and validate monthly payroll for your staff. Amounts are
            computed automatically from each contract and that month's absences — including
            CNSS contributions and the progressive IRPP tax bracket — and stay fully editable
            until validated.
          </p>
        </div>
        <div className="page__header-actions">
          <button className="btn btn--ghost" onClick={() => paymentsApi.exportCsv()}>
            <Download size={16} aria-hidden="true" />
            Export CSV
          </button>
          <button className="btn btn--ghost" onClick={openGenerateModal}>
            <Calculator size={16} aria-hidden="true" />
            Generate payroll
          </button>
          <button className="btn btn--primary" onClick={openAddModal}>
            <Plus size={16} aria-hidden="true" />
            Add payment
          </button>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="toolbar__search"
          type="search"
          placeholder="Search by employee, period…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && <TableSkeleton columns={6} />}
      {isError && <p className="jobs__status">Unable to load payments.</p>}
      {!isLoading && !isError && filtered.length === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">No records</span>
          <p>{search ? 'No payments match your search.' : 'No payments recorded yet.'}</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <SortableTh
                  label="Employee"
                  sortKey="employee"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={toggleSort}
                />
                <SortableTh label="Period" sortKey="period" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh
                  label="Payment date"
                  sortKey="paymentDate"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={toggleSort}
                />
                <SortableTh label="Net pay" sortKey="netPay" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh label="Status" sortKey="status" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((p) => (
                <tr key={p.id}>
                  <td data-label="Employee">{personnelName(p.personnel)}</td>
                  <td data-label="Period">{p.month} {p.year}</td>
                  <td data-label="Payment date">{p.paymentDate || '—'}</td>
                  <td data-label="Net pay">{p.payed != null ? `${p.payed.toFixed(3)} TND` : '—'}</td>
                  <td data-label="Status"><StatusBadge status={p.status} /></td>
                  <td className="data-table__actions" data-label="">
                    <IconButton
                      icon={<Eye size={15} aria-hidden="true" />}
                      label="View payslip details"
                      onClick={() => setViewing(p)}
                    />
                    <IconButton
                      icon={<Receipt size={15} aria-hidden="true" />}
                      label="Download payslip PDF"
                      onClick={() => paymentsApi.downloadPayslipPdf(p.id)}
                    />
                    <RowActionsMenu
                      ariaLabel={`Actions for the payment of ${personnelName(p.personnel)}`}
                      items={[
                        { label: 'Edit', icon: <Pencil size={15} aria-hidden="true" />, onClick: () => openEditModal(p) },
                        ...(p.status !== 'VALIDATED'
                          ? [
                              {
                                label: 'Validate',
                                icon: <CheckCircle2 size={15} aria-hidden="true" />,
                                disabled: validateMutation.isPending,
                                onClick: () => validateMutation.mutate(p.id),
                              },
                            ]
                          : []),
                        // A validated payment already notified the employee by email and stands
                        // as a payslip record — only a DRAFT can be deleted (see
                        // PaymentService#deletePayment for the matching server-side check).
                        ...(p.status !== 'VALIDATED'
                          ? [
                              {
                                label: 'Delete',
                                icon: <Trash2 size={15} aria-hidden="true" />,
                                danger: true,
                                disabled: deleteMutation.isPending,
                                onClick: () => handleDelete(p),
                              },
                            ]
                          : []),
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add payment</h2>
            <form onSubmit={handleCreateSubmit}>
              {formError && <div className="alert alert--error">{formError}</div>}
              <div className="fieldset">
                <label className="field">
                  <span>Employee</span>
                  <select
                    value={form.personnelId}
                    onChange={(e) => setForm((f) => ({ ...f, personnelId: Number(e.target.value) || '' }))}
                    required
                  >
                    <option value="">Select an employee…</option>
                    {(personnelList ?? []).map((p) => (
                      <option key={p.idPersonnel} value={p.idPersonnel}>
                        {personnelName(p)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="field-row">
                  <label className="field">
                    <span>Month</span>
                    <select value={form.month} onChange={(e) => setForm((f) => ({ ...f, month: e.target.value as Month }))}>
                      {MONTHS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Year</span>
                    <input
                      type="number"
                      value={form.year}
                      onChange={(e) => setForm((f) => ({ ...f, year: Number(e.target.value) }))}
                      required
                    />
                  </label>
                </div>
                <label className="field">
                  <span>Payment date (optional)</span>
                  <input
                    type="date"
                    value={form.paymentDate}
                    onChange={(e) => setForm((f) => ({ ...f, paymentDate: e.target.value }))}
                  />
                </label>
              </div>

              <div className="fieldset">
                <div className="modal__actions modal__actions--start">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={applySuggestion}
                    disabled={!selectedPersonnel}
                    title={selectedPersonnel ? undefined : 'Select an employee first'}
                  >
                    Suggest amounts from contract
                  </button>
                </div>
                <div className="field-row">
                  <label className="field">
                    <span>CNSS (9.18%)</span>
                    <input
                      type="number"
                      step="0.001"
                      value={form.montantCnss}
                      onChange={(e) => setForm((f) => ({ ...f, montantCnss: e.target.value ? Number(e.target.value) : '' }))}
                    />
                  </label>
                  <label className="field">
                    <span>IRPP</span>
                    <input
                      type="number"
                      step="0.001"
                      value={form.montantIrpp}
                      onChange={(e) => setForm((f) => ({ ...f, montantIrpp: e.target.value ? Number(e.target.value) : '' }))}
                    />
                  </label>
                </div>
                <div className="field-row">
                  <label className="field">
                    <span>Justified absence days</span>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={form.justifiedAbsenceDays}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, justifiedAbsenceDays: e.target.value ? Number(e.target.value) : '' }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Unjustified absence days</span>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={form.unjustifiedAbsenceDays}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, unjustifiedAbsenceDays: e.target.value ? Number(e.target.value) : '' }))
                      }
                    />
                  </label>
                </div>
                <div className="field-row">
                  <label className="field">
                    <span>Absence deduction</span>
                    <input
                      type="number"
                      step="0.001"
                      value={form.absenceDeduction}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, absenceDeduction: e.target.value ? Number(e.target.value) : '' }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>IRPP rate (%)</span>
                    <input
                      type="number"
                      step="0.01"
                      value={form.irppRate}
                      onChange={(e) => setForm((f) => ({ ...f, irppRate: e.target.value ? Number(e.target.value) : '' }))}
                    />
                  </label>
                </div>
                <label className="field">
                  <span>Net pay</span>
                  <input
                    type="number"
                    step="0.001"
                    value={form.payed}
                    onChange={(e) => setForm((f) => ({ ...f, payed: e.target.value ? Number(e.target.value) : '' }))}
                  />
                </label>
                <p className="field-hint">
                  Amounts are never auto-computed by the server — the suggestion above is an
                  estimate from the employee's contract and absences that month (justified days,
                  unjustified days, deduction, IRPP rate), always editable before saving.
                </p>
              </div>

              <div className="modal__actions">
                <button type="button" className="btn btn--ghost" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button className="btn btn--primary" type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating…' : 'Create payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit payment — {personnelName(editing.personnel)}</h2>
            <form onSubmit={handleEditSubmit}>
              {formError && <div className="alert alert--error">{formError}</div>}
              <div className="fieldset">
                <div className="field-row">
                  <label className="field">
                    <span>Month</span>
                    <select value={form.month} onChange={(e) => setForm((f) => ({ ...f, month: e.target.value as Month }))}>
                      {MONTHS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Year</span>
                    <input
                      type="number"
                      value={form.year}
                      onChange={(e) => setForm((f) => ({ ...f, year: Number(e.target.value) }))}
                      required
                    />
                  </label>
                </div>
                <label className="field">
                  <span>Payment date (optional)</span>
                  <input
                    type="date"
                    value={form.paymentDate}
                    onChange={(e) => setForm((f) => ({ ...f, paymentDate: e.target.value }))}
                  />
                </label>
                <div className="field-row">
                  <label className="field">
                    <span>CNSS</span>
                    <input
                      type="number"
                      step="0.001"
                      value={form.montantCnss}
                      onChange={(e) => setForm((f) => ({ ...f, montantCnss: e.target.value ? Number(e.target.value) : '' }))}
                    />
                  </label>
                  <label className="field">
                    <span>IRPP</span>
                    <input
                      type="number"
                      step="0.001"
                      value={form.montantIrpp}
                      onChange={(e) => setForm((f) => ({ ...f, montantIrpp: e.target.value ? Number(e.target.value) : '' }))}
                    />
                  </label>
                </div>
                <div className="field-row">
                  <label className="field">
                    <span>Justified absence days</span>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={form.justifiedAbsenceDays}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, justifiedAbsenceDays: e.target.value ? Number(e.target.value) : '' }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Unjustified absence days</span>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={form.unjustifiedAbsenceDays}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, unjustifiedAbsenceDays: e.target.value ? Number(e.target.value) : '' }))
                      }
                    />
                  </label>
                </div>
                <div className="field-row">
                  <label className="field">
                    <span>Absence deduction</span>
                    <input
                      type="number"
                      step="0.001"
                      value={form.absenceDeduction}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, absenceDeduction: e.target.value ? Number(e.target.value) : '' }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>IRPP rate (%)</span>
                    <input
                      type="number"
                      step="0.01"
                      value={form.irppRate}
                      onChange={(e) => setForm((f) => ({ ...f, irppRate: e.target.value ? Number(e.target.value) : '' }))}
                    />
                  </label>
                </div>
                <label className="field">
                  <span>Net pay</span>
                  <input
                    type="number"
                    step="0.001"
                    value={form.payed}
                    onChange={(e) => setForm((f) => ({ ...f, payed: e.target.value ? Number(e.target.value) : '' }))}
                  />
                </label>
              </div>
              <div className="modal__actions">
                <button type="button" className="btn btn--ghost" onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button className="btn btn--primary" type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showGenerateModal && (
        <div className="modal-overlay" onClick={closeGenerateModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Generate payroll</h2>
            {!generateResult ? (
              <form onSubmit={handleGenerateSubmit}>
                {generateError && <div className="alert alert--error">{generateError}</div>}
                <p className="field-hint">
                  Creates a DRAFT payment for every employee with an active contract that month.
                  CNSS (9.18%), IRPP (with its bracket rate) and net pay are computed
                  automatically from each contract, including a detailed breakdown of that
                  month's justified/unjustified absence days and the resulting deduction;
                  employees who already have a payment for this period are skipped.
                </p>
                <div className="fieldset">
                  <div className="field-row">
                    <label className="field">
                      <span>Month</span>
                      <select value={generateMonth} onChange={(e) => setGenerateMonth(e.target.value as Month)}>
                        {MONTHS.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Year</span>
                      <input
                        type="number"
                        value={generateYear}
                        onChange={(e) => setGenerateYear(Number(e.target.value))}
                        required
                      />
                    </label>
                  </div>
                  {isAdmin && (
                    <label className="field">
                      <span>Company</span>
                      <select
                        value={generateCompanyId}
                        onChange={(e) => setGenerateCompanyId(Number(e.target.value) || '')}
                        required
                      >
                        <option value="">Select a company…</option>
                        {(companies ?? []).map((c) => (
                          <option key={c.idCompany} value={c.idCompany}>{c.companyName}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                <div className="modal__actions">
                  <button type="button" className="btn btn--ghost" onClick={closeGenerateModal}>
                    Cancel
                  </button>
                  <button className="btn btn--primary" type="submit" disabled={generateMutation.isPending}>
                    {generateMutation.isPending ? 'Generating…' : 'Generate'}
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <div className="alert alert--success">
                  {generateResult.created.length} payslip{generateResult.created.length === 1 ? '' : 's'} generated
                  for {generateMonth} {generateYear}.
                </div>
                {generateResult.alreadyGenerated > 0 && (
                  <p className="field-hint">
                    {generateResult.alreadyGenerated} employee{generateResult.alreadyGenerated === 1 ? '' : 's'} already
                    had a payment for this period and {generateResult.alreadyGenerated === 1 ? 'was' : 'were'} skipped.
                  </p>
                )}
                {generateResult.skippedNoActiveContract > 0 && (
                  <p className="field-hint">
                    {generateResult.skippedNoActiveContract} employee{generateResult.skippedNoActiveContract === 1 ? '' : 's'} had
                    no active contract that month and {generateResult.skippedNoActiveContract === 1 ? 'was' : 'were'} skipped.
                  </p>
                )}
                <div className="modal__actions">
                  <button className="btn btn--primary" onClick={closeGenerateModal}>
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {viewing && <PayslipDetailModal payment={viewing} showEmployee onClose={() => setViewing(null)} />}

      <ConfirmDialog options={confirmOptions} onConfirm={handleConfirm} onCancel={closeConfirm} />
    </div>
  );
}

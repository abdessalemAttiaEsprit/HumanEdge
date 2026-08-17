import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calculator, CheckCircle2, Download, Eye, Pencil, Plus, Receipt, Trash2 } from 'lucide-react';
import { paymentsApi } from '@/api/payments';
import { personnelApi } from '@/api/personnel';
import { companiesApi } from '@/api/companies';
import { useAuth } from '@/auth/useAuth';
import { useLanguage } from '@/i18n/useLanguage';
import type { Messages } from '@/i18n/en';
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

export function isJustified(a: Absence): boolean {
  return Boolean(a.reason?.trim() || a.justification?.trim());
}

export function absenceDayCount(a: Absence): number {
  if (a.startDate && a.endDate) {
    const days = (new Date(a.endDate).getTime() - new Date(a.startDate).getTime()) / 86_400_000;
    return Math.max(1, Math.round(days) + 1);
  }
  return 1;
}

/** Annual progressive tax for a given taxable income, per IRPP_BRACKET_CEILINGS/RATES. */
export function annualBareme(annualTaxable: number): number {
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
export function marginalIrppRate(annualTaxable: number): number {
  for (let i = 0; i < IRPP_BRACKET_CEILINGS.length; i++) {
    if (annualTaxable <= IRPP_BRACKET_CEILINGS[i]) return IRPP_BRACKET_RATES[i];
  }
  return IRPP_BRACKET_RATES[IRPP_BRACKET_RATES.length - 1];
}

/** Rough estimate only (net salary suggestion) — always editable before saving. */
export function suggestAmounts(personnel: Personnel, month: Month, year: number) {
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

export type PaymentSortKey = 'employee' | 'period' | 'paymentDate' | 'netPay' | 'status';

export function getPaymentSortValue(p: Payment, key: PaymentSortKey): string | number {
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

function StatusBadge({ status, t }: { status?: string; t: Messages }) {
  return status === 'VALIDATED' ? (
    <span className="badge badge--success">{t.payroll.statusValidated}</span>
  ) : (
    <span className="badge badge--warning">{status || t.payroll.statusDraft}</span>
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
  const { t } = useLanguage();
  useEscapeKey(onClose, true);

  const contract = payment.contrat;
  const salaireBase = contract?.salaireBase ?? 0;
  const avantages = contract?.avantages ?? 0;
  const gross = salaireBase + avantages;
  const irppRateLabel = payment.irppRate != null ? `${(payment.irppRate * 100).toFixed(2)}%` : '—';
  const tnd = (v?: number) => (v != null ? `${v.toFixed(3)} TND` : '—');
  const monthLabel = payment.month ? t.months[payment.month] : '';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t.payroll.payslipTitle(monthLabel, payment.year)}</h2>
        {showEmployee && <p className="page__subtitle">{personnelName(payment.personnel)}</p>}

        <div className="contract-panel">
          <div className="contract-panel__grid">
            <div className="contract-panel__item">
              <span className="contract-panel__label">{t.payroll.baseSalary}</span>
              <span className="contract-panel__value">{tnd(salaireBase || undefined)}</span>
            </div>
            <div className="contract-panel__item">
              <span className="contract-panel__label">{t.payroll.benefits}</span>
              <span className="contract-panel__value">{tnd(avantages || undefined)}</span>
            </div>
            <div className="contract-panel__item">
              <span className="contract-panel__label">{t.payroll.gross}</span>
              <span className="contract-panel__value">{tnd(gross || undefined)}</span>
            </div>
            <div className="contract-panel__item">
              <span className="contract-panel__label">{t.payroll.justifiedAbsenceDays}</span>
              <span className="contract-panel__value">{payment.justifiedAbsenceDays ?? '—'}</span>
            </div>
            <div className="contract-panel__item">
              <span className="contract-panel__label">{t.payroll.unjustifiedAbsenceDays}</span>
              <span className="contract-panel__value">{payment.unjustifiedAbsenceDays ?? '—'}</span>
            </div>
            <div className="contract-panel__item">
              <span className="contract-panel__label">{t.payroll.absenceDeduction}</span>
              <span className="contract-panel__value">{tnd(payment.absenceDeduction)}</span>
            </div>
            <div className="contract-panel__item">
              <span className="contract-panel__label">{t.payroll.cnss((CNSS_RATE * 100).toFixed(2))}</span>
              <span className="contract-panel__value">{tnd(payment.montantCnss)}</span>
            </div>
            <div className="contract-panel__item">
              <span className="contract-panel__label">{t.payroll.irpp(irppRateLabel)}</span>
              <span className="contract-panel__value">{tnd(payment.montantIrpp)}</span>
            </div>
            <div className="contract-panel__item">
              <span className="contract-panel__label">{t.payroll.netPay}</span>
              <span className="contract-panel__value">{tnd(payment.payed)}</span>
            </div>
            <div className="contract-panel__item">
              <span className="contract-panel__label">{t.payroll.status}</span>
              <span className="contract-panel__value">
                <StatusBadge status={payment.status} t={t} />
              </span>
            </div>
          </div>
        </div>

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={() => paymentsApi.downloadPayslipPdf(payment.id)}>
            <Receipt size={16} aria-hidden="true" />
            {t.payroll.downloadPdf}
          </button>
          <button type="button" className="btn btn--primary" onClick={onClose}>
            {t.payroll.close}
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
  const { t } = useLanguage();
  const { data: payments, isLoading, isError } = useQuery({
    queryKey: ['payments', 'me'],
    queryFn: paymentsApi.getMine,
  });

  const [viewing, setViewing] = useState<Payment | null>(null);
  const { page, setPage, pageCount, pageItems } = usePagination(payments ?? [], 10);

  return (
    <div>
      <div className="page__header">
        <h1>{t.payroll.my.title}</h1>
        <p className="page__subtitle">{t.payroll.my.subtitle}</p>
      </div>

      {isLoading && <TableSkeleton columns={5} />}
      {isError && <p className="jobs__status">{t.payroll.my.errorLoad}</p>}
      {!isLoading && !isError && (payments?.length ?? 0) === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">{t.common.noRecords}</span>
          <p>{t.payroll.my.noneYet}</p>
        </div>
      )}

      {(payments?.length ?? 0) > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.payroll.my.columnPeriod}</th>
                <th>{t.payroll.my.columnPaymentDate}</th>
                <th>{t.payroll.my.columnNetPay}</th>
                <th>{t.payroll.my.columnStatus}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((p) => (
                <tr key={p.id}>
                  <td data-label={t.payroll.my.columnPeriod}>{p.month ? t.months[p.month] : ''} {p.year}</td>
                  <td data-label={t.payroll.my.columnPaymentDate}>{p.paymentDate || '—'}</td>
                  <td data-label={t.payroll.my.columnNetPay}>{p.payed != null ? `${p.payed.toFixed(3)} TND` : '—'}</td>
                  <td data-label={t.payroll.my.columnStatus}><StatusBadge status={p.status} t={t} /></td>
                  <td className="data-table__actions" data-label="">
                    <IconButton
                      icon={<Eye size={15} aria-hidden="true" />}
                      label={t.payroll.my.viewDetails}
                      onClick={() => setViewing(p)}
                    />
                    <IconButton
                      icon={<Receipt size={15} aria-hidden="true" />}
                      label={t.payroll.my.downloadPdf}
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
  const { t } = useLanguage();
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
      toast.showSuccess(t.payroll.manage.createdSuccess);
    },
    onError: (err) => setFormError(getErrorMessage(err, t.payroll.manage.errorCreate)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ReturnType<typeof buildPayload> }) =>
      paymentsApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setEditing(null);
      setFormError(null);
      toast.showSuccess(t.payroll.manage.updatedSuccess);
    },
    onError: (err) => setFormError(getErrorMessage(err, t.payroll.manage.errorUpdate)),
  });

  const validateMutation = useMutation({
    mutationFn: paymentsApi.validate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast.showSuccess(t.payroll.manage.validatedSuccess);
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.payroll.manage.errorValidate)),
  });

  const deleteMutation = useMutation({
    mutationFn: paymentsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast.showSuccess(t.payroll.manage.deletedSuccess);
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.payroll.manage.errorDelete)),
  });

  const generateMutation = useMutation({
    mutationFn: () => paymentsApi.generate(generateMonth, generateYear, generateCompanyId || undefined),
    onSuccess: (summary) => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setGenerateResult(summary);
      setGenerateError(null);
    },
    onError: (err) => setGenerateError(getErrorMessage(err, t.payroll.manage.errorGenerate)),
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
      setGenerateError(t.payroll.manage.errorSelectCompany);
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
      setFormError(t.payroll.manage.errorSelectEmployee);
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
      title: t.payroll.manage.deleteTitle,
      message: t.payroll.manage.deleteMessage(personnelName(p.personnel)),
      confirmLabel: t.payroll.manage.delete,
      variant: 'danger',
      onConfirm: () => deleteMutation.mutate(p.id),
    });
  };

  return (
    <div>
      <div className="page__header page__header--row">
        <div>
          <h1>{t.payroll.manage.title}</h1>
          <p className="page__subtitle">{t.payroll.manage.subtitle}</p>
        </div>
        <div className="page__header-actions">
          <button className="btn btn--ghost" onClick={() => paymentsApi.exportCsv()}>
            <Download size={16} aria-hidden="true" />
            {t.payroll.manage.exportCsv}
          </button>
          <button className="btn btn--ghost" onClick={openGenerateModal}>
            <Calculator size={16} aria-hidden="true" />
            {t.payroll.manage.generatePayroll}
          </button>
          <button className="btn btn--primary" onClick={openAddModal}>
            <Plus size={16} aria-hidden="true" />
            {t.payroll.manage.addPayment}
          </button>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="toolbar__search"
          type="search"
          placeholder={t.payroll.manage.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && <TableSkeleton columns={6} />}
      {isError && <p className="jobs__status">{t.payroll.manage.errorLoad}</p>}
      {!isLoading && !isError && filtered.length === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">{t.common.noRecords}</span>
          <p>{search ? t.payroll.manage.noneMatchSearch : t.payroll.manage.noneYet}</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <SortableTh
                  label={t.payroll.manage.columnEmployee}
                  sortKey="employee"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={toggleSort}
                />
                <SortableTh label={t.payroll.my.columnPeriod} sortKey="period" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh
                  label={t.payroll.my.columnPaymentDate}
                  sortKey="paymentDate"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={toggleSort}
                />
                <SortableTh label={t.payroll.my.columnNetPay} sortKey="netPay" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh label={t.payroll.my.columnStatus} sortKey="status" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((p) => (
                <tr key={p.id}>
                  <td data-label={t.payroll.manage.columnEmployee}>{personnelName(p.personnel)}</td>
                  <td data-label={t.payroll.my.columnPeriod}>{p.month ? t.months[p.month] : ''} {p.year}</td>
                  <td data-label={t.payroll.my.columnPaymentDate}>{p.paymentDate || '—'}</td>
                  <td data-label={t.payroll.my.columnNetPay}>{p.payed != null ? `${p.payed.toFixed(3)} TND` : '—'}</td>
                  <td data-label={t.payroll.my.columnStatus}><StatusBadge status={p.status} t={t} /></td>
                  <td className="data-table__actions" data-label="">
                    <IconButton
                      icon={<Eye size={15} aria-hidden="true" />}
                      label={t.payroll.my.viewDetails}
                      onClick={() => setViewing(p)}
                    />
                    <IconButton
                      icon={<Receipt size={15} aria-hidden="true" />}
                      label={t.payroll.manage.downloadPayslipPdf}
                      onClick={() => paymentsApi.downloadPayslipPdf(p.id)}
                    />
                    <RowActionsMenu
                      ariaLabel={`Actions for the payment of ${personnelName(p.personnel)}`}
                      items={[
                        { label: t.payroll.manage.edit, icon: <Pencil size={15} aria-hidden="true" />, onClick: () => openEditModal(p) },
                        ...(p.status !== 'VALIDATED'
                          ? [
                              {
                                label: t.payroll.manage.validate,
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
                                label: t.payroll.manage.delete,
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
            <h2>{t.payroll.manage.addModalTitle}</h2>
            <form onSubmit={handleCreateSubmit}>
              {formError && <div className="alert alert--error">{formError}</div>}
              <div className="fieldset">
                <label className="field">
                  <span>{t.payroll.manage.employee}</span>
                  <select
                    value={form.personnelId}
                    onChange={(e) => setForm((f) => ({ ...f, personnelId: Number(e.target.value) || '' }))}
                    required
                  >
                    <option value="">{t.payroll.manage.selectEmployee}</option>
                    {(personnelList ?? []).map((p) => (
                      <option key={p.idPersonnel} value={p.idPersonnel}>
                        {personnelName(p)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="field-row">
                  <label className="field">
                    <span>{t.payroll.manage.month}</span>
                    <select value={form.month} onChange={(e) => setForm((f) => ({ ...f, month: e.target.value as Month }))}>
                      {MONTHS.map((m) => (
                        <option key={m} value={m}>{t.months[m]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>{t.payroll.manage.year}</span>
                    <input
                      type="number"
                      value={form.year}
                      onChange={(e) => setForm((f) => ({ ...f, year: Number(e.target.value) }))}
                      required
                    />
                  </label>
                </div>
                <label className="field">
                  <span>{t.payroll.manage.paymentDateOptional}</span>
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
                    title={selectedPersonnel ? undefined : t.payroll.manage.selectEmployeeFirst}
                  >
                    {t.payroll.manage.suggestAmounts}
                  </button>
                </div>
                <div className="field-row">
                  <label className="field">
                    <span>{t.payroll.manage.cnssRate}</span>
                    <input
                      type="number"
                      step="0.001"
                      value={form.montantCnss}
                      onChange={(e) => setForm((f) => ({ ...f, montantCnss: e.target.value ? Number(e.target.value) : '' }))}
                    />
                  </label>
                  <label className="field">
                    <span>{t.payroll.manage.irppLabel}</span>
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
                    <span>{t.payroll.manage.justifiedAbsenceDays}</span>
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
                    <span>{t.payroll.manage.unjustifiedAbsenceDays}</span>
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
                    <span>{t.payroll.manage.absenceDeduction}</span>
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
                    <span>{t.payroll.manage.irppRatePercent}</span>
                    <input
                      type="number"
                      step="0.01"
                      value={form.irppRate}
                      onChange={(e) => setForm((f) => ({ ...f, irppRate: e.target.value ? Number(e.target.value) : '' }))}
                    />
                  </label>
                </div>
                <label className="field">
                  <span>{t.payroll.manage.netPay}</span>
                  <input
                    type="number"
                    step="0.001"
                    value={form.payed}
                    onChange={(e) => setForm((f) => ({ ...f, payed: e.target.value ? Number(e.target.value) : '' }))}
                  />
                </label>
                <p className="field-hint">{t.payroll.manage.manualAmountsHint}</p>
              </div>

              <div className="modal__actions">
                <button type="button" className="btn btn--ghost" onClick={() => setShowAddModal(false)}>
                  {t.payroll.manage.cancel}
                </button>
                <button className="btn btn--primary" type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? t.payroll.manage.creating : t.payroll.manage.createPayment}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t.payroll.manage.editModalTitle(personnelName(editing.personnel))}</h2>
            <form onSubmit={handleEditSubmit}>
              {formError && <div className="alert alert--error">{formError}</div>}
              <div className="fieldset">
                <div className="field-row">
                  <label className="field">
                    <span>{t.payroll.manage.month}</span>
                    <select value={form.month} onChange={(e) => setForm((f) => ({ ...f, month: e.target.value as Month }))}>
                      {MONTHS.map((m) => (
                        <option key={m} value={m}>{t.months[m]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>{t.payroll.manage.year}</span>
                    <input
                      type="number"
                      value={form.year}
                      onChange={(e) => setForm((f) => ({ ...f, year: Number(e.target.value) }))}
                      required
                    />
                  </label>
                </div>
                <label className="field">
                  <span>{t.payroll.manage.paymentDateOptional}</span>
                  <input
                    type="date"
                    value={form.paymentDate}
                    onChange={(e) => setForm((f) => ({ ...f, paymentDate: e.target.value }))}
                  />
                </label>
                <div className="field-row">
                  <label className="field">
                    <span>{t.payroll.manage.cnssRate}</span>
                    <input
                      type="number"
                      step="0.001"
                      value={form.montantCnss}
                      onChange={(e) => setForm((f) => ({ ...f, montantCnss: e.target.value ? Number(e.target.value) : '' }))}
                    />
                  </label>
                  <label className="field">
                    <span>{t.payroll.manage.irppLabel}</span>
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
                    <span>{t.payroll.manage.justifiedAbsenceDays}</span>
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
                    <span>{t.payroll.manage.unjustifiedAbsenceDays}</span>
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
                    <span>{t.payroll.manage.absenceDeduction}</span>
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
                    <span>{t.payroll.manage.irppRatePercent}</span>
                    <input
                      type="number"
                      step="0.01"
                      value={form.irppRate}
                      onChange={(e) => setForm((f) => ({ ...f, irppRate: e.target.value ? Number(e.target.value) : '' }))}
                    />
                  </label>
                </div>
                <label className="field">
                  <span>{t.payroll.manage.netPay}</span>
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
                  {t.payroll.manage.cancel}
                </button>
                <button className="btn btn--primary" type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? t.payroll.manage.saving : t.payroll.manage.saveChanges}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showGenerateModal && (
        <div className="modal-overlay" onClick={closeGenerateModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t.payroll.manage.generateModalTitle}</h2>
            {!generateResult ? (
              <form onSubmit={handleGenerateSubmit}>
                {generateError && <div className="alert alert--error">{generateError}</div>}
                <p className="field-hint">{t.payroll.manage.generateHint}</p>
                <div className="fieldset">
                  <div className="field-row">
                    <label className="field">
                      <span>{t.payroll.manage.month}</span>
                      <select value={generateMonth} onChange={(e) => setGenerateMonth(e.target.value as Month)}>
                        {MONTHS.map((m) => (
                          <option key={m} value={m}>{t.months[m]}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>{t.payroll.manage.year}</span>
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
                      <span>{t.payroll.manage.company}</span>
                      <select
                        value={generateCompanyId}
                        onChange={(e) => setGenerateCompanyId(Number(e.target.value) || '')}
                        required
                      >
                        <option value="">{t.payroll.manage.selectCompany}</option>
                        {(companies ?? []).map((c) => (
                          <option key={c.idCompany} value={c.idCompany}>{c.companyName}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                <div className="modal__actions">
                  <button type="button" className="btn btn--ghost" onClick={closeGenerateModal}>
                    {t.payroll.manage.cancel}
                  </button>
                  <button className="btn btn--primary" type="submit" disabled={generateMutation.isPending}>
                    {generateMutation.isPending ? t.payroll.manage.generating : t.payroll.manage.generate}
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <div className="alert alert--success">
                  {t.payroll.manage.generatedSummary(generateResult.created.length, t.months[generateMonth], generateYear)}
                </div>
                {generateResult.alreadyGenerated > 0 && (
                  <p className="field-hint">
                    {t.payroll.manage.alreadyGeneratedSummary(generateResult.alreadyGenerated)}
                  </p>
                )}
                {generateResult.skippedNoActiveContract > 0 && (
                  <p className="field-hint">
                    {t.payroll.manage.skippedNoContractSummary(generateResult.skippedNoActiveContract)}
                  </p>
                )}
                <div className="modal__actions">
                  <button className="btn btn--primary" onClick={closeGenerateModal}>
                    {t.payroll.manage.done}
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

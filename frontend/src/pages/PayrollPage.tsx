import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { paymentsApi } from '@/api/payments';
import { personnelApi } from '@/api/personnel';
import { companiesApi } from '@/api/companies';
import { useAuth } from '@/auth/useAuth';
import { getErrorMessage } from '@/lib/errors';
import { usePagination } from '@/lib/usePagination';
import { useEscapeKey } from '@/lib/useEscapeKey';
import { IconButton } from '@/components/IconButton';
import { Pagination } from '@/components/Pagination';
import { useToast } from '@/components/ToastProvider';
import type { Absence, Month, Payment, PayrollGenerationSummary, Personnel } from '@/types';

const MONTHS: Month[] = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];

const CNSS_RATE = 0.0918; // matches the 9.18% rate PdfService labels on the payslip

const EMPTY_FORM = {
  personnelId: '' as number | '',
  month: 'JANUARY' as Month,
  year: new Date().getFullYear(),
  paymentDate: '',
  montantCnss: '' as number | '',
  montantIrpp: '' as number | '',
  payed: '' as number | '',
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

/** Rough estimate only (net salary suggestion) — always editable before saving. */
function suggestAmounts(personnel: Personnel, month: Month, year: number) {
  const contract = personnel.contract;
  const salaireBase = contract?.salaireBase ?? 0;
  const avantages = contract?.avantages ?? 0;
  const grossBase = salaireBase + avantages;
  const dailyRate = salaireBase / 22;

  const monthPrefix = `${year}-${String(MONTHS.indexOf(month) + 1).padStart(2, '0')}`;
  const nonJustifiedDays = (personnel.absences ?? [])
    .filter((a) => !isJustified(a))
    .filter((a) => (a.dateAbsence ?? a.startDate ?? '').startsWith(monthPrefix))
    .reduce((sum, a) => sum + absenceDayCount(a), 0);

  const deduction = dailyRate * nonJustifiedDays;
  const montantCnss = Math.round(grossBase * CNSS_RATE * 1000) / 1000;
  const payed = Math.round((grossBase - deduction - montantCnss) * 1000) / 1000;

  return { montantCnss, payed, nonJustifiedDays, grossBase };
}

function StatusBadge({ status }: { status?: string }) {
  return status === 'VALIDATED' ? (
    <span className="badge badge--soft">Validated</span>
  ) : (
    <span className="badge badge--muted">{status || 'Draft'}</span>
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

  const { page, setPage, pageCount, pageItems } = usePagination(payments ?? [], 10);

  return (
    <div>
      <div className="page__header">
        <h1>My payslips</h1>
        <p className="page__subtitle">Your payment history.</p>
      </div>

      {isLoading && <p className="jobs__status">Loading your payslips…</p>}
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
                  <td>{p.month} {p.year}</td>
                  <td>{p.paymentDate || '—'}</td>
                  <td>{p.payed != null ? `${p.payed.toFixed(3)} TND` : '—'}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td className="data-table__actions">
                    <IconButton icon="🧾" label="Download PDF" onClick={() => paymentsApi.downloadPayslipPdf(p.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
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

  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);
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
      payed: f.payed === '' ? undefined : Number(f.payed),
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

  const { page, setPage, pageCount, pageItems } = usePagination(filtered, 10);

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
      payed: p.payed ?? '',
    });
    setFormError(null);
  };

  const applySuggestion = () => {
    if (!selectedPersonnel) return;
    const { montantCnss, payed } = suggestAmounts(selectedPersonnel, form.month, Number(form.year));
    setForm((f) => ({ ...f, montantCnss, payed }));
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
    if (!window.confirm(`Delete this payment for ${personnelName(p.personnel)}? This cannot be undone.`)) return;
    deleteMutation.mutate(p.id);
  };

  return (
    <div>
      <div className="page__header page__header--row">
        <div>
          <h1>Payroll</h1>
          <p className="page__subtitle">Record and validate employee payments.</p>
        </div>
        <div className="page__header-actions">
          <button className="btn btn--ghost" onClick={openGenerateModal}>
            🧮 Generate payroll
          </button>
          <button className="btn btn--primary" onClick={openAddModal}>
            + Add payment
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

      {isLoading && <p className="jobs__status">Loading payments…</p>}
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
                <th>Employee</th>
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
                  <td>{personnelName(p.personnel)}</td>
                  <td>{p.month} {p.year}</td>
                  <td>{p.paymentDate || '—'}</td>
                  <td>{p.payed != null ? `${p.payed.toFixed(3)} TND` : '—'}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td className="data-table__actions">
                    <IconButton icon="✏️" label="Edit" onClick={() => openEditModal(p)} />
                    {p.status !== 'VALIDATED' && (
                      <IconButton
                        icon="✅"
                        label="Validate"
                        onClick={() => validateMutation.mutate(p.id)}
                        disabled={validateMutation.isPending}
                      />
                    )}
                    <IconButton icon="🧾" label="Download payslip PDF" onClick={() => paymentsApi.downloadPayslipPdf(p.id)} />
                    {isAdmin && (
                      <IconButton
                        icon="🗑️"
                        label="Delete"
                        variant="danger"
                        onClick={() => handleDelete(p)}
                        disabled={deleteMutation.isPending}
                      />
                    )}
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
                  estimate from the employee's contract and unjustified absences, always
                  editable before saving.
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
                  CNSS (9.18%), IRPP and net pay are computed automatically from each contract;
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
    </div>
  );
}

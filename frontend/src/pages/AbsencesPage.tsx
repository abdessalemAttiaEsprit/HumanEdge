import { useMemo, useState, type FormEvent, type ReactElement } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Check, Download, Paperclip, Pencil, Plus, Trash2, X } from 'lucide-react';
import { absencesApi } from '@/api/absences';
import { personnelApi } from '@/api/personnel';
import { useAuth } from '@/auth/useAuth';
import { useLanguage } from '@/i18n/useLanguage';
import type { Messages } from '@/i18n/en';
import { getErrorMessage } from '@/lib/errors';
import { usePagination } from '@/lib/usePagination';
import { useConfirm } from '@/lib/useConfirm';
import { useSort } from '@/lib/useSort';
import { IconButton } from '@/components/IconButton';
import { Pagination } from '@/components/Pagination';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TableSkeleton } from '@/components/TableSkeleton';
import { SortableTh } from '@/components/SortableTh';
import { RowActionsMenu } from '@/components/RowActionsMenu';
import { useToast } from '@/components/ToastProvider';
import type { Absence, AbsenceCreateRequest, AbsenceStatus, Personnel, QuotaSnapshot } from '@/types';

type DateMode = 'single' | 'range';

const EMPTY_FORM = {
  mode: 'single' as DateMode,
  dateAbsence: '',
  startDate: '',
  endDate: '',
  reason: '',
};

/** Absent status = created before this workflow existed; treat exactly like APPROVED (see AbsenceQuotaCalculator#isApproved). */
export function effectiveStatus(a: Absence): AbsenceStatus {
  return a.status ?? 'APPROVED';
}

const STATUS_SORT_RANK: Record<AbsenceStatus, number> = { PENDING: 0, APPROVED: 1, REJECTED: 2 };

function StatusBadge({ status, t }: { status: AbsenceStatus; t: Messages }): ReactElement {
  if (status === 'PENDING') return <span className="badge badge--warning">{t.absences.statusPending}</span>;
  if (status === 'REJECTED') return <span className="badge badge--danger">{t.absences.statusRejected}</span>;
  return <span className="badge badge--success">{t.absences.statusApproved}</span>;
}

function formatDates(a: Absence, fromDate: (date: string) => string): string {
  if (a.dateAbsence) return a.dateAbsence;
  if (a.startDate && a.endDate) return `${a.startDate} → ${a.endDate}`;
  if (a.startDate) return fromDate(a.startDate);
  return '—';
}

function personnelName(p?: Personnel): string {
  if (!p?.user) return '—';
  return `${p.user.firstname} ${p.user.lastname}`;
}

type AbsenceSortKey = 'employee' | 'date' | 'reason' | 'status';

function QuotaPanel({ quota, t }: { quota: QuotaSnapshot; t: Messages }) {
  return (
    <div className="quota-panel">
      <div className="quota-panel__item">
        <span className="quota-panel__value">{quota.remainingDays.toFixed(1)}</span>
        <span className="quota-panel__label">{t.absences.quota.daysRemaining}</span>
      </div>
      <div className="quota-panel__item">
        <span className="quota-panel__value">{quota.earnedDaysThisYear.toFixed(1)}</span>
        <span className="quota-panel__label">{t.absences.quota.earnedThisYear}</span>
      </div>
      <div className="quota-panel__item">
        <span className="quota-panel__value">{quota.carriedOverDays.toFixed(1)}</span>
        <span className="quota-panel__label">{t.absences.quota.carriedOver}</span>
      </div>
      <div className="quota-panel__item">
        <span className="quota-panel__value">{quota.usedJustifiedDaysThisYear}</span>
        <span className="quota-panel__label">{t.absences.quota.usedJustified}</span>
      </div>
    </div>
  );
}

function DateModeFields({
  mode,
  dateAbsence,
  startDate,
  endDate,
  onChange,
  t,
}: {
  mode: DateMode;
  dateAbsence: string;
  startDate: string;
  endDate: string;
  onChange: (patch: Partial<typeof EMPTY_FORM>) => void;
  t: Messages;
}) {
  return (
    <>
      <label className="field">
        <span>{t.absences.type}</span>
        <select value={mode} onChange={(e) => onChange({ mode: e.target.value as DateMode })}>
          <option value="single">{t.absences.singleDay}</option>
          <option value="range">{t.absences.dateRange}</option>
        </select>
      </label>
      {mode === 'single' ? (
        <label className="field">
          <span>{t.absences.date}</span>
          <input
            type="date"
            value={dateAbsence}
            onChange={(e) => onChange({ dateAbsence: e.target.value })}
            required
          />
        </label>
      ) : (
        <div className="field-row">
          <label className="field">
            <span>{t.absences.startDate}</span>
            <input type="date" value={startDate} onChange={(e) => onChange({ startDate: e.target.value })} required />
          </label>
          <label className="field">
            <span>{t.absences.endDate}</span>
            <input type="date" value={endDate} onChange={(e) => onChange({ endDate: e.target.value })} required />
          </label>
        </div>
      )}
    </>
  );
}

export function AbsencesPage() {
  const { user } = useAuth();
  return user?.role === 'EMPLOYE' ? <MyAbsences /> : <ManagerAbsences />;
}

// ============================================================================
// EMPLOYE: self-service — view own absences/quota, request a new one.
// ============================================================================
function MyAbsences() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [justificationFile, setJustificationFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: me, isLoading, isError } = useQuery({
    queryKey: ['personnel', 'me'],
    queryFn: personnelApi.getMine,
  });

  const { data: quota } = useQuery({
    queryKey: ['absence-quota', me?.idPersonnel],
    queryFn: () => absencesApi.getQuota(me!.idPersonnel),
    enabled: !!me,
  });

  const createMutation = useMutation({
    mutationFn: absencesApi.create,
    onSuccess: async (created) => {
      if (justificationFile) {
        try {
          await absencesApi.uploadJustification(created.idAbsence, justificationFile);
        } catch {
          // The absence request itself was submitted successfully either way.
        }
      }
      queryClient.invalidateQueries({ queryKey: ['personnel', 'me'] });
      queryClient.invalidateQueries({ queryKey: ['absence-quota'] });
      setShowAddModal(false);
      setForm(EMPTY_FORM);
      setJustificationFile(null);
      setFormError(null);
      toast.showSuccess(t.absences.my.successSubmit);
    },
    onError: (err) => {
      const message = getErrorMessage(err, t.absences.my.errorSubmit);
      setFormError(message);
      toast.showError(message);
    },
  });

  const absences = useMemo(
    () => [...(me?.absences ?? [])].sort((a, b) => (b.dateAbsence ?? b.startDate ?? '').localeCompare(a.dateAbsence ?? a.startDate ?? '')),
    [me],
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!me) return;
    setFormError(null);
    const payload: AbsenceCreateRequest = {
      personnel: { idPersonnel: me.idPersonnel },
      reason: form.reason || undefined,
      ...(form.mode === 'single'
        ? { dateAbsence: form.dateAbsence }
        : { startDate: form.startDate, endDate: form.endDate }),
    };
    createMutation.mutate(payload);
  };

  if (isLoading) return <p className="jobs__status">{t.absences.my.loading}</p>;
  if (isError || !me) return <p className="jobs__status">{t.absences.my.errorLoad}</p>;

  return (
    <div>
      <div className="page__header page__header--row">
        <div>
          <h1>{t.absences.my.title}</h1>
          <p className="page__subtitle">{t.absences.my.subtitle}</p>
        </div>
        <button className="btn btn--primary" onClick={() => setShowAddModal(true)}>
          {t.absences.my.requestAbsence}
        </button>
      </div>

      {quota && (
        <>
          <QuotaPanel quota={quota} t={t} />
          <p className="field-hint">{t.absences.my.pendingHint}</p>
        </>
      )}

      {absences.length === 0 ? (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">{t.common.noRecords}</span>
          <p>{t.absences.my.noneYet}</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.absences.my.columnDates}</th>
                <th>{t.absences.my.columnReason}</th>
                <th>{t.absences.my.columnJustification}</th>
                <th>{t.absences.my.columnStatus}</th>
              </tr>
            </thead>
            <tbody>
              {absences.map((a) => (
                <tr key={a.idAbsence}>
                  <td data-label={t.absences.my.columnDates}>{formatDates(a, t.absences.fromDate)}</td>
                  <td data-label={t.absences.my.columnReason}>{a.reason || '—'}</td>
                  <td data-label={t.absences.my.columnJustification}>
                    {a.justification ? (
                      <IconButton
                        icon={<Paperclip size={15} aria-hidden="true" />}
                        label={t.absences.my.downloadJustification}
                        onClick={() => absencesApi.downloadJustification(a.idAbsence, a.justification)}
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td data-label={t.absences.my.columnStatus}>
                    <StatusBadge status={effectiveStatus(a)} t={t} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t.absences.my.requestModalTitle}</h2>
            <form onSubmit={handleSubmit}>
              {formError && <div className="alert alert--error">{formError}</div>}
              <div className="fieldset">
                <DateModeFields
                  mode={form.mode}
                  dateAbsence={form.dateAbsence}
                  startDate={form.startDate}
                  endDate={form.endDate}
                  onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
                  t={t}
                />
                <label className="field">
                  <span>{t.absences.reason}</span>
                  <input
                    value={form.reason}
                    onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                    placeholder={t.absences.reasonPlaceholder}
                  />
                </label>
                <label className="field">
                  <span>{t.absences.justificationDocOptional}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif,application/pdf,.doc,.docx"
                    onChange={(e) => setJustificationFile(e.target.files?.[0] ?? null)}
                  />
                  <span className="field-hint">{t.absences.justificationHint}</span>
                </label>
              </div>
              <div className="modal__actions">
                <button type="button" className="btn btn--ghost" onClick={() => setShowAddModal(false)}>
                  {t.absences.cancel}
                </button>
                <button className="btn btn--primary" type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? t.absences.my.submitting : t.absences.my.submitRequest}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ADMIN / COMPANY: manage absences across (their) personnel.
// ============================================================================
function ManagerAbsences() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { confirmOptions, requestConfirm, closeConfirm, handleConfirm } = useConfirm();
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editing, setEditing] = useState<Absence | null>(null);
  const [quotaFor, setQuotaFor] = useState<Personnel | null>(null);
  const [selectedPersonnelId, setSelectedPersonnelId] = useState<number | ''>('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [justificationFile, setJustificationFile] = useState<File | null>(null);
  const [justificationError, setJustificationError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: absences, isLoading, isError } = useQuery({
    queryKey: ['absences'],
    queryFn: absencesApi.list,
  });

  const { data: personnelList } = useQuery({
    queryKey: ['personnel'],
    queryFn: personnelApi.list,
  });

  const { data: quota } = useQuery({
    queryKey: ['absence-quota', quotaFor?.idPersonnel],
    queryFn: () => absencesApi.getQuota(quotaFor!.idPersonnel),
    enabled: !!quotaFor,
  });

  // Absence.personnel is never serialized on read (JsonBackReference), so the employee
  // for a given absence is looked up from the Personnel list instead (personnel.absences
  // *is* serialized there) — same workaround as Contract.personnel on the Contracts page.
  const personnelByAbsenceId = useMemo(() => {
    const map = new Map<number, Personnel>();
    (personnelList ?? []).forEach((p) => {
      (p.absences ?? []).forEach((a) => map.set(a.idAbsence, p));
    });
    return map;
  }, [personnelList]);

  const createMutation = useMutation({
    mutationFn: absencesApi.create,
    onSuccess: async (created) => {
      if (justificationFile) {
        try {
          await absencesApi.uploadJustification(created.idAbsence, justificationFile);
        } catch {
          // The absence itself was created successfully either way.
        }
      }
      // Also invalidate personnel: personnel.absences is where the employee lookup for
      // each row comes from (see personnelByAbsenceId above), since Absence.personnel
      // itself is never serialized on read.
      queryClient.invalidateQueries({ queryKey: ['absences'] });
      queryClient.invalidateQueries({ queryKey: ['personnel'] });
      setShowAddModal(false);
      setForm(EMPTY_FORM);
      setJustificationFile(null);
      setSelectedPersonnelId('');
      setFormError(null);
      toast.showSuccess(t.absences.manager.createdSuccess);
    },
    onError: (err) => {
      const message = getErrorMessage(err, t.absences.manager.errorCreate);
      setFormError(message);
      toast.showError(message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ReturnType<typeof buildPayload> }) =>
      absencesApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['absences'] });
      setEditing(null);
      setFormError(null);
      toast.showSuccess(t.absences.manager.updatedSuccess);
    },
    onError: (err) => {
      const message = getErrorMessage(err, t.absences.manager.errorUpdate);
      setFormError(message);
      toast.showError(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: absencesApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['absences'] });
      queryClient.invalidateQueries({ queryKey: ['personnel'] });
      toast.showSuccess(t.absences.manager.deletedSuccess);
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.absences.manager.errorDelete)),
  });

  const approveMutation = useMutation({
    mutationFn: absencesApi.approve,
    onSuccess: () => {
      // Le quota/paie de l'employé dépend maintenant du statut : invalider aussi personnel.
      queryClient.invalidateQueries({ queryKey: ['absences'] });
      queryClient.invalidateQueries({ queryKey: ['personnel'] });
      queryClient.invalidateQueries({ queryKey: ['absence-quota'] });
      toast.showSuccess(t.absences.manager.approvedSuccess);
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.absences.manager.errorApprove)),
  });

  const rejectMutation = useMutation({
    mutationFn: absencesApi.reject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['absences'] });
      queryClient.invalidateQueries({ queryKey: ['personnel'] });
      queryClient.invalidateQueries({ queryKey: ['absence-quota'] });
      toast.showSuccess(t.absences.manager.rejectedSuccess);
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.absences.manager.errorReject)),
  });

  const uploadJustificationMutation = useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => absencesApi.uploadJustification(id, file),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['absences'] });
      setEditing(updated);
      setJustificationError(null);
      toast.showSuccess(t.absences.manager.justificationUploadedSuccess);
    },
    onError: (err) => {
      const message = getErrorMessage(err, t.absences.manager.errorUploadJustification);
      setJustificationError(message);
      toast.showError(message);
    },
  });

  function buildPayload(f: typeof EMPTY_FORM) {
    return {
      reason: f.reason || undefined,
      dateAbsence: f.mode === 'single' ? f.dateAbsence : undefined,
      startDate: f.mode === 'range' ? f.startDate : undefined,
      endDate: f.mode === 'range' ? f.endDate : undefined,
    };
  }

  const filtered = useMemo(() => {
    if (!absences) return [];
    const q = search.trim().toLowerCase();
    if (!q) return absences;
    return absences.filter((a) => {
      const employee = personnelName(personnelByAbsenceId.get(a.idAbsence));
      const haystack = [employee, a.reason].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [absences, search, personnelByAbsenceId]);

  const getAbsenceSortValue = (a: Absence, key: AbsenceSortKey): string | number => {
    switch (key) {
      case 'employee':
        return personnelName(personnelByAbsenceId.get(a.idAbsence));
      case 'date':
        return a.dateAbsence ?? a.startDate ?? '';
      case 'reason':
        return a.reason ?? '';
      case 'status':
        return STATUS_SORT_RANK[effectiveStatus(a)];
    }
  };

  const { sorted, sortKey, direction, toggleSort } = useSort<Absence, AbsenceSortKey>(filtered, getAbsenceSortValue);
  const { page, setPage, pageCount, pageItems } = usePagination(sorted, 10);

  const openAddModal = () => {
    setForm(EMPTY_FORM);
    setJustificationFile(null);
    setSelectedPersonnelId('');
    setFormError(null);
    setShowAddModal(true);
  };

  const openEditModal = (a: Absence) => {
    setEditing(a);
    setForm({
      mode: a.startDate ? 'range' : 'single',
      dateAbsence: a.dateAbsence ?? '',
      startDate: a.startDate ?? '',
      endDate: a.endDate ?? '',
      reason: a.reason ?? '',
    });
    setFormError(null);
    setJustificationError(null);
  };

  const handleEditJustificationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editing) return;
    uploadJustificationMutation.mutate({ id: editing.idAbsence, file });
    e.target.value = '';
  };

  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!selectedPersonnelId) {
      setFormError(t.absences.manager.errorSelectEmployee);
      return;
    }
    createMutation.mutate({ ...buildPayload(form), personnel: { idPersonnel: selectedPersonnelId } });
  };

  const handleEditSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setFormError(null);
    updateMutation.mutate({ id: editing.idAbsence, payload: buildPayload(form) });
  };

  const handleDelete = (a: Absence) => {
    const employee = personnelName(personnelByAbsenceId.get(a.idAbsence));
    requestConfirm({
      title: t.absences.manager.deleteTitle,
      message: t.absences.manager.deleteMessage(employee),
      confirmLabel: t.absences.manager.delete,
      variant: 'danger',
      onConfirm: () => deleteMutation.mutate(a.idAbsence),
    });
  };

  const handleReject = (a: Absence) => {
    const employee = personnelName(personnelByAbsenceId.get(a.idAbsence));
    requestConfirm({
      title: t.absences.manager.rejectTitle,
      message: t.absences.manager.rejectMessage(employee),
      confirmLabel: t.absences.manager.reject,
      variant: 'danger',
      onConfirm: () => rejectMutation.mutate(a.idAbsence),
    });
  };

  return (
    <div>
      <div className="page__header page__header--row">
        <div>
          <h1>{t.absences.manager.title}</h1>
          <p className="page__subtitle">{t.absences.manager.subtitle}</p>
        </div>
        <div className="page__header-actions">
          <button className="btn btn--ghost" onClick={() => absencesApi.exportCsv()}>
            <Download size={16} aria-hidden="true" />
            {t.absences.manager.exportCsv}
          </button>
          <button className="btn btn--primary" onClick={openAddModal}>
            <Plus size={16} aria-hidden="true" />
            {t.absences.manager.addAbsence}
          </button>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="toolbar__search"
          type="search"
          placeholder={t.absences.manager.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && <TableSkeleton columns={5} />}
      {isError && <p className="jobs__status">{t.absences.manager.errorLoad}</p>}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">{t.common.noRecords}</span>
          <p>{search ? t.absences.manager.noneMatchSearch : t.absences.manager.noneYet}</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <SortableTh
                  label={t.absences.manager.columnEmployee}
                  sortKey="employee"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={toggleSort}
                />
                <SortableTh label={t.absences.my.columnDates} sortKey="date" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh label={t.absences.reason} sortKey="reason" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh label={t.absences.my.columnStatus} sortKey="status" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((a) => {
                const employee = personnelByAbsenceId.get(a.idAbsence);
                return (
                  <tr key={a.idAbsence}>
                    <td data-label={t.absences.manager.columnEmployee}>{personnelName(employee)}</td>
                    <td data-label={t.absences.my.columnDates}>{formatDates(a, t.absences.fromDate)}</td>
                    <td data-label={t.absences.reason}>{a.reason || '—'}</td>
                    <td data-label={t.absences.my.columnStatus}>
                      <StatusBadge status={effectiveStatus(a)} t={t} />
                    </td>
                    <td className="data-table__actions" data-label="">
                      {a.justification && (
                        <IconButton
                          icon={<Paperclip size={15} aria-hidden="true" />}
                          label={t.absences.manager.downloadJustification}
                          onClick={() => absencesApi.downloadJustification(a.idAbsence, a.justification)}
                        />
                      )}
                      <RowActionsMenu
                        ariaLabel={`Actions for the absence of ${personnelName(employee)}`}
                        items={[
                          ...(effectiveStatus(a) === 'PENDING'
                            ? [
                                {
                                  label: t.absences.manager.approve,
                                  icon: <Check size={15} aria-hidden="true" />,
                                  disabled: approveMutation.isPending,
                                  onClick: () => approveMutation.mutate(a.idAbsence),
                                },
                                {
                                  label: t.absences.manager.reject,
                                  icon: <X size={15} aria-hidden="true" />,
                                  danger: true,
                                  disabled: rejectMutation.isPending,
                                  onClick: () => handleReject(a),
                                },
                              ]
                            : []),
                          { label: t.absences.manager.edit, icon: <Pencil size={15} aria-hidden="true" />, onClick: () => openEditModal(a) },
                          {
                            label: t.absences.manager.viewQuota,
                            icon: <BarChart3 size={15} aria-hidden="true" />,
                            disabled: !employee,
                            onClick: () => employee && setQuotaFor(employee),
                          },
                          {
                            label: t.absences.manager.delete,
                            icon: <Trash2 size={15} aria-hidden="true" />,
                            danger: true,
                            disabled: deleteMutation.isPending,
                            onClick: () => handleDelete(a),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t.absences.manager.addModalTitle}</h2>
            <form onSubmit={handleCreateSubmit}>
              {formError && <div className="alert alert--error">{formError}</div>}
              <div className="fieldset">
                <label className="field">
                  <span>{t.absences.manager.employee}</span>
                  <select
                    value={selectedPersonnelId}
                    onChange={(e) => setSelectedPersonnelId(Number(e.target.value) || '')}
                    required
                  >
                    <option value="">{t.absences.manager.selectEmployee}</option>
                    {(personnelList ?? []).map((p) => (
                      <option key={p.idPersonnel} value={p.idPersonnel}>
                        {personnelName(p)}
                      </option>
                    ))}
                  </select>
                </label>
                <DateModeFields
                  mode={form.mode}
                  dateAbsence={form.dateAbsence}
                  startDate={form.startDate}
                  endDate={form.endDate}
                  onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
                  t={t}
                />
                <label className="field">
                  <span>{t.absences.reason}</span>
                  <input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
                </label>
                <label className="field">
                  <span>{t.absences.justificationDocOptional}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif,application/pdf,.doc,.docx"
                    onChange={(e) => setJustificationFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              <div className="modal__actions">
                <button type="button" className="btn btn--ghost" onClick={() => setShowAddModal(false)}>
                  {t.absences.cancel}
                </button>
                <button className="btn btn--primary" type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? t.absences.manager.creating : t.absences.manager.createAbsence}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t.absences.manager.editModalTitle(personnelName(personnelByAbsenceId.get(editing.idAbsence)))}</h2>
            <form onSubmit={handleEditSubmit}>
              {formError && <div className="alert alert--error">{formError}</div>}
              <div className="fieldset">
                <DateModeFields
                  mode={form.mode}
                  dateAbsence={form.dateAbsence}
                  startDate={form.startDate}
                  endDate={form.endDate}
                  onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
                  t={t}
                />
                <label className="field">
                  <span>{t.absences.reason}</span>
                  <input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
                </label>
                <label className="field">
                  <span>{t.absences.manager.justificationDoc}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif,application/pdf,.doc,.docx"
                    onChange={handleEditJustificationChange}
                    disabled={uploadJustificationMutation.isPending}
                  />
                </label>
                {justificationError && <div className="alert alert--error">{justificationError}</div>}
                {editing.justification && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => absencesApi.downloadJustification(editing.idAbsence, editing.justification)}
                  >
                    <Paperclip size={14} aria-hidden="true" />
                    {t.absences.manager.downloadCurrentJustification}
                  </button>
                )}
              </div>
              <div className="modal__actions">
                <button type="button" className="btn btn--ghost" onClick={() => setEditing(null)}>
                  {t.absences.cancel}
                </button>
                <button className="btn btn--primary" type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? t.absences.manager.saving : t.absences.manager.saveChanges}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {quotaFor && (
        <div className="modal-overlay" onClick={() => setQuotaFor(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t.absences.manager.quotaModalTitle(personnelName(quotaFor))}</h2>
            {quota ? <QuotaPanel quota={quota} t={t} /> : <p className="jobs__status">{t.absences.manager.loading}</p>}
            <div className="modal__actions">
              <button className="btn btn--ghost" onClick={() => setQuotaFor(null)}>
                {t.absences.manager.close}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog options={confirmOptions} onConfirm={handleConfirm} onCancel={closeConfirm} />
    </div>
  );
}

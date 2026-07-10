import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { absencesApi } from '@/api/absences';
import { personnelApi } from '@/api/personnel';
import { useAuth } from '@/auth/useAuth';
import { getErrorMessage } from '@/lib/errors';
import { IconButton } from '@/components/IconButton';
import type { Absence, AbsenceCreateRequest, Personnel, QuotaSnapshot } from '@/types';

type DateMode = 'single' | 'range';

const EMPTY_FORM = {
  mode: 'single' as DateMode,
  dateAbsence: '',
  startDate: '',
  endDate: '',
  reason: '',
};

function isJustified(a: Absence): boolean {
  return Boolean(a.reason?.trim() || a.justification?.trim());
}

function formatDates(a: Absence): string {
  if (a.dateAbsence) return a.dateAbsence;
  if (a.startDate && a.endDate) return `${a.startDate} → ${a.endDate}`;
  if (a.startDate) return `from ${a.startDate}`;
  return '—';
}

function personnelName(p?: Personnel): string {
  if (!p?.user) return '—';
  return `${p.user.firstname} ${p.user.lastname}`;
}

function QuotaPanel({ quota }: { quota: QuotaSnapshot }) {
  return (
    <div className="quota-panel">
      <div className="quota-panel__item">
        <span className="quota-panel__value">{quota.remainingDays.toFixed(1)}</span>
        <span className="quota-panel__label">Days remaining</span>
      </div>
      <div className="quota-panel__item">
        <span className="quota-panel__value">{quota.earnedDaysThisYear.toFixed(1)}</span>
        <span className="quota-panel__label">Earned this year</span>
      </div>
      <div className="quota-panel__item">
        <span className="quota-panel__value">{quota.carriedOverDays.toFixed(1)}</span>
        <span className="quota-panel__label">Carried over</span>
      </div>
      <div className="quota-panel__item">
        <span className="quota-panel__value">{quota.usedJustifiedDaysThisYear}</span>
        <span className="quota-panel__label">Used (justified)</span>
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
}: {
  mode: DateMode;
  dateAbsence: string;
  startDate: string;
  endDate: string;
  onChange: (patch: Partial<typeof EMPTY_FORM>) => void;
}) {
  return (
    <>
      <label className="field">
        <span>Type</span>
        <select value={mode} onChange={(e) => onChange({ mode: e.target.value as DateMode })}>
          <option value="single">Single day</option>
          <option value="range">Date range</option>
        </select>
      </label>
      {mode === 'single' ? (
        <label className="field">
          <span>Date</span>
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
            <span>Start date</span>
            <input type="date" value={startDate} onChange={(e) => onChange({ startDate: e.target.value })} required />
          </label>
          <label className="field">
            <span>End date</span>
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
  const queryClient = useQueryClient();
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
    },
    onError: (err) => setFormError(getErrorMessage(err, 'Unable to submit the absence request')),
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

  if (isLoading) return <p className="jobs__status">Loading your absences…</p>;
  if (isError || !me) return <p className="jobs__status">Unable to load your personnel record.</p>;

  return (
    <div>
      <div className="page__header page__header--row">
        <div>
          <h1>My absences</h1>
          <p className="page__subtitle">Your absence history and remaining quota.</p>
        </div>
        <button className="btn btn--primary" onClick={() => setShowAddModal(true)}>
          + Request absence
        </button>
      </div>

      {quota && <QuotaPanel quota={quota} />}

      {absences.length === 0 ? (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">No records</span>
          <p>You have no absence requests yet.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date(s)</th>
                <th>Reason</th>
                <th>Justification</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {absences.map((a) => (
                <tr key={a.idAbsence}>
                  <td>{formatDates(a)}</td>
                  <td>{a.reason || '—'}</td>
                  <td>
                    {a.justification ? (
                      <IconButton
                        icon="📎"
                        label="Download justification"
                        onClick={() => absencesApi.downloadJustification(a.idAbsence, a.justification)}
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {isJustified(a) ? (
                      <span className="badge badge--soft">Justified</span>
                    ) : (
                      <span className="badge badge--muted">Unjustified</span>
                    )}
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
            <h2>Request an absence</h2>
            <form onSubmit={handleSubmit}>
              {formError && <div className="alert alert--error">{formError}</div>}
              <div className="fieldset">
                <DateModeFields
                  mode={form.mode}
                  dateAbsence={form.dateAbsence}
                  startDate={form.startDate}
                  endDate={form.endDate}
                  onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
                />
                <label className="field">
                  <span>Reason</span>
                  <input
                    value={form.reason}
                    onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                    placeholder="e.g. Medical appointment"
                  />
                </label>
                <label className="field">
                  <span>Justification document (optional)</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif,application/pdf,.doc,.docx"
                    onChange={(e) => setJustificationFile(e.target.files?.[0] ?? null)}
                  />
                  <span className="field-hint">e.g. a doctor's note, scanned as a PDF or image.</span>
                </label>
              </div>
              <div className="modal__actions">
                <button type="button" className="btn btn--ghost" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button className="btn btn--primary" type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Submitting…' : 'Submit request'}
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
  const queryClient = useQueryClient();
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
    },
    onError: (err) => setFormError(getErrorMessage(err, 'Unable to create the absence')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ReturnType<typeof buildPayload> }) =>
      absencesApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['absences'] });
      setEditing(null);
      setFormError(null);
    },
    onError: (err) => setFormError(getErrorMessage(err, 'Unable to update the absence')),
  });

  const deleteMutation = useMutation({
    mutationFn: absencesApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['absences'] });
      queryClient.invalidateQueries({ queryKey: ['personnel'] });
    },
  });

  const uploadJustificationMutation = useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => absencesApi.uploadJustification(id, file),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['absences'] });
      setEditing(updated);
      setJustificationError(null);
    },
    onError: (err) => setJustificationError(getErrorMessage(err, 'Unable to upload the justification')),
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
      setFormError('Please select an employee');
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
    if (!window.confirm(`Delete this absence for ${employee}? This cannot be undone.`)) return;
    deleteMutation.mutate(a.idAbsence);
  };

  return (
    <div>
      <div className="page__header page__header--row">
        <div>
          <h1>Absences</h1>
          <p className="page__subtitle">Track and manage employee absences.</p>
        </div>
        <button className="btn btn--primary" onClick={openAddModal}>
          + Add absence
        </button>
      </div>

      <div className="toolbar">
        <input
          className="toolbar__search"
          type="search"
          placeholder="Search by employee, reason…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && <p className="jobs__status">Loading absences…</p>}
      {isError && <p className="jobs__status">Unable to load absences.</p>}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">No records</span>
          <p>{search ? 'No absences match your search.' : 'No absences recorded yet.'}</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Date(s)</th>
                <th>Reason</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const employee = personnelByAbsenceId.get(a.idAbsence);
                return (
                  <tr key={a.idAbsence}>
                    <td>{personnelName(employee)}</td>
                    <td>{formatDates(a)}</td>
                    <td>{a.reason || '—'}</td>
                    <td>
                      {isJustified(a) ? (
                        <span className="badge badge--soft">Justified</span>
                      ) : (
                        <span className="badge badge--muted">Unjustified</span>
                      )}
                    </td>
                    <td className="data-table__actions">
                      <IconButton icon="✏️" label="Edit" onClick={() => openEditModal(a)} />
                      {a.justification && (
                        <IconButton
                          icon="📎"
                          label="Download justification"
                          onClick={() => absencesApi.downloadJustification(a.idAbsence, a.justification)}
                        />
                      )}
                      <IconButton
                        icon="📊"
                        label="View quota"
                        disabled={!employee}
                        onClick={() => employee && setQuotaFor(employee)}
                      />
                      <IconButton
                        icon="🗑️"
                        label="Delete"
                        variant="danger"
                        onClick={() => handleDelete(a)}
                        disabled={deleteMutation.isPending}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add absence</h2>
            <form onSubmit={handleCreateSubmit}>
              {formError && <div className="alert alert--error">{formError}</div>}
              <div className="fieldset">
                <label className="field">
                  <span>Employee</span>
                  <select
                    value={selectedPersonnelId}
                    onChange={(e) => setSelectedPersonnelId(Number(e.target.value) || '')}
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
                <DateModeFields
                  mode={form.mode}
                  dateAbsence={form.dateAbsence}
                  startDate={form.startDate}
                  endDate={form.endDate}
                  onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
                />
                <label className="field">
                  <span>Reason</span>
                  <input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
                </label>
                <label className="field">
                  <span>Justification document (optional)</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif,application/pdf,.doc,.docx"
                    onChange={(e) => setJustificationFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              <div className="modal__actions">
                <button type="button" className="btn btn--ghost" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button className="btn btn--primary" type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating…' : 'Create absence'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit absence — {personnelName(personnelByAbsenceId.get(editing.idAbsence))}</h2>
            <form onSubmit={handleEditSubmit}>
              {formError && <div className="alert alert--error">{formError}</div>}
              <div className="fieldset">
                <DateModeFields
                  mode={form.mode}
                  dateAbsence={form.dateAbsence}
                  startDate={form.startDate}
                  endDate={form.endDate}
                  onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
                />
                <label className="field">
                  <span>Reason</span>
                  <input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
                </label>
                <label className="field">
                  <span>Justification document</span>
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
                    Download current justification
                  </button>
                )}
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

      {quotaFor && (
        <div className="modal-overlay" onClick={() => setQuotaFor(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Absence quota — {personnelName(quotaFor)}</h2>
            {quota ? <QuotaPanel quota={quota} /> : <p className="jobs__status">Loading…</p>}
            <div className="modal__actions">
              <button className="btn btn--ghost" onClick={() => setQuotaFor(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

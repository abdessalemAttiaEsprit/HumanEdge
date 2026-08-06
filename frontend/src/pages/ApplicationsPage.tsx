import { Fragment, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { Bot, CalendarClock, ChevronDown, Download, Eye, Trash2 } from 'lucide-react';
import { applicationsApi } from '@/api/applications';
import { candidatesApi } from '@/api/candidates';
import { interviewsApi } from '@/api/interviews';
import { useAuth } from '@/auth/useAuth';
import { getErrorMessage } from '@/lib/errors';
import { usePagination } from '@/lib/usePagination';
import { useEscapeKey } from '@/lib/useEscapeKey';
import { useConfirm } from '@/lib/useConfirm';
import { useSort } from '@/lib/useSort';
import { Pagination } from '@/components/Pagination';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TableSkeleton } from '@/components/TableSkeleton';
import { SortableTh } from '@/components/SortableTh';
import { RowActionsMenu } from '@/components/RowActionsMenu';
import { useToast } from '@/components/ToastProvider';
import type { Application, ApplicationStatus } from '@/types';

const STATUS_OPTIONS: ApplicationStatus[] = ['SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'ACCEPTED', 'REJECTED'];

function candidateName(a: Application): string {
  const c = a.candidate;
  if (!c) return '—';
  return [c.firstName, c.lastName].filter(Boolean).join(' ') || '—';
}

function statusBadgeClass(status?: string): string {
  if (status === 'ACCEPTED') return 'badge badge--success';
  if (status === 'REJECTED') return 'badge badge--danger';
  if (status === 'SHORTLISTED') return 'badge badge--warning';
  if (status === 'UNDER_REVIEW') return 'badge badge--soft';
  return 'badge badge--muted';
}

type ApplicationSortKey = 'candidate' | 'job' | 'applied' | 'aiScore' | 'status';

function getApplicationSortValue(a: Application, key: ApplicationSortKey): string | number {
  switch (key) {
    case 'candidate':
      return candidateName(a);
    case 'job':
      return a.jobPosting?.title ?? '';
    case 'applied':
      return a.appliedDate ?? '';
    case 'aiScore':
      return a.aiScore ?? -1;
    case 'status':
      return a.status ?? '';
  }
}

export function ApplicationsPage() {
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'COMPANY';
  return canManage ? <ManageApplications /> : <MyApplications />;
}

// ============================================================================
// GUEST: read-only history of the candidate's own applications.
// ============================================================================
function MyApplications() {
  const { data: me, isLoading: meLoading, error: meError } = useQuery({
    queryKey: ['candidate', 'me'],
    queryFn: candidatesApi.getMine,
    retry: false,
  });
  const hasProfile = !(meError instanceof AxiosError && meError.response?.status === 404);

  const { data: applications, isLoading, isError } = useQuery({
    queryKey: ['applications', 'by-candidate', me?.id],
    queryFn: () => applicationsApi.listByCandidate(me!.id),
    enabled: !!me,
  });

  const sorted = useMemo(
    () => [...(applications ?? [])].sort((a, b) => (b.appliedDate ?? '').localeCompare(a.appliedDate ?? '')),
    [applications],
  );

  if (meLoading) return <p className="jobs__status">Loading…</p>;

  if (!hasProfile) {
    return (
      <div>
        <div className="page__header">
          <h1>My applications</h1>
        </div>
        <div className="placeholder-box">
          <span className="placeholder-box__badge">Profile required</span>
          <p>
            Create your <Link to="/candidates">candidate profile</Link> first, then apply to jobs from the{' '}
            <Link to="/jobs">Job Postings</Link> page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page__header">
        <h1>My applications</h1>
        <p className="page__subtitle">
          Track the status of every job you've applied to, from submission through review to
          a final decision. You'll see your interview details here as soon as a company
          shortlists your application.
        </p>
      </div>

      {isLoading && <TableSkeleton columns={5} />}
      {isError && <p className="jobs__status">Unable to load your applications.</p>}

      {!isLoading && !isError && sorted.length === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">No records</span>
          <p>
            You haven't applied to any jobs yet. Browse <Link to="/jobs">open positions</Link>.
          </p>
        </div>
      )}

      {!isLoading && sorted.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Company</th>
                <th>Applied</th>
                <th>Status</th>
                <th>Interview</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((a) => (
                <tr key={a.id}>
                  <td data-label="Job">{a.jobPosting?.title || '—'}</td>
                  <td data-label="Company">{a.jobPosting?.createdByCompany?.companyName || '—'}</td>
                  <td data-label="Applied">{a.appliedDate ? a.appliedDate.slice(0, 10) : '—'}</td>
                  <td data-label="Status">
                    <span className={statusBadgeClass(a.status)}>{a.status || '—'}</span>
                  </td>
                  <td data-label="Interview">
                    {a.interviewDate
                      ? `${a.interviewDate.replace('T', ' ').slice(0, 16)} @ ${a.interviewLocation || '—'}`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ADMIN / COMPANY: manage applications, evaluate, schedule interviews.
// ============================================================================
function ManageApplications() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { confirmOptions, requestConfirm, closeConfirm, handleConfirm } = useConfirm();
  const [search, setSearch] = useState('');
  const [viewing, setViewing] = useState<Application | null>(null);
  const [expandedFeedbackId, setExpandedFeedbackId] = useState<number | null>(null);
  const [scheduling, setScheduling] = useState<Application | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleLocation, setScheduleLocation] = useState('');
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const { data: applications, isLoading, isError } = useQuery({
    queryKey: ['applications'],
    queryFn: applicationsApi.list,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: ApplicationStatus }) => applicationsApi.updateStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] }),
  });

  const evaluateMutation = useMutation({
    mutationFn: (id: number) => applicationsApi.evaluateWithAi(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      toast.showSuccess('AI evaluation complete.');
    },
    onError: (err) => toast.showError(getErrorMessage(err, 'AI evaluation failed')),
  });

  // Séquentiel, jamais en parallèle : un seul pod Ollama CPU-only derrière (voir
  // docs/deployment/06-monitoring.md) - des appels concurrents ne feraient que mettre les
  // requêtes en file d'attente sans rien accélérer, en risquant en plus de multiplier les
  // 504 d'ingress sur des requêtes déjà lentes individuellement (~30-90s chacune).
  const [batchEvaluating, setBatchEvaluating] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });

  const handleEvaluateAll = async () => {
    const pending = filtered.filter((a) => a.aiScore == null);
    if (pending.length === 0) return;
    setBatchEvaluating(true);
    setBatchProgress({ done: 0, total: pending.length });
    let failures = 0;
    for (const application of pending) {
      try {
        await applicationsApi.evaluateWithAi(application.id);
      } catch {
        failures += 1;
      }
      setBatchProgress((p) => ({ ...p, done: p.done + 1 }));
      queryClient.invalidateQueries({ queryKey: ['applications'] });
    }
    setBatchEvaluating(false);
    if (failures > 0) {
      toast.showError(`${pending.length - failures} evaluated, ${failures} failed.`);
    } else {
      toast.showSuccess(`${pending.length} application(s) evaluated.`);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: applicationsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      toast.showSuccess('Application deleted.');
    },
    onError: (err) => toast.showError(getErrorMessage(err, 'Unable to delete this application')),
  });

  const scheduleMutation = useMutation({
    mutationFn: ({ id, date, location }: { id: number; date: string; location: string }) =>
      interviewsApi.schedule(id, date, location),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['interviews'] });
      setScheduling(null);
      setScheduleError(null);
      toast.showSuccess('Interview scheduled.');
    },
    onError: (err) => setScheduleError(getErrorMessage(err, 'Unable to schedule the interview')),
  });

  const filtered = useMemo(() => {
    if (!applications) return [];
    const q = search.trim().toLowerCase();
    if (!q) return applications;
    return applications.filter((a) =>
      [candidateName(a), a.jobPosting?.title, a.status].filter(Boolean).join(' ').toLowerCase().includes(q),
    );
  }, [applications, search]);

  const handleDelete = (a: Application) => {
    requestConfirm({
      title: 'Delete application',
      message: `Delete the application from ${candidateName(a)} for "${a.jobPosting?.title}"?`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: () => deleteMutation.mutate(a.id),
    });
  };

  const openSchedule = (a: Application) => {
    setScheduling(a);
    setScheduleDate('');
    setScheduleLocation('');
    setScheduleError(null);
  };

  const handleScheduleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!scheduling) return;
    setScheduleError(null);
    scheduleMutation.mutate({
      id: scheduling.id,
      date: `${scheduleDate}:00`,
      location: scheduleLocation,
    });
  };

  const { sorted, sortKey, direction, toggleSort } = useSort<Application, ApplicationSortKey>(
    filtered,
    getApplicationSortValue,
  );
  const { page, setPage, pageCount, pageItems } = usePagination(sorted, 10);

  useEscapeKey(() => setViewing(null), !!viewing);
  useEscapeKey(() => setScheduling(null), !!scheduling);

  return (
    <div>
      <div className="page__header page__header--row">
        <div>
          <h1>Applications</h1>
          <p className="page__subtitle">
            Review every application received for your job postings, evaluate candidates
            with AI-assisted scoring, and move promising profiles forward by scheduling an
            interview. Update application status as candidates progress through your hiring
            pipeline.
          </p>
        </div>
        <div className="page__header-actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => applicationsApi.exportCsv()}
            title="Export the visible applications to a CSV file"
          >
            <Download size={16} aria-hidden="true" />
            Export CSV
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={batchEvaluating || filtered.filter((a) => a.aiScore == null).length === 0}
            onClick={handleEvaluateAll}
            title="Evaluate every application below without a score yet"
          >
            {batchEvaluating ? 'Evaluating…' : `🤖 Evaluate all (${filtered.filter((a) => a.aiScore == null).length})`}
          </button>
        </div>
      </div>

      {batchEvaluating && (
        <div className="batch-progress">
          <div className="batch-progress__track">
            <div
              className="batch-progress__fill"
              style={{ width: `${batchProgress.total ? (batchProgress.done / batchProgress.total) * 100 : 0}%` }}
            />
          </div>
          <span className="batch-progress__label">
            {batchProgress.done}/{batchProgress.total} evaluated
          </span>
        </div>
      )}

      <div className="toolbar">
        <input
          className="toolbar__search"
          type="search"
          placeholder="Search by candidate, job, status…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && <TableSkeleton columns={6} />}
      {isError && <p className="jobs__status">Unable to load applications.</p>}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">No records</span>
          <p>{search ? 'No applications match your search.' : 'No applications received yet.'}</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <SortableTh
                  label="Candidate"
                  sortKey="candidate"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={toggleSort}
                />
                <SortableTh label="Job" sortKey="job" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh
                  label="Applied"
                  sortKey="applied"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="AI score"
                  sortKey="aiScore"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={toggleSort}
                />
                <SortableTh label="Status" sortKey="status" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((a) => (
                <Fragment key={a.id}>
                  <tr>
                    <td data-label="Candidate">{candidateName(a)}</td>
                    <td data-label="Job">{a.jobPosting?.title || '—'}</td>
                    <td data-label="Applied">{a.appliedDate ? a.appliedDate.slice(0, 10) : '—'}</td>
                    <td data-label="AI score">
                      <div className="ai-score-cell">
                        <span>{a.aiScore != null ? a.aiScore.toFixed(1) : '—'}</span>
                        {a.aiFeedback && (
                          <button
                            type="button"
                            className="ai-score-cell__toggle"
                            onClick={() => setExpandedFeedbackId(expandedFeedbackId === a.id ? null : a.id)}
                            title={expandedFeedbackId === a.id ? 'Hide AI feedback' : 'Show AI feedback'}
                            aria-label={expandedFeedbackId === a.id ? 'Hide AI feedback' : 'Show AI feedback'}
                          >
                            <ChevronDown
                              size={14}
                              aria-hidden="true"
                              style={{ transform: expandedFeedbackId === a.id ? 'rotate(180deg)' : undefined }}
                            />
                          </button>
                        )}
                      </div>
                    </td>
                    <td data-label="Status">
                      <select
                        className="table-select"
                        aria-label={`Status for the application from ${candidateName(a)}`}
                        value={a.status ?? 'SUBMITTED'}
                        onChange={(e) => statusMutation.mutate({ id: a.id, status: e.target.value as ApplicationStatus })}
                        disabled={statusMutation.isPending}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="data-table__actions" data-label="">
                      <RowActionsMenu
                        ariaLabel={`Actions for the application from ${candidateName(a)}`}
                        items={[
                          { label: 'View', icon: <Eye size={15} aria-hidden="true" />, onClick: () => setViewing(a) },
                          {
                            label: 'Evaluate (AI)',
                            icon: <Bot size={15} aria-hidden="true" />,
                            disabled: evaluateMutation.isPending,
                            onClick: () => evaluateMutation.mutate(a.id),
                          },
                          {
                            label: 'Schedule interview',
                            icon: <CalendarClock size={15} aria-hidden="true" />,
                            onClick: () => openSchedule(a),
                          },
                          {
                            label: 'Delete',
                            icon: <Trash2 size={15} aria-hidden="true" />,
                            danger: true,
                            disabled: deleteMutation.isPending,
                            onClick: () => handleDelete(a),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                  {expandedFeedbackId === a.id && a.aiFeedback && (
                    <tr className="data-table__expanded-row">
                      <td colSpan={6}>
                        <div className="ai-feedback-panel">
                          <strong>AI feedback</strong>
                          <p>{a.aiFeedback}</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />

      {viewing && (
        <div className="modal-overlay" onClick={() => setViewing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{candidateName(viewing)} — {viewing.jobPosting?.title}</h2>
            <div className="detail-grid">
              <div className="detail-grid__item">
                <span>Candidate email</span>
                <strong>{viewing.candidate?.email || '—'}</strong>
              </div>
              <div className="detail-grid__item">
                <span>Applied</span>
                <strong>{viewing.appliedDate ? viewing.appliedDate.slice(0, 10) : '—'}</strong>
              </div>
              <div className="detail-grid__item">
                <span>AI score</span>
                <strong>{viewing.aiScore != null ? viewing.aiScore.toFixed(1) : '—'}</strong>
              </div>
              <div className="detail-grid__item">
                <span>Status</span>
                <strong>{viewing.status || '—'}</strong>
              </div>
            </div>
            <div className="detail-grid__item" style={{ marginBottom: 16 }}>
              <span>Cover letter</span>
              <p>{viewing.coverLetter || '—'}</p>
            </div>
            <div className="detail-grid__item">
              <span>AI feedback</span>
              <p>{viewing.aiFeedback || '—'}</p>
            </div>
            <div className="modal__actions">
              <button className="btn btn--ghost" onClick={() => setViewing(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {scheduling && (
        <div className="modal-overlay" onClick={() => setScheduling(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Schedule interview — {candidateName(scheduling)}</h2>
            <form onSubmit={handleScheduleSubmit}>
              {scheduleError && <div className="alert alert--error">{scheduleError}</div>}
              <div className="fieldset">
                <label className="field">
                  <span>Date &amp; time</span>
                  <input
                    type="datetime-local"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  <span>Location</span>
                  <input
                    value={scheduleLocation}
                    onChange={(e) => setScheduleLocation(e.target.value)}
                    placeholder="e.g. Office 3B or a video call link"
                    required
                  />
                </label>
              </div>
              <div className="modal__actions">
                <button type="button" className="btn btn--ghost" onClick={() => setScheduling(null)}>
                  Cancel
                </button>
                <button className="btn btn--primary" type="submit" disabled={scheduleMutation.isPending}>
                  {scheduleMutation.isPending ? 'Scheduling…' : 'Schedule interview'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog options={confirmOptions} onConfirm={handleConfirm} onCancel={closeConfirm} />
    </div>
  );
}

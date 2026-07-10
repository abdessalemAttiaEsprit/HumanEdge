import { Fragment, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { applicationsApi } from '@/api/applications';
import { candidatesApi } from '@/api/candidates';
import { interviewsApi } from '@/api/interviews';
import { useAuth } from '@/auth/useAuth';
import { getErrorMessage } from '@/lib/errors';
import { usePagination } from '@/lib/usePagination';
import { useEscapeKey } from '@/lib/useEscapeKey';
import { IconButton } from '@/components/IconButton';
import { Pagination } from '@/components/Pagination';
import { useToast } from '@/components/ToastProvider';
import type { Application, ApplicationStatus } from '@/types';

const STATUS_OPTIONS: ApplicationStatus[] = ['SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'ACCEPTED', 'REJECTED'];

function candidateName(a: Application): string {
  const c = a.candidate;
  if (!c) return '—';
  return [c.firstName, c.lastName].filter(Boolean).join(' ') || '—';
}

function statusBadgeClass(status?: string): string {
  if (status === 'ACCEPTED') return 'badge badge--soft';
  if (status === 'REJECTED') return 'badge badge--muted';
  return 'badge badge--soft';
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
        <p className="page__subtitle">Track the status of the jobs you've applied to.</p>
      </div>

      {isLoading && <p className="jobs__status">Loading your applications…</p>}
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
                  <td>{a.jobPosting?.title || '—'}</td>
                  <td>{a.jobPosting?.createdByCompany?.companyName || '—'}</td>
                  <td>{a.appliedDate ? a.appliedDate.slice(0, 10) : '—'}</td>
                  <td>
                    <span className={statusBadgeClass(a.status)}>{a.status || '—'}</span>
                  </td>
                  <td>
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
    if (!window.confirm(`Delete the application from ${candidateName(a)} for "${a.jobPosting?.title}"?`)) return;
    deleteMutation.mutate(a.id);
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

  const { page, setPage, pageCount, pageItems } = usePagination(filtered, 10);

  useEscapeKey(() => setViewing(null), !!viewing);
  useEscapeKey(() => setScheduling(null), !!scheduling);

  return (
    <div>
      <div className="page__header">
        <h1>Applications</h1>
        <p className="page__subtitle">Review candidates, evaluate with AI, and schedule interviews.</p>
      </div>

      <div className="toolbar">
        <input
          className="toolbar__search"
          type="search"
          placeholder="Search by candidate, job, status…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && <p className="jobs__status">Loading applications…</p>}
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
                <th>Candidate</th>
                <th>Job</th>
                <th>Applied</th>
                <th>AI score</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((a) => (
                <Fragment key={a.id}>
                  <tr>
                    <td>{candidateName(a)}</td>
                    <td>{a.jobPosting?.title || '—'}</td>
                    <td>{a.appliedDate ? a.appliedDate.slice(0, 10) : '—'}</td>
                    <td>
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
                            {expandedFeedbackId === a.id ? '▲' : '▼'}
                          </button>
                        )}
                      </div>
                    </td>
                    <td>
                      <select
                        className="table-select"
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
                    <td className="data-table__actions">
                      <IconButton icon="👁️" label="View" onClick={() => setViewing(a)} />
                      <IconButton
                        icon="🤖"
                        label="Evaluate (AI)"
                        onClick={() => evaluateMutation.mutate(a.id)}
                        disabled={evaluateMutation.isPending}
                      />
                      <IconButton icon="📅" label="Schedule interview" onClick={() => openSchedule(a)} />
                      <IconButton
                        icon="🗑️"
                        label="Delete"
                        variant="danger"
                        onClick={() => handleDelete(a)}
                        disabled={deleteMutation.isPending}
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
    </div>
  );
}

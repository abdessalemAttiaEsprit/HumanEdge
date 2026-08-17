import { Fragment, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { Bot, CalendarClock, ChevronDown, Download, Eye, Trash2 } from 'lucide-react';
import { applicationsApi } from '@/api/applications';
import { candidatesApi } from '@/api/candidates';
import { interviewsApi } from '@/api/interviews';
import { useAuth } from '@/auth/useAuth';
import { useLanguage } from '@/i18n/useLanguage';
import type { Messages } from '@/i18n/en';
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

function statusLabel(t: Messages, status?: string): string {
  if (!status) return '—';
  return t.applicationStatus[status as keyof Messages['applicationStatus']] ?? status;
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
  const { t } = useLanguage();
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

  if (meLoading) return <p className="jobs__status">{t.applications.my.loading}</p>;

  if (!hasProfile) {
    return (
      <div>
        <div className="page__header">
          <h1>{t.applications.my.title}</h1>
        </div>
        <div className="placeholder-box">
          <span className="placeholder-box__badge">{t.applications.my.profileRequired}</span>
          <p>
            {t.applications.my.profileRequiredPrefix} <Link to="/candidates">{t.applications.my.candidateProfile}</Link>{' '}
            {t.applications.my.profileRequiredMiddle} <Link to="/jobs">{t.applications.my.jobPostingsLink}</Link>{' '}
            {t.applications.my.profileRequiredSuffix}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page__header">
        <h1>{t.applications.my.title}</h1>
        <p className="page__subtitle">{t.applications.my.subtitle}</p>
      </div>

      {isLoading && <TableSkeleton columns={5} />}
      {isError && <p className="jobs__status">{t.applications.my.errorLoad}</p>}

      {!isLoading && !isError && sorted.length === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">{t.common.noRecords}</span>
          <p>
            {t.applications.my.noneYetPrefix} <Link to="/jobs">{t.applications.my.openPositions}</Link>.
          </p>
        </div>
      )}

      {!isLoading && sorted.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.applications.my.columnJob}</th>
                <th>{t.applications.my.columnCompany}</th>
                <th>{t.applications.my.columnApplied}</th>
                <th>{t.applications.my.columnStatus}</th>
                <th>{t.applications.my.columnInterview}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((a) => (
                <tr key={a.id}>
                  <td data-label={t.applications.my.columnJob}>{a.jobPosting?.title || '—'}</td>
                  <td data-label={t.applications.my.columnCompany}>{a.jobPosting?.createdByCompany?.companyName || '—'}</td>
                  <td data-label={t.applications.my.columnApplied}>{a.appliedDate ? a.appliedDate.slice(0, 10) : '—'}</td>
                  <td data-label={t.applications.my.columnStatus}>
                    <span className={statusBadgeClass(a.status)}>{statusLabel(t, a.status)}</span>
                  </td>
                  <td data-label={t.applications.my.columnInterview}>
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
  const { t } = useLanguage();
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
      toast.showSuccess(t.applications.manage.evaluatedSuccess);
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.applications.manage.errorEvaluate)),
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
      toast.showError(t.applications.manage.batchResultMixed(pending.length - failures, failures));
    } else {
      toast.showSuccess(t.applications.manage.batchResultSuccess(pending.length));
    }
  };

  const deleteMutation = useMutation({
    mutationFn: applicationsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      toast.showSuccess(t.applications.manage.deletedSuccess);
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.applications.manage.errorDelete)),
  });

  const scheduleMutation = useMutation({
    mutationFn: ({ id, date, location }: { id: number; date: string; location: string }) =>
      interviewsApi.schedule(id, date, location),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['interviews'] });
      setScheduling(null);
      setScheduleError(null);
      toast.showSuccess(t.applications.manage.interviewScheduledSuccess);
    },
    onError: (err) => setScheduleError(getErrorMessage(err, t.applications.manage.errorSchedule)),
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
      title: t.applications.manage.deleteTitle,
      message: t.applications.manage.deleteMessage(candidateName(a), a.jobPosting?.title ?? ''),
      confirmLabel: t.applications.manage.delete,
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
          <h1>{t.applications.manage.title}</h1>
          <p className="page__subtitle">{t.applications.manage.subtitle}</p>
        </div>
        <div className="page__header-actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => applicationsApi.exportCsv()}
            title={t.applications.manage.exportCsvTitle}
          >
            <Download size={16} aria-hidden="true" />
            {t.applications.manage.exportCsv}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={batchEvaluating || filtered.filter((a) => a.aiScore == null).length === 0}
            onClick={handleEvaluateAll}
            title={t.applications.manage.evaluateAllTitle}
          >
            {batchEvaluating
              ? t.applications.manage.evaluating
              : t.applications.manage.evaluateAll(filtered.filter((a) => a.aiScore == null).length)}
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
            {t.applications.manage.evaluatedProgress(batchProgress.done, batchProgress.total)}
          </span>
        </div>
      )}

      <div className="toolbar">
        <input
          className="toolbar__search"
          type="search"
          placeholder={t.applications.manage.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && <TableSkeleton columns={6} />}
      {isError && <p className="jobs__status">{t.applications.manage.errorLoad}</p>}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">{t.common.noRecords}</span>
          <p>{search ? t.applications.manage.noneMatchSearch : t.applications.manage.noneYet}</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <SortableTh
                  label={t.applications.manage.columnCandidate}
                  sortKey="candidate"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={toggleSort}
                />
                <SortableTh label={t.applications.manage.columnJob} sortKey="job" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh
                  label={t.applications.manage.columnApplied}
                  sortKey="applied"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={toggleSort}
                />
                <SortableTh
                  label={t.applications.manage.columnAiScore}
                  sortKey="aiScore"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={toggleSort}
                />
                <SortableTh label={t.applications.manage.columnStatus} sortKey="status" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((a) => (
                <Fragment key={a.id}>
                  <tr>
                    <td data-label={t.applications.manage.columnCandidate}>{candidateName(a)}</td>
                    <td data-label={t.applications.manage.columnJob}>{a.jobPosting?.title || '—'}</td>
                    <td data-label={t.applications.manage.columnApplied}>{a.appliedDate ? a.appliedDate.slice(0, 10) : '—'}</td>
                    <td data-label={t.applications.manage.columnAiScore}>
                      <div className="ai-score-cell">
                        <span>{a.aiScore != null ? a.aiScore.toFixed(1) : '—'}</span>
                        {a.aiFeedback && (
                          <button
                            type="button"
                            className="ai-score-cell__toggle"
                            onClick={() => setExpandedFeedbackId(expandedFeedbackId === a.id ? null : a.id)}
                            title={expandedFeedbackId === a.id ? t.applications.manage.hideAiFeedback : t.applications.manage.showAiFeedback}
                            aria-label={expandedFeedbackId === a.id ? t.applications.manage.hideAiFeedback : t.applications.manage.showAiFeedback}
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
                    <td data-label={t.applications.manage.columnStatus}>
                      <select
                        className="table-select"
                        aria-label={`Status for the application from ${candidateName(a)}`}
                        value={a.status ?? 'SUBMITTED'}
                        onChange={(e) => statusMutation.mutate({ id: a.id, status: e.target.value as ApplicationStatus })}
                        disabled={statusMutation.isPending}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {t.applicationStatus[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="data-table__actions" data-label="">
                      <RowActionsMenu
                        ariaLabel={`Actions for the application from ${candidateName(a)}`}
                        items={[
                          { label: t.applications.manage.view, icon: <Eye size={15} aria-hidden="true" />, onClick: () => setViewing(a) },
                          {
                            label: t.applications.manage.evaluateAi,
                            icon: <Bot size={15} aria-hidden="true" />,
                            disabled: evaluateMutation.isPending,
                            onClick: () => evaluateMutation.mutate(a.id),
                          },
                          {
                            label: t.applications.manage.scheduleInterview,
                            icon: <CalendarClock size={15} aria-hidden="true" />,
                            onClick: () => openSchedule(a),
                          },
                          {
                            label: t.applications.manage.delete,
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
                          <strong>{t.applications.manage.aiFeedback}</strong>
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
                <span>{t.applications.manage.candidateEmail}</span>
                <strong>{viewing.candidate?.email || '—'}</strong>
              </div>
              <div className="detail-grid__item">
                <span>{t.applications.manage.applied}</span>
                <strong>{viewing.appliedDate ? viewing.appliedDate.slice(0, 10) : '—'}</strong>
              </div>
              <div className="detail-grid__item">
                <span>{t.applications.manage.aiScore}</span>
                <strong>{viewing.aiScore != null ? viewing.aiScore.toFixed(1) : '—'}</strong>
              </div>
              <div className="detail-grid__item">
                <span>{t.applications.manage.status}</span>
                <strong>{statusLabel(t, viewing.status)}</strong>
              </div>
            </div>
            <div className="detail-grid__item" style={{ marginBottom: 16 }}>
              <span>{t.applications.manage.coverLetter}</span>
              <p>{viewing.coverLetter || '—'}</p>
            </div>
            <div className="detail-grid__item">
              <span>{t.applications.manage.aiFeedback}</span>
              <p>{viewing.aiFeedback || '—'}</p>
            </div>
            <div className="modal__actions">
              <button className="btn btn--ghost" onClick={() => setViewing(null)}>
                {t.applications.manage.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {scheduling && (
        <div className="modal-overlay" onClick={() => setScheduling(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t.applications.manage.scheduleModalTitle(candidateName(scheduling))}</h2>
            <form onSubmit={handleScheduleSubmit}>
              {scheduleError && <div className="alert alert--error">{scheduleError}</div>}
              <div className="fieldset">
                <label className="field">
                  <span>{t.applications.manage.dateTime}</span>
                  <input
                    type="datetime-local"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  <span>{t.applications.manage.location}</span>
                  <input
                    value={scheduleLocation}
                    onChange={(e) => setScheduleLocation(e.target.value)}
                    placeholder={t.applications.manage.locationPlaceholder}
                    required
                  />
                </label>
              </div>
              <div className="modal__actions">
                <button type="button" className="btn btn--ghost" onClick={() => setScheduling(null)}>
                  {t.applications.manage.cancel}
                </button>
                <button className="btn btn--primary" type="submit" disabled={scheduleMutation.isPending}>
                  {scheduleMutation.isPending ? t.applications.manage.scheduling : t.applications.manage.scheduleInterview}
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

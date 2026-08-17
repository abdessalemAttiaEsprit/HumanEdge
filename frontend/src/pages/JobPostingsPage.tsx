import { Fragment, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { CalendarCheck, ChevronDown, Eye, FileText, Lock, Pencil, Plus, Trash2, Unlock } from 'lucide-react';
import { jobPostingsApi } from '@/api/jobPostings';
import { publicJobsApi } from '@/api/publicJobs';
import { companiesApi } from '@/api/companies';
import { candidatesApi } from '@/api/candidates';
import { applicationsApi } from '@/api/applications';
import { interviewsApi } from '@/api/interviews';
import { useAuth } from '@/auth/useAuth';
import { useLanguage } from '@/i18n/useLanguage';
import type { Messages } from '@/i18n/en';
import { getErrorMessage } from '@/lib/errors';
import { useConfirm } from '@/lib/useConfirm';
import { useEscapeKey } from '@/lib/useEscapeKey';
import { useSort } from '@/lib/useSort';
import { Pagination } from '@/components/Pagination';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TableSkeleton } from '@/components/TableSkeleton';
import { SortableTh } from '@/components/SortableTh';
import { RowActionsMenu } from '@/components/RowActionsMenu';
import { useToast } from '@/components/ToastProvider';
import { usePagination } from '@/lib/usePagination';
import type { Application, Company, JobPosting, JobPostingCreateRequest, PublicJobResponse, TypeContrat } from '@/types';

const EMPTY_FORM = {
  title: '',
  description: '',
  department: '',
  requiredSkills: '',
  jobType: 'CDI' as TypeContrat,
  deadline: '',
};

function toRequestPayload(f: typeof EMPTY_FORM) {
  return {
    title: f.title,
    description: f.description,
    department: f.department,
    requiredSkills: f.requiredSkills
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    jobType: f.jobType,
    deadline: f.deadline ? `${f.deadline}T23:59:59` : undefined,
  };
}

type JobSortKey = 'title' | 'department' | 'type' | 'company' | 'deadline' | 'status';

function getJobSortValue(j: JobPosting, key: JobSortKey, typeLabel: Record<TypeContrat, string>): string | number {
  switch (key) {
    case 'title':
      return j.title ?? '';
    case 'department':
      return j.department ?? '';
    case 'type':
      return j.jobType ? typeLabel[j.jobType] : '';
    case 'company':
      return j.createdByCompany?.companyName ?? '';
    case 'deadline':
      return j.deadline ?? '';
    case 'status':
      return j.status ?? '';
  }
}

function applicantName(a: Application): string {
  const c = a.candidate;
  if (!c) return '—';
  return [c.firstName, c.lastName].filter(Boolean).join(' ') || '—';
}

function applicationStatusBadgeClass(status?: string): string {
  if (status === 'ACCEPTED') return 'badge badge--success';
  if (status === 'REJECTED') return 'badge badge--danger';
  if (status === 'SHORTLISTED') return 'badge badge--warning';
  if (status === 'UNDER_REVIEW') return 'badge badge--soft';
  return 'badge badge--muted';
}

interface JobPostingRowProps {
  job: JobPosting;
  isAdmin: boolean;
  columnCount: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onToggleStatus: () => void;
  statusPending: boolean;
  onDelete: () => void;
  deletePending: boolean;
  onViewCandidateCv: (a: Application) => void;
  onViewCandidateProfile: (a: Application) => void;
  onAcceptCandidate: (a: Application) => void;
  onDeleteApplication: (a: Application) => void;
  t: Messages;
}

function JobPostingRow({
  job,
  isAdmin,
  columnCount,
  expanded,
  onToggleExpand,
  onEdit,
  onToggleStatus,
  statusPending,
  onDelete,
  deletePending,
  onViewCandidateCv,
  onViewCandidateProfile,
  onAcceptCandidate,
  onDeleteApplication,
  t,
}: JobPostingRowProps) {
  const { data: applications, isLoading: applicationsLoading } = useQuery({
    queryKey: ['applications', 'by-job', job.id],
    queryFn: () => applicationsApi.listByJob(job.id),
    enabled: expanded,
  });

  return (
    <Fragment>
      <tr
        className={`data-table__row--clickable${expanded ? ' data-table__row--expanded' : ''}`}
        onClick={onToggleExpand}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleExpand();
          }
        }}
        tabIndex={0}
        role="button"
        aria-expanded={expanded}
      >
        <td data-label="">
          <span
            className={`data-table__expand-toggle${expanded ? ' data-table__expand-toggle--open' : ''}`}
            aria-hidden="true"
          >
            <ChevronDown size={16} aria-hidden="true" />
          </span>
        </td>
        <td data-label={t.jobPostings.columnTitle}>{job.title}</td>
        <td data-label={t.jobPostings.columnDepartment}>{job.department || '—'}</td>
        <td data-label={t.jobPostings.columnType}>{job.jobType ? t.contractTypes[job.jobType] : '—'}</td>
        {isAdmin && <td data-label={t.jobPostings.columnCompany}>{job.createdByCompany?.companyName ?? '—'}</td>}
        <td data-label={t.jobPostings.columnDeadline}>{job.deadline ? job.deadline.slice(0, 10) : '—'}</td>
        <td data-label={t.jobPostings.columnStatus}>
          {job.status === 'OPEN' ? (
            <span className="badge badge--success">{t.jobPostings.open}</span>
          ) : (
            <span className="badge badge--muted">{job.status || t.jobPostings.closed}</span>
          )}
        </td>
        <td className="data-table__actions" data-label="" onClick={(e) => e.stopPropagation()}>
          <RowActionsMenu
            ariaLabel={`Actions for ${job.title}`}
            items={[
              { label: t.jobPostings.edit, icon: <Pencil size={15} aria-hidden="true" />, onClick: onEdit },
              {
                label: job.status === 'OPEN' ? t.jobPostings.close : t.jobPostings.reopen,
                icon:
                  job.status === 'OPEN' ? <Lock size={15} aria-hidden="true" /> : <Unlock size={15} aria-hidden="true" />,
                disabled: statusPending,
                onClick: onToggleStatus,
              },
              {
                label: t.jobPostings.delete,
                icon: <Trash2 size={15} aria-hidden="true" />,
                danger: true,
                disabled: deletePending,
                onClick: onDelete,
              },
            ]}
          />
        </td>
      </tr>
      {expanded && (
        <tr className="data-table__expanded-row">
          <td colSpan={columnCount}>
            <div className="contract-panel">
              <div className="contract-panel__grid">
                <div className="contract-panel__item">
                  <span className="contract-panel__label">{t.jobPostings.description}</span>
                  <span className="contract-panel__value">{job.description || '—'}</span>
                </div>
                <div className="contract-panel__item">
                  <span className="contract-panel__label">{t.jobPostings.requiredSkills}</span>
                  <span className="contract-panel__value">
                    {job.requiredSkills?.length ? job.requiredSkills.join(', ') : '—'}
                  </span>
                </div>
              </div>

              <h4 className="contract-panel__section-title">{t.jobPostings.candidatesForPosting}</h4>
              {applicationsLoading && <p className="field-hint">{t.jobPostings.loadingCandidates}</p>}
              {!applicationsLoading && (applications?.length ?? 0) === 0 && (
                <p className="field-hint">{t.jobPostings.noApplicationsYet}</p>
              )}
              {!applicationsLoading && (applications?.length ?? 0) > 0 && (
                <table className="data-table data-table--nested">
                  <thead>
                    <tr>
                      <th>{t.jobPostings.columnCandidate}</th>
                      <th>{t.jobPostings.columnStatus}</th>
                      <th>{t.jobPostings.columnApplied}</th>
                      <th>{t.jobPostings.columnAiScore}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications!.map((a) => (
                      <tr key={a.id} onClick={(e) => e.stopPropagation()}>
                        <td data-label={t.jobPostings.columnCandidate}>{applicantName(a)}</td>
                        <td data-label={t.jobPostings.columnStatus}>
                          <span className={applicationStatusBadgeClass(a.status)}>
                            {a.status ? t.applicationStatus[a.status as keyof Messages['applicationStatus']] ?? a.status : '—'}
                          </span>
                        </td>
                        <td data-label={t.jobPostings.columnApplied}>{a.appliedDate ? a.appliedDate.slice(0, 10) : '—'}</td>
                        <td data-label={t.jobPostings.columnAiScore}>{a.aiScore != null ? a.aiScore.toFixed(1) : '—'}</td>
                        <td className="data-table__actions" data-label="">
                          <RowActionsMenu
                            ariaLabel={`Actions for the candidature of ${applicantName(a)}`}
                            items={[
                              {
                                label: t.jobPostings.viewCv,
                                icon: <FileText size={15} aria-hidden="true" />,
                                disabled: !a.candidate?.cvFileId,
                                onClick: () => onViewCandidateCv(a),
                              },
                              {
                                label: t.jobPostings.profile,
                                icon: <Eye size={15} aria-hidden="true" />,
                                onClick: () => onViewCandidateProfile(a),
                              },
                              {
                                label: t.jobPostings.acceptSchedule,
                                icon: <CalendarCheck size={15} aria-hidden="true" />,
                                onClick: () => onAcceptCandidate(a),
                              },
                              {
                                label: t.jobPostings.delete,
                                icon: <Trash2 size={15} aria-hidden="true" />,
                                danger: true,
                                onClick: () => onDeleteApplication(a),
                              },
                            ]}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

export function JobPostingsPage() {
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'COMPANY';
  return canManage ? <ManageJobPostings /> : <BrowseJobPostings />;
}

// ============================================================================
// EMPLOYE / GUEST: read-only browse of open postings (reuses the public API —
// the raw authenticated GET /api/job would leak other companies' non-OPEN/draft
// postings, which isn't appropriate for a plain browsing view).
// ============================================================================
function BrowseJobPostings() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const isGuest = user?.role === 'GUEST';
  const queryClient = useQueryClient();
  const [applying, setApplying] = useState<PublicJobResponse | null>(null);
  const [coverLetter, setCoverLetter] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const { data: jobs, isLoading, isError } = useQuery({
    queryKey: ['public-jobs', 100],
    queryFn: () => publicJobsApi.list(100),
  });

  const { data: me, error: meError } = useQuery({
    queryKey: ['candidate', 'me'],
    queryFn: candidatesApi.getMine,
    retry: false,
    enabled: isGuest,
  });
  const hasProfile = isGuest && !(meError instanceof AxiosError && meError.response?.status === 404);

  const { data: myApplications } = useQuery({
    queryKey: ['applications', 'by-candidate', me?.id],
    queryFn: () => applicationsApi.listByCandidate(me!.id),
    enabled: !!me,
  });

  const appliedJobIds = useMemo(
    () => new Set((myApplications ?? []).map((a) => a.jobPosting?.id).filter((id): id is number => id != null)),
    [myApplications],
  );

  const applyMutation = useMutation({
    mutationFn: ({ jobPostingId, coverLetter }: { jobPostingId: number; coverLetter: string }) =>
      applicationsApi.apply(me!.id, jobPostingId, coverLetter),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications', 'by-candidate', me?.id] });
      setApplying(null);
      setCoverLetter('');
      setFormError(null);
    },
    onError: (err) => setFormError(getErrorMessage(err, t.jobPostings.browse.errorApply)),
  });

  const openApply = (job: PublicJobResponse) => {
    setApplying(job);
    setCoverLetter('');
    setFormError(null);
  };

  const handleApplySubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!applying) return;
    setFormError(null);
    applyMutation.mutate({ jobPostingId: applying.id, coverLetter });
  };

  return (
    <div>
      <div className="page__header">
        <h1>{t.jobPostings.title}</h1>
        <p className="page__subtitle">{t.jobPostings.browse.subtitle}</p>
      </div>

      {isLoading && <p className="jobs__status">{t.jobPostings.browse.loading}</p>}
      {isError && <p className="jobs__status">{t.jobPostings.browse.errorLoad}</p>}
      {!isLoading && !isError && (jobs?.length ?? 0) === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">{t.jobPostings.browse.noOpenings}</span>
          <p>{t.jobPostings.browse.noneRightNow}</p>
        </div>
      )}

      {(jobs?.length ?? 0) > 0 && (
        <div className="jobs__grid jobs__grid--embedded">
          {jobs!.map((job) => (
            <div key={job.id} className="job-card">
              <div className="job-card__top">
                {job.jobType && <span className="job-card__type">{t.contractTypes[job.jobType]}</span>}
                {job.department && <span className="job-card__dept">{job.department}</span>}
              </div>
              <h3>{job.title}</h3>
              {job.companyName && <p className="job-card__company">{job.companyName}</p>}
              {job.description && <p className="job-card__desc">{job.description}</p>}
              {isGuest && (
                appliedJobIds.has(job.id) ? (
                  <span className="badge badge--soft">{t.jobPostings.browse.applied}</span>
                ) : hasProfile ? (
                  <button className="btn btn--ghost btn--sm" onClick={() => openApply(job)}>
                    {t.jobPostings.browse.apply}
                  </button>
                ) : (
                  <p className="field-hint">
                    <Link to="/candidates">{t.jobPostings.browse.completeProfileToApply}</Link>{' '}
                    {t.jobPostings.browse.completeProfileSuffix}
                  </p>
                )
              )}
            </div>
          ))}
        </div>
      )}

      {applying && (
        <div className="modal-overlay" onClick={() => setApplying(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t.jobPostings.browse.applyModalTitle(applying.title ?? '')}</h2>
            <form onSubmit={handleApplySubmit}>
              {formError && <div className="alert alert--error">{formError}</div>}
              <div className="fieldset">
                <label className="field">
                  <span>{t.jobPostings.browse.coverLetter}</span>
                  <textarea
                    rows={5}
                    value={coverLetter}
                    onChange={(e) => setCoverLetter(e.target.value)}
                    placeholder={t.jobPostings.browse.coverLetterPlaceholder}
                    required
                  />
                </label>
              </div>
              <div className="modal__actions">
                <button type="button" className="btn btn--ghost" onClick={() => setApplying(null)}>
                  {t.jobPostings.browse.cancel}
                </button>
                <button className="btn btn--primary" type="submit" disabled={applyMutation.isPending}>
                  {applyMutation.isPending ? t.jobPostings.browse.submitting : t.jobPostings.browse.submitApplication}
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
// ADMIN / COMPANY: manage postings.
// ============================================================================
function ManageJobPostings() {
  const { t } = useLanguage();
  const TYPE_LABEL = t.contractTypes;
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const queryClient = useQueryClient();
  const toast = useToast();
  const { confirmOptions, requestConfirm, closeConfirm, handleConfirm } = useConfirm();

  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editing, setEditing] = useState<JobPosting | null>(null);
  const [companyId, setCompanyId] = useState<number | ''>('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [viewingCandidateApp, setViewingCandidateApp] = useState<Application | null>(null);
  const [scheduling, setScheduling] = useState<Application | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleLocation, setScheduleLocation] = useState('');
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const toggleExpand = (id: number) => setExpandedId((cur) => (cur === id ? null : id));

  // ADMIN voit toutes les offres de la plateforme (navigation) ; COMPANY récupère
  // directement les siennes via un endpoint scopé côté serveur plutôt que de télécharger
  // celles de toutes les entreprises pour les filtrer côté client.
  const { data: jobs, isLoading, isError } = useQuery({
    queryKey: ['job-postings', isAdmin ? 'all' : 'mine'],
    queryFn: isAdmin ? jobPostingsApi.list : jobPostingsApi.myCompanyList,
  });

  const { data: companies } = useQuery({
    queryKey: ['companies'],
    queryFn: companiesApi.list,
    enabled: isAdmin && showAddModal,
  });

  const filtered = useMemo(() => {
    const list = jobs ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((j) =>
      [j.title, j.department, j.createdByCompany?.companyName].filter(Boolean).join(' ').toLowerCase().includes(q),
    );
  }, [jobs, search]);

  const { sorted, sortKey, direction, toggleSort } = useSort<JobPosting, JobSortKey>(filtered, (j, key) =>
    getJobSortValue(j, key, TYPE_LABEL),
  );
  const { page, setPage, pageCount, pageItems } = usePagination(sorted, 10);

  const createMutation = useMutation({
    mutationFn: jobPostingsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-postings'] });
      setShowAddModal(false);
      setForm(EMPTY_FORM);
      setCompanyId('');
      setFormError(null);
    },
    onError: (err) => setFormError(getErrorMessage(err, t.jobPostings.manage.errorCreate)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ReturnType<typeof toRequestPayload> }) =>
      jobPostingsApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-postings'] });
      setEditing(null);
      setFormError(null);
    },
    onError: (err) => setFormError(getErrorMessage(err, t.jobPostings.manage.errorUpdate)),
  });

  const deleteMutation = useMutation({
    mutationFn: jobPostingsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-postings'] });
      toast.showSuccess(t.jobPostings.manage.deletedSuccess);
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.jobPostings.manage.errorDelete)),
  });

  const deleteApplicationMutation = useMutation({
    mutationFn: applicationsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      toast.showSuccess(t.jobPostings.manage.applicationDeletedSuccess);
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.jobPostings.manage.errorDeleteApplication)),
  });

  const scheduleMutation = useMutation({
    mutationFn: ({ id, date, location }: { id: number; date: string; location: string }) =>
      interviewsApi.schedule(id, date, location),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['interviews'] });
      setScheduling(null);
      setScheduleError(null);
      toast.showSuccess(t.jobPostings.manage.interviewScheduledSuccess);
    },
    onError: (err) => setScheduleError(getErrorMessage(err, t.jobPostings.manage.errorSchedule)),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => jobPostingsApi.changeStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-postings'] });
      toast.showSuccess(t.jobPostings.manage.statusUpdatedSuccess);
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.jobPostings.manage.errorStatus)),
  });

  const openAddModal = () => {
    setForm(EMPTY_FORM);
    setCompanyId('');
    setFormError(null);
    setShowAddModal(true);
  };

  const openEditModal = (job: JobPosting) => {
    setEditing(job);
    setForm({
      title: job.title ?? '',
      description: job.description ?? '',
      department: job.department ?? '',
      requiredSkills: (job.requiredSkills ?? []).join(', '),
      jobType: job.jobType ?? 'CDI',
      deadline: job.deadline ? job.deadline.slice(0, 10) : '',
    });
    setFormError(null);
  };

  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (isAdmin && !companyId) {
      setFormError(t.jobPostings.manage.errorSelectCompany);
      return;
    }
    const payload: JobPostingCreateRequest = {
      ...toRequestPayload(form),
      ...(isAdmin ? { createdByCompany: { idCompany: companyId as number } } : {}),
    };
    createMutation.mutate(payload);
  };

  const handleEditSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setFormError(null);
    updateMutation.mutate({ id: editing.id, payload: toRequestPayload(form) });
  };

  const handleDelete = (job: JobPosting) => {
    requestConfirm({
      title: t.jobPostings.manage.deleteTitle,
      message: t.jobPostings.manage.deleteMessage(job.title ?? ''),
      confirmLabel: t.jobPostings.manage.delete,
      variant: 'danger',
      onConfirm: () => deleteMutation.mutate(job.id),
    });
  };

  const toggleStatus = (job: JobPosting) => {
    const next = job.status === 'OPEN' ? 'CLOSED' : 'OPEN';
    statusMutation.mutate({ id: job.id, status: next });
  };

  const handleViewCandidateCv = (a: Application) => {
    if (!a.candidate) return;
    candidatesApi.downloadCv(a.candidate.id, a.candidate.cvFileId);
  };

  const openScheduleForApplication = (a: Application) => {
    setScheduling(a);
    setScheduleDate('');
    setScheduleLocation('');
    setScheduleError(null);
  };

  const handleScheduleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!scheduling) return;
    setScheduleError(null);
    scheduleMutation.mutate({ id: scheduling.id, date: `${scheduleDate}:00`, location: scheduleLocation });
  };

  const handleDeleteApplication = (a: Application) => {
    requestConfirm({
      title: t.jobPostings.manage.deleteApplicationTitle,
      message: t.jobPostings.manage.deleteApplicationMessage(applicantName(a)),
      confirmLabel: t.jobPostings.manage.delete,
      variant: 'danger',
      onConfirm: () => deleteApplicationMutation.mutate(a.id),
    });
  };

  useEscapeKey(() => setViewingCandidateApp(null), !!viewingCandidateApp);
  useEscapeKey(() => setScheduling(null), !!scheduling);

  return (
    <div>
      <div className="page__header page__header--row">
        <div>
          <h1>{t.jobPostings.title}</h1>
          <p className="page__subtitle">{t.jobPostings.manage.subtitle}</p>
        </div>
        <button className="btn btn--primary" onClick={openAddModal}>
          <Plus size={16} aria-hidden="true" />
          {t.jobPostings.manage.addJobPosting}
        </button>
      </div>

      <div className="toolbar">
        <input
          className="toolbar__search"
          type="search"
          placeholder={t.jobPostings.manage.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && <TableSkeleton columns={isAdmin ? 8 : 7} />}
      {isError && <p className="jobs__status">{t.jobPostings.manage.errorLoad}</p>}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">{t.common.noRecords}</span>
          <p>{search ? t.jobPostings.manage.noneMatchSearch : t.jobPostings.manage.noneYet}</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-icon"></th>
                <SortableTh label={t.jobPostings.columnTitle} sortKey="title" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh
                  label={t.jobPostings.columnDepartment}
                  sortKey="department"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={toggleSort}
                />
                <SortableTh label={t.jobPostings.columnType} sortKey="type" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                {isAdmin && (
                  <SortableTh
                    label={t.jobPostings.columnCompany}
                    sortKey="company"
                    activeKey={sortKey}
                    direction={direction}
                    onSort={toggleSort}
                  />
                )}
                <SortableTh
                  label={t.jobPostings.columnDeadline}
                  sortKey="deadline"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={toggleSort}
                />
                <SortableTh label={t.jobPostings.columnStatus} sortKey="status" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((job) => (
                <JobPostingRow
                  key={job.id}
                  job={job}
                  isAdmin={isAdmin}
                  columnCount={isAdmin ? 8 : 7}
                  expanded={expandedId === job.id}
                  onToggleExpand={() => toggleExpand(job.id)}
                  onEdit={() => openEditModal(job)}
                  onToggleStatus={() => toggleStatus(job)}
                  statusPending={statusMutation.isPending}
                  onDelete={() => handleDelete(job)}
                  deletePending={deleteMutation.isPending}
                  onViewCandidateCv={handleViewCandidateCv}
                  onViewCandidateProfile={setViewingCandidateApp}
                  onAcceptCandidate={openScheduleForApplication}
                  onDeleteApplication={handleDeleteApplication}
                  t={t}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t.jobPostings.manage.addModalTitle}</h2>
            <form onSubmit={handleCreateSubmit}>
              {formError && <div className="alert alert--error">{formError}</div>}
              <div className="fieldset">
                {isAdmin && (
                  <label className="field">
                    <span>{t.jobPostings.manage.company}</span>
                    <select value={companyId} onChange={(e) => setCompanyId(Number(e.target.value) || '')} required>
                      <option value="">{t.jobPostings.manage.selectCompany}</option>
                      {(companies ?? []).map((c: Company) => (
                        <option key={c.idCompany} value={c.idCompany}>
                          {c.companyName}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="field">
                  <span>{t.jobPostings.manage.titleLabel}</span>
                  <input
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    required
                  />
                </label>
                <div className="field-row">
                  <label className="field">
                    <span>{t.jobPostings.manage.department}</span>
                    <input
                      value={form.department}
                      onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>{t.jobPostings.manage.contractType}</span>
                    <select
                      value={form.jobType}
                      onChange={(e) => setForm((f) => ({ ...f, jobType: e.target.value as TypeContrat }))}
                    >
                      {Object.entries(TYPE_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="field">
                  <span>{t.jobPostings.description}</span>
                  <textarea
                    rows={4}
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>{t.jobPostings.manage.requiredSkillsLabel}</span>
                  <input
                    value={form.requiredSkills}
                    onChange={(e) => setForm((f) => ({ ...f, requiredSkills: e.target.value }))}
                    placeholder={t.jobPostings.manage.requiredSkillsPlaceholder}
                  />
                </label>
                <label className="field">
                  <span>{t.jobPostings.manage.deadlineOptional}</span>
                  <input
                    type="date"
                    value={form.deadline}
                    onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
                  />
                </label>
              </div>
              <div className="modal__actions">
                <button type="button" className="btn btn--ghost" onClick={() => setShowAddModal(false)}>
                  {t.jobPostings.manage.cancel}
                </button>
                <button className="btn btn--primary" type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? t.jobPostings.manage.creating : t.jobPostings.manage.createPosting}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t.jobPostings.manage.editModalTitle}</h2>
            <form onSubmit={handleEditSubmit}>
              {formError && <div className="alert alert--error">{formError}</div>}
              <div className="fieldset">
                <label className="field">
                  <span>{t.jobPostings.manage.titleLabel}</span>
                  <input
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    required
                  />
                </label>
                <div className="field-row">
                  <label className="field">
                    <span>{t.jobPostings.manage.department}</span>
                    <input
                      value={form.department}
                      onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>{t.jobPostings.manage.contractType}</span>
                    <select
                      value={form.jobType}
                      onChange={(e) => setForm((f) => ({ ...f, jobType: e.target.value as TypeContrat }))}
                    >
                      {Object.entries(TYPE_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="field">
                  <span>{t.jobPostings.description}</span>
                  <textarea
                    rows={4}
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>{t.jobPostings.manage.requiredSkillsLabel}</span>
                  <input
                    value={form.requiredSkills}
                    onChange={(e) => setForm((f) => ({ ...f, requiredSkills: e.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>{t.jobPostings.manage.deadlineOptional}</span>
                  <input
                    type="date"
                    value={form.deadline}
                    onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
                  />
                </label>
              </div>
              <div className="modal__actions">
                <button type="button" className="btn btn--ghost" onClick={() => setEditing(null)}>
                  {t.jobPostings.manage.cancel}
                </button>
                <button className="btn btn--primary" type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? t.jobPostings.manage.saving : t.jobPostings.manage.saveChanges}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewingCandidateApp && (
        <div className="modal-overlay" onClick={() => setViewingCandidateApp(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{applicantName(viewingCandidateApp)}</h2>
            <div className="detail-grid">
              <div className="detail-grid__item">
                <span>{t.jobPostings.manage.email}</span>
                <strong>{viewingCandidateApp.candidate?.email || '—'}</strong>
              </div>
              <div className="detail-grid__item">
                <span>{t.jobPostings.manage.phone}</span>
                <strong>{viewingCandidateApp.candidate?.phoneNumber || '—'}</strong>
              </div>
              <div className="detail-grid__item">
                <span>{t.jobPostings.manage.cin}</span>
                <strong>{viewingCandidateApp.candidate?.cin || '—'}</strong>
              </div>
              <div className="detail-grid__item">
                <span>{t.jobPostings.manage.experience}</span>
                <strong>
                  {viewingCandidateApp.candidate?.yearsOfExperience != null
                    ? t.jobPostings.manage.years(viewingCandidateApp.candidate.yearsOfExperience)
                    : '—'}
                </strong>
              </div>
              <div className="detail-grid__item">
                <span>{t.jobPostings.manage.appliedFor}</span>
                <strong>{viewingCandidateApp.jobPosting?.title || '—'}</strong>
              </div>
              <div className="detail-grid__item">
                <span>{t.jobPostings.manage.status}</span>
                <strong>
                  {viewingCandidateApp.status
                    ? t.applicationStatus[viewingCandidateApp.status as keyof Messages['applicationStatus']] ?? viewingCandidateApp.status
                    : '—'}
                </strong>
              </div>
            </div>
            <div className="modal__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setViewingCandidateApp(null)}>
                {t.jobPostings.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {scheduling && (
        <div className="modal-overlay" onClick={() => setScheduling(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t.jobPostings.manage.scheduleModalTitle(applicantName(scheduling))}</h2>
            <form onSubmit={handleScheduleSubmit}>
              {scheduleError && <div className="alert alert--error">{scheduleError}</div>}
              <div className="fieldset">
                <label className="field">
                  <span>{t.jobPostings.manage.dateTime}</span>
                  <input
                    type="datetime-local"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  <span>{t.jobPostings.manage.location}</span>
                  <input
                    value={scheduleLocation}
                    onChange={(e) => setScheduleLocation(e.target.value)}
                    placeholder={t.jobPostings.manage.locationPlaceholder}
                    required
                  />
                </label>
              </div>
              <div className="modal__actions">
                <button type="button" className="btn btn--ghost" onClick={() => setScheduling(null)}>
                  {t.jobPostings.manage.cancel}
                </button>
                <button className="btn btn--primary" type="submit" disabled={scheduleMutation.isPending}>
                  {scheduleMutation.isPending ? t.jobPostings.manage.scheduling : t.jobPostings.manage.acceptAndSchedule}
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

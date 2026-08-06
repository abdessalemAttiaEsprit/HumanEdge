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

const TYPE_LABEL: Record<TypeContrat, string> = {
  CDI: 'Permanent',
  CDD: 'Fixed-term',
  CDD_AI: 'Fixed-term (AI)',
  PROJET: 'Project-based',
  INTERIM: 'Temp / Interim',
  APPRENTISSAGE: 'Apprenticeship',
  STAGE: 'Internship',
  CONVENTION: 'Agreement',
};

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

function getJobSortValue(j: JobPosting, key: JobSortKey): string | number {
  switch (key) {
    case 'title':
      return j.title ?? '';
    case 'department':
      return j.department ?? '';
    case 'type':
      return j.jobType ? TYPE_LABEL[j.jobType] : '';
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
        <td data-label="Title">{job.title}</td>
        <td data-label="Department">{job.department || '—'}</td>
        <td data-label="Type">{job.jobType ? TYPE_LABEL[job.jobType] : '—'}</td>
        {isAdmin && <td data-label="Company">{job.createdByCompany?.companyName ?? '—'}</td>}
        <td data-label="Deadline">{job.deadline ? job.deadline.slice(0, 10) : '—'}</td>
        <td data-label="Status">
          {job.status === 'OPEN' ? (
            <span className="badge badge--success">Open</span>
          ) : (
            <span className="badge badge--muted">{job.status || 'Closed'}</span>
          )}
        </td>
        <td className="data-table__actions" data-label="" onClick={(e) => e.stopPropagation()}>
          <RowActionsMenu
            ariaLabel={`Actions for ${job.title}`}
            items={[
              { label: 'Edit', icon: <Pencil size={15} aria-hidden="true" />, onClick: onEdit },
              {
                label: job.status === 'OPEN' ? 'Close' : 'Reopen',
                icon:
                  job.status === 'OPEN' ? <Lock size={15} aria-hidden="true" /> : <Unlock size={15} aria-hidden="true" />,
                disabled: statusPending,
                onClick: onToggleStatus,
              },
              {
                label: 'Delete',
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
                  <span className="contract-panel__label">Description</span>
                  <span className="contract-panel__value">{job.description || '—'}</span>
                </div>
                <div className="contract-panel__item">
                  <span className="contract-panel__label">Required skills</span>
                  <span className="contract-panel__value">
                    {job.requiredSkills?.length ? job.requiredSkills.join(', ') : '—'}
                  </span>
                </div>
              </div>

              <h4 className="contract-panel__section-title">Candidates for this posting</h4>
              {applicationsLoading && <p className="field-hint">Loading candidates…</p>}
              {!applicationsLoading && (applications?.length ?? 0) === 0 && (
                <p className="field-hint">No applications yet.</p>
              )}
              {!applicationsLoading && (applications?.length ?? 0) > 0 && (
                <table className="data-table data-table--nested">
                  <thead>
                    <tr>
                      <th>Candidate</th>
                      <th>Status</th>
                      <th>Applied</th>
                      <th>AI score</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications!.map((a) => (
                      <tr key={a.id} onClick={(e) => e.stopPropagation()}>
                        <td data-label="Candidate">{applicantName(a)}</td>
                        <td data-label="Status">
                          <span className={applicationStatusBadgeClass(a.status)}>{a.status || '—'}</span>
                        </td>
                        <td data-label="Applied">{a.appliedDate ? a.appliedDate.slice(0, 10) : '—'}</td>
                        <td data-label="AI score">{a.aiScore != null ? a.aiScore.toFixed(1) : '—'}</td>
                        <td className="data-table__actions" data-label="">
                          <RowActionsMenu
                            ariaLabel={`Actions for the candidature of ${applicantName(a)}`}
                            items={[
                              {
                                label: 'View CV',
                                icon: <FileText size={15} aria-hidden="true" />,
                                disabled: !a.candidate?.cvFileId,
                                onClick: () => onViewCandidateCv(a),
                              },
                              {
                                label: 'Profile',
                                icon: <Eye size={15} aria-hidden="true" />,
                                onClick: () => onViewCandidateProfile(a),
                              },
                              {
                                label: 'Accept → schedule interview',
                                icon: <CalendarCheck size={15} aria-hidden="true" />,
                                onClick: () => onAcceptCandidate(a),
                              },
                              {
                                label: 'Delete',
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
    onError: (err) => setFormError(getErrorMessage(err, 'Unable to submit your application')),
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
        <h1>Job Postings</h1>
        <p className="page__subtitle">
          Browse open positions posted by companies on HumanEdge. Open a listing to see the
          full description and required skills, and apply directly with a cover letter.
        </p>
      </div>

      {isLoading && <p className="jobs__status">Loading job openings…</p>}
      {isError && <p className="jobs__status">Unable to load job openings right now.</p>}
      {!isLoading && !isError && (jobs?.length ?? 0) === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">No openings</span>
          <p>No open positions right now. Check back soon!</p>
        </div>
      )}

      {(jobs?.length ?? 0) > 0 && (
        <div className="jobs__grid jobs__grid--embedded">
          {jobs!.map((job) => (
            <div key={job.id} className="job-card">
              <div className="job-card__top">
                {job.jobType && <span className="job-card__type">{TYPE_LABEL[job.jobType]}</span>}
                {job.department && <span className="job-card__dept">{job.department}</span>}
              </div>
              <h3>{job.title}</h3>
              {job.companyName && <p className="job-card__company">{job.companyName}</p>}
              {job.description && <p className="job-card__desc">{job.description}</p>}
              {isGuest && (
                appliedJobIds.has(job.id) ? (
                  <span className="badge badge--soft">Applied</span>
                ) : hasProfile ? (
                  <button className="btn btn--ghost btn--sm" onClick={() => openApply(job)}>
                    Apply
                  </button>
                ) : (
                  <p className="field-hint">
                    <Link to="/candidates">Complete your candidate profile</Link> to apply.
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
            <h2>Apply — {applying.title}</h2>
            <form onSubmit={handleApplySubmit}>
              {formError && <div className="alert alert--error">{formError}</div>}
              <div className="fieldset">
                <label className="field">
                  <span>Cover letter</span>
                  <textarea
                    rows={5}
                    value={coverLetter}
                    onChange={(e) => setCoverLetter(e.target.value)}
                    placeholder="Tell them why you're a great fit…"
                    required
                  />
                </label>
              </div>
              <div className="modal__actions">
                <button type="button" className="btn btn--ghost" onClick={() => setApplying(null)}>
                  Cancel
                </button>
                <button className="btn btn--primary" type="submit" disabled={applyMutation.isPending}>
                  {applyMutation.isPending ? 'Submitting…' : 'Submit application'}
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

  const { sorted, sortKey, direction, toggleSort } = useSort<JobPosting, JobSortKey>(filtered, getJobSortValue);
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
    onError: (err) => setFormError(getErrorMessage(err, 'Unable to create the job posting')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ReturnType<typeof toRequestPayload> }) =>
      jobPostingsApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-postings'] });
      setEditing(null);
      setFormError(null);
    },
    onError: (err) => setFormError(getErrorMessage(err, 'Unable to update the job posting')),
  });

  const deleteMutation = useMutation({
    mutationFn: jobPostingsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-postings'] });
      toast.showSuccess('Job posting deleted.');
    },
    onError: (err) => toast.showError(getErrorMessage(err, 'Unable to delete the job posting')),
  });

  const deleteApplicationMutation = useMutation({
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

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => jobPostingsApi.changeStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-postings'] });
      toast.showSuccess('Job posting status updated.');
    },
    onError: (err) => toast.showError(getErrorMessage(err, 'Unable to update the job posting status')),
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
      setFormError('Please select a company');
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
      title: 'Delete job posting',
      message: `Delete the job posting "${job.title}"? This cannot be undone.`,
      confirmLabel: 'Delete',
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
      title: 'Delete application',
      message: `Delete the application from ${applicantName(a)}? This cannot be undone.`,
      confirmLabel: 'Delete',
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
          <h1>Job Postings</h1>
          <p className="page__subtitle">
            Publish and manage your company's open positions, and review every application
            received for each one without leaving the page. Shortlist candidates, schedule
            interviews, and track hiring progress from a single view.
          </p>
        </div>
        <button className="btn btn--primary" onClick={openAddModal}>
          <Plus size={16} aria-hidden="true" />
          Add job posting
        </button>
      </div>

      <div className="toolbar">
        <input
          className="toolbar__search"
          type="search"
          placeholder="Search by title, department, company…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && <TableSkeleton columns={isAdmin ? 8 : 7} />}
      {isError && <p className="jobs__status">Unable to load job postings.</p>}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">No records</span>
          <p>{search ? 'No job postings match your search.' : 'No job postings yet. Add the first one.'}</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-icon"></th>
                <SortableTh label="Title" sortKey="title" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh
                  label="Department"
                  sortKey="department"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={toggleSort}
                />
                <SortableTh label="Type" sortKey="type" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                {isAdmin && (
                  <SortableTh
                    label="Company"
                    sortKey="company"
                    activeKey={sortKey}
                    direction={direction}
                    onSort={toggleSort}
                  />
                )}
                <SortableTh
                  label="Deadline"
                  sortKey="deadline"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={toggleSort}
                />
                <SortableTh label="Status" sortKey="status" activeKey={sortKey} direction={direction} onSort={toggleSort} />
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
            <h2>Add job posting</h2>
            <form onSubmit={handleCreateSubmit}>
              {formError && <div className="alert alert--error">{formError}</div>}
              <div className="fieldset">
                {isAdmin && (
                  <label className="field">
                    <span>Company</span>
                    <select value={companyId} onChange={(e) => setCompanyId(Number(e.target.value) || '')} required>
                      <option value="">Select a company…</option>
                      {(companies ?? []).map((c: Company) => (
                        <option key={c.idCompany} value={c.idCompany}>
                          {c.companyName}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="field">
                  <span>Title</span>
                  <input
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    required
                  />
                </label>
                <div className="field-row">
                  <label className="field">
                    <span>Department</span>
                    <input
                      value={form.department}
                      onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>Contract type</span>
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
                  <span>Description</span>
                  <textarea
                    rows={4}
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Required skills (comma-separated)</span>
                  <input
                    value={form.requiredSkills}
                    onChange={(e) => setForm((f) => ({ ...f, requiredSkills: e.target.value }))}
                    placeholder="e.g. React, TypeScript, SQL"
                  />
                </label>
                <label className="field">
                  <span>Application deadline (optional)</span>
                  <input
                    type="date"
                    value={form.deadline}
                    onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
                  />
                </label>
              </div>
              <div className="modal__actions">
                <button type="button" className="btn btn--ghost" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button className="btn btn--primary" type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating…' : 'Create posting'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit job posting</h2>
            <form onSubmit={handleEditSubmit}>
              {formError && <div className="alert alert--error">{formError}</div>}
              <div className="fieldset">
                <label className="field">
                  <span>Title</span>
                  <input
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    required
                  />
                </label>
                <div className="field-row">
                  <label className="field">
                    <span>Department</span>
                    <input
                      value={form.department}
                      onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>Contract type</span>
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
                  <span>Description</span>
                  <textarea
                    rows={4}
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Required skills (comma-separated)</span>
                  <input
                    value={form.requiredSkills}
                    onChange={(e) => setForm((f) => ({ ...f, requiredSkills: e.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Application deadline (optional)</span>
                  <input
                    type="date"
                    value={form.deadline}
                    onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
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

      {viewingCandidateApp && (
        <div className="modal-overlay" onClick={() => setViewingCandidateApp(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{applicantName(viewingCandidateApp)}</h2>
            <div className="detail-grid">
              <div className="detail-grid__item">
                <span>Email</span>
                <strong>{viewingCandidateApp.candidate?.email || '—'}</strong>
              </div>
              <div className="detail-grid__item">
                <span>Phone</span>
                <strong>{viewingCandidateApp.candidate?.phoneNumber || '—'}</strong>
              </div>
              <div className="detail-grid__item">
                <span>CIN</span>
                <strong>{viewingCandidateApp.candidate?.cin || '—'}</strong>
              </div>
              <div className="detail-grid__item">
                <span>Experience</span>
                <strong>
                  {viewingCandidateApp.candidate?.yearsOfExperience != null
                    ? `${viewingCandidateApp.candidate.yearsOfExperience} yrs`
                    : '—'}
                </strong>
              </div>
              <div className="detail-grid__item">
                <span>Applied for</span>
                <strong>{viewingCandidateApp.jobPosting?.title || '—'}</strong>
              </div>
              <div className="detail-grid__item">
                <span>Status</span>
                <strong>{viewingCandidateApp.status || '—'}</strong>
              </div>
            </div>
            <div className="modal__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setViewingCandidateApp(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {scheduling && (
        <div className="modal-overlay" onClick={() => setScheduling(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Schedule interview — {applicantName(scheduling)}</h2>
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
                  {scheduleMutation.isPending ? 'Scheduling…' : 'Accept & schedule interview'}
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

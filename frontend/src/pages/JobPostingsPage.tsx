import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { jobPostingsApi } from '@/api/jobPostings';
import { publicJobsApi } from '@/api/publicJobs';
import { companiesApi } from '@/api/companies';
import { candidatesApi } from '@/api/candidates';
import { applicationsApi } from '@/api/applications';
import { useAuth } from '@/auth/useAuth';
import { getErrorMessage } from '@/lib/errors';
import { IconButton } from '@/components/IconButton';
import type { Company, JobPosting, JobPostingCreateRequest, PublicJobResponse, TypeContrat } from '@/types';

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
        <p className="page__subtitle">Open positions across HumanEdge partner companies.</p>
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

  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editing, setEditing] = useState<JobPosting | null>(null);
  const [companyId, setCompanyId] = useState<number | ''>('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: jobs, isLoading, isError } = useQuery({
    queryKey: ['job-postings'],
    queryFn: jobPostingsApi.list,
  });

  const { data: companies } = useQuery({
    queryKey: ['companies'],
    queryFn: companiesApi.list,
    enabled: isAdmin && showAddModal,
  });

  // Backend returns every company's postings unfiltered for authenticated reads — a
  // COMPANY user should only manage (and mainly see) their own, since edit/delete on
  // another company's posting would 403 anyway.
  const visibleJobs = useMemo(() => {
    if (!jobs) return [];
    if (isAdmin) return jobs;
    return jobs.filter((j) => j.createdByCompany?.idCompany === user?.companyId);
  }, [jobs, isAdmin, user?.companyId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return visibleJobs;
    return visibleJobs.filter((j) =>
      [j.title, j.department, j.createdByCompany?.companyName].filter(Boolean).join(' ').toLowerCase().includes(q),
    );
  }, [visibleJobs, search]);

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['job-postings'] }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => jobPostingsApi.changeStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['job-postings'] }),
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
    if (!window.confirm(`Delete the job posting "${job.title}"? This cannot be undone.`)) return;
    deleteMutation.mutate(job.id);
  };

  const toggleStatus = (job: JobPosting) => {
    const next = job.status === 'OPEN' ? 'CLOSED' : 'OPEN';
    statusMutation.mutate({ id: job.id, status: next });
  };

  return (
    <div>
      <div className="page__header page__header--row">
        <div>
          <h1>Job Postings</h1>
          <p className="page__subtitle">Publish and manage your open positions.</p>
        </div>
        <button className="btn btn--primary" onClick={openAddModal}>
          + Add job posting
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

      {isLoading && <p className="jobs__status">Loading job postings…</p>}
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
                <th>Title</th>
                <th>Department</th>
                <th>Type</th>
                {isAdmin && <th>Company</th>}
                <th>Deadline</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((job) => (
                <tr key={job.id}>
                  <td>{job.title}</td>
                  <td>{job.department || '—'}</td>
                  <td>{job.jobType ? TYPE_LABEL[job.jobType] : '—'}</td>
                  {isAdmin && <td>{job.createdByCompany?.companyName ?? '—'}</td>}
                  <td>{job.deadline ? job.deadline.slice(0, 10) : '—'}</td>
                  <td>
                    {job.status === 'OPEN' ? (
                      <span className="badge badge--soft">Open</span>
                    ) : (
                      <span className="badge badge--muted">{job.status || 'Closed'}</span>
                    )}
                  </td>
                  <td className="data-table__actions">
                    <IconButton icon="✏️" label="Edit" onClick={() => openEditModal(job)} />
                    <IconButton
                      icon={job.status === 'OPEN' ? '🔒' : '🔓'}
                      label={job.status === 'OPEN' ? 'Close' : 'Reopen'}
                      onClick={() => toggleStatus(job)}
                      disabled={statusMutation.isPending}
                    />
                    <IconButton
                      icon="🗑️"
                      label="Delete"
                      variant="danger"
                      onClick={() => handleDelete(job)}
                      disabled={deleteMutation.isPending}
                    />
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
    </div>
  );
}

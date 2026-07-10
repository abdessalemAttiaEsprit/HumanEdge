import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { candidatesApi } from '@/api/candidates';
import { applicationsApi } from '@/api/applications';
import { interviewsApi } from '@/api/interviews';
import { useAuth } from '@/auth/useAuth';
import { getErrorMessage } from '@/lib/errors';
import { usePagination } from '@/lib/usePagination';
import { useEscapeKey } from '@/lib/useEscapeKey';
import { IconButton } from '@/components/IconButton';
import { Pagination } from '@/components/Pagination';
import { useToast } from '@/components/ToastProvider';
import type { Candidate, CandidateCreateRequest, CandidateUpdateRequest } from '@/types';

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  phoneNumber: '',
  cin: '',
  dateOfBirth: '',
  yearsOfExperience: '',
};

function candidateName(c?: Candidate | null): string {
  if (!c) return '—';
  return [c.firstName, c.lastName].filter(Boolean).join(' ') || '—';
}

function toRequestPayload(f: typeof EMPTY_FORM) {
  return {
    firstName: f.firstName,
    lastName: f.lastName,
    email: f.email,
    phoneNumber: f.phoneNumber || undefined,
    cin: f.cin || undefined,
    dateOfBirth: f.dateOfBirth || undefined,
    yearsOfExperience: f.yearsOfExperience ? Number(f.yearsOfExperience) : undefined,
  };
}

function formFromCandidate(c: Candidate): typeof EMPTY_FORM {
  return {
    firstName: c.firstName ?? '',
    lastName: c.lastName ?? '',
    email: c.email ?? '',
    phoneNumber: c.phoneNumber ?? '',
    cin: c.cin ?? '',
    dateOfBirth: c.dateOfBirth ?? '',
    yearsOfExperience: c.yearsOfExperience != null ? String(c.yearsOfExperience) : '',
  };
}

export function CandidatesPage() {
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'COMPANY';
  return canManage ? <ManageCandidates /> : <MyCandidateProfile />;
}

// ============================================================================
// GUEST: self-service — create/view/edit own candidate profile, upload a CV.
// ============================================================================
function MyCandidateProfile() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [cvError, setCvError] = useState<string | null>(null);

  const { data: me, isLoading, error } = useQuery({
    queryKey: ['candidate', 'me'],
    queryFn: candidatesApi.getMine,
    retry: false,
  });
  const hasProfile = !(error instanceof AxiosError && error.response?.status === 404);

  const createMutation = useMutation({
    mutationFn: candidatesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate', 'me'] });
      setFormError(null);
    },
    onError: (err) => setFormError(getErrorMessage(err, 'Unable to create your profile')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: CandidateUpdateRequest }) =>
      candidatesApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate', 'me'] });
      setEditing(false);
      setFormError(null);
    },
    onError: (err) => setFormError(getErrorMessage(err, 'Unable to update your profile')),
  });

  const uploadCvMutation = useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => candidatesApi.uploadCv(id, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate', 'me'] });
      setCvError(null);
    },
    onError: (err) => setCvError(getErrorMessage(err, 'Unable to upload your CV')),
  });

  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const payload: CandidateCreateRequest = toRequestPayload(form);
    createMutation.mutate(payload);
  };

  const handleEditSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!me) return;
    setFormError(null);
    updateMutation.mutate({ id: me.id, payload: { ...toRequestPayload(form), cvFileId: me.cvFileId } });
  };

  const openEdit = () => {
    if (!me) return;
    setForm(formFromCandidate(me));
    setFormError(null);
    setEditing(true);
  };

  const handleCvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !me) return;
    uploadCvMutation.mutate({ id: me.id, file });
    e.target.value = '';
  };

  useEscapeKey(() => setEditing(false), editing);

  if (isLoading) return <p className="jobs__status">Loading your profile…</p>;

  if (!hasProfile) {
    return (
      <div>
        <div className="page__header">
          <h1>My candidate profile</h1>
          <p className="page__subtitle">Create your profile so recruiters and your future applications can find you.</p>
        </div>
        <div className="table-wrap" style={{ padding: 24 }}>
          <form onSubmit={handleCreateSubmit}>
            {formError && <div className="alert alert--error">{formError}</div>}
            <div className="fieldset">
              <div className="field-row">
                <label className="field">
                  <span>First name</span>
                  <input
                    value={form.firstName}
                    onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                    required
                  />
                </label>
                <label className="field">
                  <span>Last name</span>
                  <input
                    value={form.lastName}
                    onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                    required
                  />
                </label>
              </div>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  required
                />
              </label>
              <div className="field-row">
                <label className="field">
                  <span>Phone</span>
                  <input
                    value={form.phoneNumber}
                    onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>CIN</span>
                  <input value={form.cin} onChange={(e) => setForm((f) => ({ ...f, cin: e.target.value }))} />
                </label>
              </div>
              <div className="field-row">
                <label className="field">
                  <span>Date of birth</span>
                  <input
                    type="date"
                    value={form.dateOfBirth}
                    onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Years of experience</span>
                  <input
                    type="number"
                    min={0}
                    value={form.yearsOfExperience}
                    onChange={(e) => setForm((f) => ({ ...f, yearsOfExperience: e.target.value }))}
                  />
                </label>
              </div>
            </div>
            <div className="modal__actions modal__actions--start">
              <button className="btn btn--primary" type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating…' : 'Create my profile'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (!me) return null;

  return (
    <div>
      <div className="page__header page__header--row">
        <div>
          <h1>My candidate profile</h1>
          <p className="page__subtitle">This is what recruiters see when you apply to a job.</p>
        </div>
        <button className="btn btn--primary" onClick={openEdit}>
          Edit profile
        </button>
      </div>

      <div className="table-wrap" style={{ padding: 24 }}>
        <div className="detail-grid">
          <div className="detail-grid__item">
            <span>Name</span>
            <strong>{candidateName(me)}</strong>
          </div>
          <div className="detail-grid__item">
            <span>Email</span>
            <strong>{me.email || '—'}</strong>
          </div>
          <div className="detail-grid__item">
            <span>Phone</span>
            <strong>{me.phoneNumber || '—'}</strong>
          </div>
          <div className="detail-grid__item">
            <span>CIN</span>
            <strong>{me.cin || '—'}</strong>
          </div>
          <div className="detail-grid__item">
            <span>Date of birth</span>
            <strong>{me.dateOfBirth || '—'}</strong>
          </div>
          <div className="detail-grid__item">
            <span>Years of experience</span>
            <strong>{me.yearsOfExperience ?? '—'}</strong>
          </div>
        </div>

        <label className="field" style={{ maxWidth: 360 }}>
          <span>CV / résumé</span>
          <input type="file" accept=".pdf,.doc,.docx" onChange={handleCvChange} />
        </label>
        {cvError && <div className="alert alert--error">{cvError}</div>}
        {me.cvFileId ? (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => candidatesApi.downloadCv(me.id, me.cvFileId ?? undefined)}
          >
            Download current CV
          </button>
        ) : (
          <p className="field-hint">No CV on file yet.</p>
        )}
      </div>

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit my profile</h2>
            <form onSubmit={handleEditSubmit}>
              {formError && <div className="alert alert--error">{formError}</div>}
              <div className="fieldset">
                <div className="field-row">
                  <label className="field">
                    <span>First name</span>
                    <input
                      value={form.firstName}
                      onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Last name</span>
                    <input
                      value={form.lastName}
                      onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                      required
                    />
                  </label>
                </div>
                <label className="field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    required
                  />
                </label>
                <div className="field-row">
                  <label className="field">
                    <span>Phone</span>
                    <input
                      value={form.phoneNumber}
                      onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>CIN</span>
                    <input value={form.cin} onChange={(e) => setForm((f) => ({ ...f, cin: e.target.value }))} />
                  </label>
                </div>
                <div className="field-row">
                  <label className="field">
                    <span>Date of birth</span>
                    <input
                      type="date"
                      value={form.dateOfBirth}
                      onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>Years of experience</span>
                    <input
                      type="number"
                      min={0}
                      value={form.yearsOfExperience}
                      onChange={(e) => setForm((f) => ({ ...f, yearsOfExperience: e.target.value }))}
                    />
                  </label>
                </div>
              </div>
              <div className="modal__actions">
                <button type="button" className="btn btn--ghost" onClick={() => setEditing(false)}>
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

// ============================================================================
// ADMIN / COMPANY: browse candidate profiles, view their applications/interviews.
// ============================================================================
function ManageCandidates() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [viewing, setViewing] = useState<Candidate | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: candidates, isLoading, isError } = useQuery({
    queryKey: ['candidates'],
    queryFn: candidatesApi.list,
  });

  const { data: viewApplications } = useQuery({
    queryKey: ['applications', 'by-candidate', viewing?.id],
    queryFn: () => applicationsApi.listByCandidate(viewing!.id),
    enabled: !!viewing,
  });

  const { data: viewInterviews } = useQuery({
    queryKey: ['interviews', 'by-candidate', viewing?.id],
    queryFn: () => interviewsApi.listByCandidate(viewing!.id),
    enabled: !!viewing,
  });

  const createMutation = useMutation({
    mutationFn: candidatesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      setShowAddModal(false);
      setForm(EMPTY_FORM);
      setFormError(null);
      toast.showSuccess('Candidate profile created.');
    },
    onError: (err) => setFormError(getErrorMessage(err, 'Unable to create the candidate')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: CandidateUpdateRequest }) =>
      candidatesApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      setEditing(null);
      setFormError(null);
      toast.showSuccess('Candidate profile updated.');
    },
    onError: (err) => setFormError(getErrorMessage(err, 'Unable to update the candidate')),
  });

  const deleteMutation = useMutation({
    mutationFn: candidatesApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      toast.showSuccess('Candidate profile deleted.');
    },
    onError: (err) => toast.showError(getErrorMessage(err, 'Unable to delete this candidate')),
  });

  const filtered = useMemo(() => {
    if (!candidates) return [];
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) =>
      [candidateName(c), c.email, c.phoneNumber].filter(Boolean).join(' ').toLowerCase().includes(q),
    );
  }, [candidates, search]);

  const openAddModal = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowAddModal(true);
  };

  const openEditModal = (c: Candidate) => {
    setEditing(c);
    setForm(formFromCandidate(c));
    setFormError(null);
  };

  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    createMutation.mutate(toRequestPayload(form));
  };

  const handleEditSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setFormError(null);
    updateMutation.mutate({ id: editing.id, payload: { ...toRequestPayload(form), cvFileId: editing.cvFileId } });
  };

  const handleDelete = (c: Candidate) => {
    if (!window.confirm(`Delete the candidate profile for ${candidateName(c)}? This cannot be undone.`)) return;
    deleteMutation.mutate(c.id);
  };

  const { page, setPage, pageCount, pageItems } = usePagination(filtered, 10);

  useEscapeKey(() => setShowAddModal(false), showAddModal);
  useEscapeKey(() => setEditing(null), !!editing);
  useEscapeKey(() => setViewing(null), !!viewing);

  return (
    <div>
      <div className="page__header page__header--row">
        <div>
          <h1>Candidates</h1>
          <p className="page__subtitle">Browse candidate profiles and their application activity.</p>
        </div>
        <button className="btn btn--primary" onClick={openAddModal}>
          + Add candidate
        </button>
      </div>

      <div className="toolbar">
        <input
          className="toolbar__search"
          type="search"
          placeholder="Search by name, email, phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && <p className="jobs__status">Loading candidates…</p>}
      {isError && <p className="jobs__status">Unable to load candidates.</p>}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">No records</span>
          <p>{search ? 'No candidates match your search.' : 'No candidate profiles yet.'}</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Experience</th>
                <th>CV</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((c) => (
                <tr key={c.id}>
                  <td>{candidateName(c)}</td>
                  <td>{c.email || '—'}</td>
                  <td>{c.phoneNumber || '—'}</td>
                  <td>{c.yearsOfExperience != null ? `${c.yearsOfExperience} yrs` : '—'}</td>
                  <td>
                    {c.cvFileId ? (
                      <span className="badge badge--soft">On file</span>
                    ) : (
                      <span className="badge badge--muted">None</span>
                    )}
                  </td>
                  <td className="data-table__actions">
                    <IconButton icon="👁️" label="View" onClick={() => setViewing(c)} />
                    <IconButton icon="✏️" label="Edit" onClick={() => openEditModal(c)} />
                    <IconButton
                      icon="🗑️"
                      label="Delete"
                      variant="danger"
                      onClick={() => handleDelete(c)}
                      disabled={deleteMutation.isPending}
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
            <h2>Add candidate</h2>
            <form onSubmit={handleCreateSubmit}>
              {formError && <div className="alert alert--error">{formError}</div>}
              <div className="fieldset">
                <div className="field-row">
                  <label className="field">
                    <span>First name</span>
                    <input
                      value={form.firstName}
                      onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Last name</span>
                    <input
                      value={form.lastName}
                      onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                      required
                    />
                  </label>
                </div>
                <label className="field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    required
                  />
                </label>
                <div className="field-row">
                  <label className="field">
                    <span>Phone</span>
                    <input
                      value={form.phoneNumber}
                      onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>CIN</span>
                    <input value={form.cin} onChange={(e) => setForm((f) => ({ ...f, cin: e.target.value }))} />
                  </label>
                </div>
                <div className="field-row">
                  <label className="field">
                    <span>Date of birth</span>
                    <input
                      type="date"
                      value={form.dateOfBirth}
                      onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>Years of experience</span>
                    <input
                      type="number"
                      min={0}
                      value={form.yearsOfExperience}
                      onChange={(e) => setForm((f) => ({ ...f, yearsOfExperience: e.target.value }))}
                    />
                  </label>
                </div>
              </div>
              <div className="modal__actions">
                <button type="button" className="btn btn--ghost" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button className="btn btn--primary" type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating…' : 'Create candidate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit candidate</h2>
            <form onSubmit={handleEditSubmit}>
              {formError && <div className="alert alert--error">{formError}</div>}
              <div className="fieldset">
                <div className="field-row">
                  <label className="field">
                    <span>First name</span>
                    <input
                      value={form.firstName}
                      onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Last name</span>
                    <input
                      value={form.lastName}
                      onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                      required
                    />
                  </label>
                </div>
                <label className="field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    required
                  />
                </label>
                <div className="field-row">
                  <label className="field">
                    <span>Phone</span>
                    <input
                      value={form.phoneNumber}
                      onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>CIN</span>
                    <input value={form.cin} onChange={(e) => setForm((f) => ({ ...f, cin: e.target.value }))} />
                  </label>
                </div>
                <div className="field-row">
                  <label className="field">
                    <span>Date of birth</span>
                    <input
                      type="date"
                      value={form.dateOfBirth}
                      onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>Years of experience</span>
                    <input
                      type="number"
                      min={0}
                      value={form.yearsOfExperience}
                      onChange={(e) => setForm((f) => ({ ...f, yearsOfExperience: e.target.value }))}
                    />
                  </label>
                </div>
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

      {viewing && (
        <div className="modal-overlay" onClick={() => setViewing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{candidateName(viewing)}</h2>
            <div className="detail-grid">
              <div className="detail-grid__item">
                <span>Email</span>
                <strong>{viewing.email || '—'}</strong>
              </div>
              <div className="detail-grid__item">
                <span>Phone</span>
                <strong>{viewing.phoneNumber || '—'}</strong>
              </div>
              <div className="detail-grid__item">
                <span>CIN</span>
                <strong>{viewing.cin || '—'}</strong>
              </div>
              <div className="detail-grid__item">
                <span>Experience</span>
                <strong>{viewing.yearsOfExperience != null ? `${viewing.yearsOfExperience} yrs` : '—'}</strong>
              </div>
            </div>
            {viewing.cvFileId && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => candidatesApi.downloadCv(viewing.id, viewing.cvFileId ?? undefined)}
              >
                Download CV
              </button>
            )}

            <h2 style={{ marginTop: 20 }}>Applications</h2>
            {(viewApplications ?? []).length === 0 ? (
              <p className="field-hint">No applications yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Job</th>
                      <th>Status</th>
                      <th>Applied</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewApplications!.map((a) => (
                      <tr key={a.id}>
                        <td>{a.jobPosting?.title || '—'}</td>
                        <td>
                          <span className="badge badge--soft">{a.status || '—'}</span>
                        </td>
                        <td>{a.appliedDate ? a.appliedDate.slice(0, 10) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h2 style={{ marginTop: 20 }}>Interviews</h2>
            {(viewInterviews ?? []).length === 0 ? (
              <p className="field-hint">No interviews scheduled.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Job</th>
                      <th>Date</th>
                      <th>Location</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewInterviews!.map((iv) => (
                      <tr key={iv.id}>
                        <td>{iv.job?.title || '—'}</td>
                        <td>{iv.interviewDate ? iv.interviewDate.replace('T', ' ').slice(0, 16) : '—'}</td>
                        <td>{iv.interviewLocation || '—'}</td>
                        <td>
                          <span className="badge badge--soft">{iv.status || '—'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="modal__actions">
              <button className="btn btn--ghost" onClick={() => setViewing(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

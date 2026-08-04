import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { candidatesApi } from '@/api/candidates';
import { getErrorMessage } from '@/lib/errors';
import { useEscapeKey } from '@/lib/useEscapeKey';
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

// The Candidates route is GUEST-only (see App.tsx) — self-service creation/edit of the
// caller's own candidate profile, a prerequisite for applying to jobs. ADMIN/COMPANY no
// longer get a dedicated candidate-browsing view here; they see candidates via the
// Applications and Job Postings pages instead.
export function CandidatesPage() {
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


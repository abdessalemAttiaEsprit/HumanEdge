import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { personnelApi } from '@/api/personnel';
import { companiesApi } from '@/api/companies';
import { fileUrl } from '@/api/axios';
import { useAuth } from '@/auth/useAuth';
import { getErrorMessage } from '@/lib/errors';
import { usePagination } from '@/lib/usePagination';
import { useEscapeKey } from '@/lib/useEscapeKey';
import { IconButton } from '@/components/IconButton';
import { Pagination } from '@/components/Pagination';
import { useToast } from '@/components/ToastProvider';
import type { Company, Personnel, PersonnelCreateRequest } from '@/types';

const EMPTY_CREATE: PersonnelCreateRequest = {
  firstname: '',
  lastname: '',
  email: '',
  password: '',
  telephone: '',
  cin: '',
  cnssNumber: '',
  rib: '',
};

interface EditState {
  telephone: string;
  cin: string;
  cnssNumber: string;
  rib: string;
}

function fullName(p: Personnel): string {
  if (!p.user) return '—';
  return `${p.user.firstname} ${p.user.lastname}`;
}

interface PersonnelPrefillState {
  prefillCandidate?: Partial<PersonnelCreateRequest>;
}

export function PersonnelPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const queryClient = useQueryClient();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editing, setEditing] = useState<Personnel | null>(null);
  const [createForm, setCreateForm] = useState<PersonnelCreateRequest>(EMPTY_CREATE);
  const [createPhoto, setCreatePhoto] = useState<File | null>(null);
  const [editForm, setEditForm] = useState<EditState | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [prefillNotice, setPrefillNotice] = useState(false);

  const { data: personnelList, isLoading, isError } = useQuery({
    queryKey: ['personnel'],
    queryFn: personnelApi.list,
  });

  const { data: companies } = useQuery({
    queryKey: ['companies'],
    queryFn: companiesApi.list,
    enabled: isAdmin && showAddModal,
  });

  // Arriving from the Interviews page's "Add as employee" suggestion (completed interview) —
  // pre-fill the create form from the candidate's data and open the modal directly.
  useEffect(() => {
    const state = location.state as PersonnelPrefillState | null;
    if (!state?.prefillCandidate) return;
    setCreateForm({ ...EMPTY_CREATE, ...state.prefillCandidate });
    setPrefillNotice(true);
    setShowAddModal(true);
    navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createMutation = useMutation({
    mutationFn: personnelApi.create,
    onSuccess: async (created) => {
      if (createPhoto) {
        try {
          await personnelApi.uploadImage(created.idPersonnel, createPhoto);
        } catch {
          // The personnel record was created successfully either way; the photo can be
          // added later from the Edit modal, so a failed upload here isn't fatal.
        }
      }
      queryClient.invalidateQueries({ queryKey: ['personnel'] });
      setShowAddModal(false);
      setCreateForm(EMPTY_CREATE);
      setCreatePhoto(null);
      setFormError(null);
      toast.showSuccess('Personnel record created.');
    },
    onError: (err) => setFormError(getErrorMessage(err, 'Unable to create the personnel record')),
  });

  const uploadImageMutation = useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => personnelApi.uploadImage(id, file),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['personnel'] });
      setEditing(updated);
      setPhotoError(null);
    },
    onError: (err) => setPhotoError(getErrorMessage(err, 'Unable to upload the photo')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: EditState & { user: { idUser: number } } }) =>
      personnelApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personnel'] });
      setEditing(null);
      setEditForm(null);
      setFormError(null);
      toast.showSuccess('Personnel record updated.');
    },
    onError: (err) => setFormError(getErrorMessage(err, 'Unable to update the personnel record')),
  });

  const deleteMutation = useMutation({
    mutationFn: personnelApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personnel'] });
      setDeleteError(null);
      toast.showSuccess('Personnel record deleted.');
    },
    onError: (err) => setDeleteError(getErrorMessage(err, 'Unable to delete this personnel record')),
  });

  const filtered = useMemo(() => {
    if (!personnelList) return [];
    const q = search.trim().toLowerCase();
    if (!q) return personnelList;
    return personnelList.filter((p) => {
      const haystack = [fullName(p), p.user?.email, p.cin, p.matricule, p.telephone]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [personnelList, search]);

  const openAddModal = () => {
    setCreateForm({ ...EMPTY_CREATE, companyId: isAdmin ? undefined : undefined });
    setCreatePhoto(null);
    setFormError(null);
    setPrefillNotice(false);
    setShowAddModal(true);
  };

  const openEditModal = (p: Personnel) => {
    setEditing(p);
    setEditForm({
      telephone: p.telephone ?? '',
      cin: p.cin,
      cnssNumber: p.cnssNumber,
      rib: p.rib,
    });
    setFormError(null);
    setPhotoError(null);
  };

  const handleEditPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editing) return;
    uploadImageMutation.mutate({ id: editing.idPersonnel, file });
    e.target.value = '';
  };

  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (isAdmin && !createForm.companyId) {
      setFormError('Please select a company');
      return;
    }
    createMutation.mutate(createForm);
  };

  const handleEditSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!editing || !editForm || !editing.user) return;
    setFormError(null);
    updateMutation.mutate({
      id: editing.idPersonnel,
      payload: { ...editForm, user: { idUser: editing.user.idUser } },
    });
  };

  const handleDelete = (p: Personnel) => {
    if (!window.confirm(`Remove ${fullName(p)} from personnel? This cannot be undone.`)) return;
    setDeleteError(null);
    deleteMutation.mutate(p.idPersonnel);
  };

  const { page, setPage, pageCount, pageItems } = usePagination(filtered, 10);

  useEscapeKey(() => setShowAddModal(false), showAddModal);
  useEscapeKey(() => setEditing(null), !!editing);

  return (
    <div>
      <div className="page__header page__header--row">
        <div>
          <h1>Personnel</h1>
          <p className="page__subtitle">Manage your company's employee records.</p>
        </div>
        <button className="btn btn--primary" onClick={openAddModal}>
          + Add personnel
        </button>
      </div>

      <div className="toolbar">
        <input
          className="toolbar__search"
          type="search"
          placeholder="Search by name, email, CIN…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {deleteError && <div className="alert alert--error">{deleteError}</div>}

      {isLoading && <p className="jobs__status">Loading personnel…</p>}
      {isError && <p className="jobs__status">Unable to load personnel records.</p>}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">No records</span>
          <p>{search ? 'No personnel match your search.' : 'No personnel records yet. Add your first employee.'}</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>CIN</th>
                <th>Phone</th>
                <th>Matricule</th>
                {isAdmin && <th>Company</th>}
                <th>Contract</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((p) => (
                <tr key={p.idPersonnel}>
                  <td className="data-table__name-cell">
                    {p.image ? (
                      <img className="avatar" src={fileUrl(p.image)} alt={fullName(p)} />
                    ) : (
                      <span className="avatar avatar--initials">{fullName(p).slice(0, 1)}</span>
                    )}
                    {fullName(p)}
                  </td>
                  <td>{p.user?.email ?? '—'}</td>
                  <td>{p.cin}</td>
                  <td>{p.telephone || '—'}</td>
                  <td>{p.matricule || '—'}</td>
                  {isAdmin && <td>{p.user?.company?.companyName ?? '—'}</td>}
                  <td>
                    {p.contract ? (
                      <span className="badge badge--soft">{p.contract.typeContrat}</span>
                    ) : (
                      <span className="badge badge--muted">None</span>
                    )}
                  </td>
                  <td className="data-table__actions">
                    <IconButton icon="✏️" label="Edit" onClick={() => openEditModal(p)} />
                    <IconButton
                      icon="📄"
                      label={p.contract ? 'Download work contract' : 'No contract linked yet'}
                      disabled={!p.contract}
                      onClick={() => personnelApi.downloadContractPdf(p.idPersonnel)}
                    />
                    <IconButton
                      icon="📋"
                      label="Download attestation"
                      onClick={() => personnelApi.downloadAttestationPdf(p.idPersonnel)}
                    />
                    <IconButton
                      icon="🗑️"
                      label="Delete"
                      variant="danger"
                      onClick={() => handleDelete(p)}
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
            <h2>Add personnel</h2>
            <p className="auth-shell__subtitle">
              This creates a new employee account and personnel record together.
            </p>
            <form onSubmit={handleCreateSubmit}>
              {formError && <div className="alert alert--error">{formError}</div>}
              {prefillNotice && (
                <div className="alert alert--info">
                  Pre-filled from the interview candidate — set a temporary password and complete
                  the remaining fields (CNSS number, RIB{isAdmin ? ', company' : ''}).
                </div>
              )}

              <div className="fieldset">
                <div className="field-row">
                  <label className="field">
                    <span>First name</span>
                    <input
                      value={createForm.firstname}
                      onChange={(e) => setCreateForm((f) => ({ ...f, firstname: e.target.value }))}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Last name</span>
                    <input
                      value={createForm.lastname}
                      onChange={(e) => setCreateForm((f) => ({ ...f, lastname: e.target.value }))}
                      required
                    />
                  </label>
                </div>
                <label className="field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                    required
                  />
                </label>
                <label className="field">
                  <span>Temporary password</span>
                  <input
                    type="password"
                    value={createForm.password}
                    onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                    required
                  />
                </label>
                {isAdmin && (
                  <label className="field">
                    <span>Company</span>
                    <select
                      value={createForm.companyId ?? ''}
                      onChange={(e) =>
                        setCreateForm((f) => ({ ...f, companyId: Number(e.target.value) || undefined }))
                      }
                      required
                    >
                      <option value="">Select a company…</option>
                      {(companies ?? []).map((c: Company) => (
                        <option key={c.idCompany} value={c.idCompany}>
                          {c.companyName}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              <div className="fieldset">
                <div className="field-row">
                  <label className="field">
                    <span>CIN</span>
                    <input
                      value={createForm.cin}
                      onChange={(e) => setCreateForm((f) => ({ ...f, cin: e.target.value }))}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Phone</span>
                    <input
                      value={createForm.telephone}
                      onChange={(e) => setCreateForm((f) => ({ ...f, telephone: e.target.value }))}
                    />
                  </label>
                </div>
                <label className="field">
                  <span>CNSS number</span>
                  <input
                    value={createForm.cnssNumber}
                    onChange={(e) => setCreateForm((f) => ({ ...f, cnssNumber: e.target.value }))}
                    required
                  />
                </label>
                <p className="field-hint">
                  The matricule is assigned automatically once this employee's first contract is created.
                </p>
                <label className="field">
                  <span>Bank account number (RIB)</span>
                  <input
                    value={createForm.rib}
                    onChange={(e) => setCreateForm((f) => ({ ...f, rib: e.target.value }))}
                    required
                  />
                </label>
                <label className="field">
                  <span>Photo (optional)</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/svg+xml"
                    onChange={(e) => setCreatePhoto(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>

              <div className="modal__actions">
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button className="btn btn--primary" type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating…' : 'Create personnel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editing && editForm && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit {fullName(editing)}</h2>
            <form onSubmit={handleEditSubmit}>
              {formError && <div className="alert alert--error">{formError}</div>}

              <div className="fieldset">
                <div className="field-row">
                  <label className="field">
                    <span>CIN</span>
                    <input
                      value={editForm.cin}
                      onChange={(e) => setEditForm((f) => f && { ...f, cin: e.target.value })}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Phone</span>
                    <input
                      value={editForm.telephone}
                      onChange={(e) => setEditForm((f) => f && { ...f, telephone: e.target.value })}
                    />
                  </label>
                </div>
                <label className="field">
                  <span>CNSS number</span>
                  <input
                    value={editForm.cnssNumber}
                    onChange={(e) => setEditForm((f) => f && { ...f, cnssNumber: e.target.value })}
                    required
                  />
                </label>
                <p className="field-hint">Matricule: {editing.matricule || 'not assigned yet (create a contract first)'}</p>
                <label className="field">
                  <span>Bank account number (RIB)</span>
                  <input
                    value={editForm.rib}
                    onChange={(e) => setEditForm((f) => f && { ...f, rib: e.target.value })}
                    required
                  />
                </label>
                <label className="field">
                  <span>Photo</span>
                  <div className="field-with-preview">
                    {editing.image && (
                      <img className="avatar" src={fileUrl(editing.image)} alt={fullName(editing)} />
                    )}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/svg+xml"
                      onChange={handleEditPhotoChange}
                      disabled={uploadImageMutation.isPending}
                    />
                  </div>
                </label>
                {photoError && <div className="alert alert--error">{photoError}</div>}
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

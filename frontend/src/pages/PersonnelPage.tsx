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
import { useConfirm } from '@/lib/useConfirm';
import { useSort } from '@/lib/useSort';
import { IconButton } from '@/components/IconButton';
import { Pagination } from '@/components/Pagination';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TableSkeleton } from '@/components/TableSkeleton';
import { SortableTh } from '@/components/SortableTh';
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

const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';

function generateTempPassword(): string {
  const bytes = new Uint32Array(12);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PASSWORD_CHARS[b % PASSWORD_CHARS.length]).join('');
}

type PersonnelSortKey = 'name' | 'email' | 'cin' | 'phone' | 'matricule' | 'company' | 'contract';

function getPersonnelSortValue(p: Personnel, key: PersonnelSortKey): string | number {
  switch (key) {
    case 'name':
      return fullName(p);
    case 'email':
      return p.user?.email ?? '';
    case 'cin':
      return p.cin ?? '';
    case 'phone':
      return p.telephone ?? '';
    case 'matricule':
      return p.matricule ?? '';
    case 'company':
      return p.user?.company?.companyName ?? '';
    case 'contract':
      return p.contract?.typeContrat ?? '';
  }
}

interface PersonnelPrefillState {
  prefillCandidate?: Partial<PersonnelCreateRequest>;
}

export function PersonnelPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const queryClient = useQueryClient();
  const toast = useToast();
  const { confirmOptions, requestConfirm, closeConfirm, handleConfirm } = useConfirm();
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
  const [showPassword, setShowPassword] = useState(false);

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
    setShowPassword(false);
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
    requestConfirm({
      title: 'Remove from personnel',
      message: `Remove ${fullName(p)} from personnel? This cannot be undone.`,
      confirmLabel: 'Remove',
      variant: 'danger',
      onConfirm: () => {
        setDeleteError(null);
        deleteMutation.mutate(p.idPersonnel);
      },
    });
  };

  const { sorted, sortKey, direction, toggleSort } = useSort<Personnel, PersonnelSortKey>(
    filtered,
    getPersonnelSortValue,
  );
  const { page, setPage, pageCount, pageItems } = usePagination(sorted, 10);

  useEscapeKey(() => setShowAddModal(false), showAddModal);
  useEscapeKey(() => setEditing(null), !!editing);

  return (
    <div>
      <div className="page__header page__header--row">
        <div>
          <h1>Personnel</h1>
          <p className="page__subtitle">Manage your company's employee records.</p>
        </div>
        <div className="page__header-actions">
          <button className="btn btn--ghost" onClick={() => personnelApi.exportCsv()}>
            ⬇️ Export CSV
          </button>
          <button className="btn btn--primary" onClick={openAddModal}>
            + Add personnel
          </button>
        </div>
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

      {isLoading && <TableSkeleton columns={isAdmin ? 8 : 7} />}
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
                <SortableTh label="Name" sortKey="name" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh label="Email" sortKey="email" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh label="CIN" sortKey="cin" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh label="Phone" sortKey="phone" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh
                  label="Matricule"
                  sortKey="matricule"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={toggleSort}
                />
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
                  label="Contract"
                  sortKey="contract"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={toggleSort}
                />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((p) => (
                <tr key={p.idPersonnel}>
                  <td className="data-table__name-cell" data-label="Name">
                    {p.image ? (
                      <img className="avatar" src={fileUrl(p.image)} alt={fullName(p)} />
                    ) : (
                      <span className="avatar avatar--initials">{fullName(p).slice(0, 1)}</span>
                    )}
                    {fullName(p)}
                  </td>
                  <td data-label="Email">{p.user?.email ?? '—'}</td>
                  <td data-label="CIN">{p.cin}</td>
                  <td data-label="Phone">{p.telephone || '—'}</td>
                  <td data-label="Matricule">{p.matricule || '—'}</td>
                  {isAdmin && <td data-label="Company">{p.user?.company?.companyName ?? '—'}</td>}
                  <td data-label="Contract">
                    {p.contract ? (
                      <span className="badge badge--soft">{p.contract.typeContrat}</span>
                    ) : (
                      <span className="badge badge--muted">None</span>
                    )}
                  </td>
                  <td className="data-table__actions" data-label="">
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
                  <div className="password-field">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={createForm.password}
                      onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                      required
                    />
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => setShowPassword((v) => !v)}
                      title={showPassword ? 'Hide password' : 'Show password'}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      <span aria-hidden="true">{showPassword ? '🙈' : '👁️'}</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => setCreateForm((f) => ({ ...f, password: generateTempPassword() }))}
                    >
                      Generate
                    </button>
                  </div>
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

      <ConfirmDialog options={confirmOptions} onConfirm={handleConfirm} onCancel={closeConfirm} />
    </div>
  );
}

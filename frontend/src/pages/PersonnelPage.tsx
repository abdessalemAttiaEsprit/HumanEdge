import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, CircleDot, Circle, Download, FileSignature, FileText, Pencil, Phone, Plus, Trash2 } from 'lucide-react';
import { personnelApi } from '@/api/personnel';
import { companiesApi } from '@/api/companies';
import { fileUrl } from '@/api/axios';
import { useAuth } from '@/auth/useAuth';
import { useLanguage } from '@/i18n/useLanguage';
import type { Messages } from '@/i18n/en';
import { getErrorMessage } from '@/lib/errors';
import { usePagination } from '@/lib/usePagination';
import { useEscapeKey } from '@/lib/useEscapeKey';
import { useConfirm } from '@/lib/useConfirm';
import { useSort } from '@/lib/useSort';
import { IconButton } from '@/components/IconButton';
import { RowActionsMenu } from '@/components/RowActionsMenu';
import { Pagination } from '@/components/Pagination';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TableSkeleton } from '@/components/TableSkeleton';
import { SortableTh } from '@/components/SortableTh';
import { useToast } from '@/components/ToastProvider';
import type { Company, Contract, Personnel, PersonnelCreateRequest } from '@/types';

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

function isContractActive(c: Contract): boolean {
  return !c.dateFin || new Date(c.dateFin) >= new Date();
}

function formatDate(value?: string): string {
  return value ? value.slice(0, 10) : '—';
}

function formatAmount(value?: number): string | undefined {
  return value != null ? `${value} TND` : undefined;
}

function contractDetails(c: Contract, labels: Messages['personnel']['contractDetailLabels']): Array<[string, string]> {
  const entries: Array<[string, string | undefined]> = [
    [labels.typeContrat, c.typeContrat],
    [labels.work, c.work],
    [labels.categorie, c.categorie],
    [labels.echelon, c.echelon != null ? String(c.echelon) : undefined],
    [labels.dateDebut, formatDate(c.dateDebut)],
    [labels.dateFin, c.dateFin ? formatDate(c.dateFin) : labels.indeterminate],
    [labels.salaireBase, formatAmount(c.salaireBase)],
    [labels.salaireComplementaire, formatAmount(c.salaireComplementaire)],
    [labels.tauxHoraireSup, formatAmount(c.tauxHoraireSup)],
    [labels.avantages, formatAmount(c.avantages)],
  ];
  return entries.filter((e): e is [string, string] => !!e[1]);
}

const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';

function generateTempPassword(): string {
  const bytes = new Uint32Array(12);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PASSWORD_CHARS[b % PASSWORD_CHARS.length]).join('');
}

type PersonnelSortKey = 'name' | 'email' | 'phone' | 'company' | 'contract';

function getPersonnelSortValue(p: Personnel, key: PersonnelSortKey): string | number {
  switch (key) {
    case 'name':
      return fullName(p);
    case 'email':
      return p.user?.email ?? '';
    case 'phone':
      return p.telephone ?? '';
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
  const { t } = useLanguage();
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
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const toggleExpand = (id: number) => setExpandedId((cur) => (cur === id ? null : id));

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
      toast.showSuccess(t.personnel.createdSuccess);
    },
    onError: (err) => setFormError(getErrorMessage(err, t.personnel.errorCreate)),
  });

  const uploadImageMutation = useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => personnelApi.uploadImage(id, file),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['personnel'] });
      setEditing(updated);
      setPhotoError(null);
    },
    onError: (err) => setPhotoError(getErrorMessage(err, t.personnel.errorUploadPhoto)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: EditState & { user: { idUser: number } } }) =>
      personnelApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personnel'] });
      setEditing(null);
      setEditForm(null);
      setFormError(null);
      toast.showSuccess(t.personnel.updatedSuccess);
    },
    onError: (err) => setFormError(getErrorMessage(err, t.personnel.errorUpdate)),
  });

  const deleteMutation = useMutation({
    mutationFn: personnelApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personnel'] });
      setDeleteError(null);
      toast.showSuccess(t.personnel.deletedSuccess);
    },
    onError: (err) => setDeleteError(getErrorMessage(err, t.personnel.errorDelete)),
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
      setFormError(t.personnel.errorSelectCompany);
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
      title: t.personnel.removeTitle,
      message: t.personnel.removeMessage(fullName(p)),
      confirmLabel: t.personnel.remove,
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
          <h1>{t.personnel.title}</h1>
          <p className="page__subtitle">{t.personnel.subtitle}</p>
        </div>
        <div className="page__header-actions">
          <button className="btn btn--ghost" onClick={() => personnelApi.exportCsv()}>
            <Download size={16} aria-hidden="true" />
            {t.personnel.exportCsv}
          </button>
          <button className="btn btn--primary" onClick={openAddModal}>
            <Plus size={16} aria-hidden="true" />
            {t.personnel.addPersonnel}
          </button>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="toolbar__search"
          type="search"
          placeholder={t.personnel.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {deleteError && <div className="alert alert--error">{deleteError}</div>}

      {isLoading && <TableSkeleton columns={isAdmin ? 7 : 6} />}
      {isError && <p className="jobs__status">{t.personnel.errorLoad}</p>}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">{t.common.noRecords}</span>
          <p>{search ? t.personnel.noneMatchSearch : t.personnel.noneYet}</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-icon"></th>
                <SortableTh label={t.personnel.columnEmployee} sortKey="name" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh label={t.personnel.columnEmail} sortKey="email" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh label={t.personnel.columnPhone} sortKey="phone" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                {isAdmin && (
                  <SortableTh
                    label={t.personnel.columnCompany}
                    sortKey="company"
                    activeKey={sortKey}
                    direction={direction}
                    onSort={toggleSort}
                  />
                )}
                <SortableTh
                  label={t.personnel.columnContract}
                  sortKey="contract"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={toggleSort}
                />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((p) => {
                const expanded = expandedId === p.idPersonnel;
                const columnCount = isAdmin ? 7 : 6;
                return (
                  <Fragment key={p.idPersonnel}>
                    <tr className={expanded ? 'data-table__row--expanded' : ''}>
                      <td data-label="">
                        <button
                          type="button"
                          className={`data-table__expand-toggle${expanded ? ' data-table__expand-toggle--open' : ''}`}
                          onClick={() => toggleExpand(p.idPersonnel)}
                          aria-label={expanded ? t.personnel.hideContractDetails : t.personnel.showContractDetails}
                          title={expanded ? t.personnel.hideContractDetails : t.personnel.showContractDetails}
                        >
                          <ChevronDown size={16} aria-hidden="true" />
                        </button>
                      </td>
                      <td className="data-table__name-cell" data-label={t.personnel.columnEmployee}>
                        {p.image ? (
                          <img className="avatar" src={fileUrl(p.image)} alt={fullName(p)} />
                        ) : (
                          <span className="avatar avatar--initials">{fullName(p).slice(0, 1)}</span>
                        )}
                        <span className="data-table__name-cell-info">
                          {fullName(p)}
                          {p.matricule && <span className="data-table__name-cell-sub">{p.matricule}</span>}
                        </span>
                      </td>
                      <td data-label={t.personnel.columnEmail}>{p.user?.email ?? '—'}</td>
                      <td data-label={t.personnel.columnPhone}>
                        <span className="cell-with-icon">
                          <Phone size={13} aria-hidden="true" />
                          {p.telephone || '—'}
                        </span>
                      </td>
                      {isAdmin && <td data-label={t.personnel.columnCompany}>{p.user?.company?.companyName ?? '—'}</td>}
                      <td data-label={t.personnel.columnContract}>
                        {p.contract ? (
                          <span className={`badge ${isContractActive(p.contract) ? 'badge--success' : 'badge--muted'}`}>
                            {isContractActive(p.contract) ? (
                              <CircleDot size={11} aria-hidden="true" />
                            ) : (
                              <Circle size={11} aria-hidden="true" />
                            )}
                            {p.contract.typeContrat}
                          </span>
                        ) : (
                          <span className="badge badge--muted">
                            <Circle size={11} aria-hidden="true" />
                            {t.personnel.noContract}
                          </span>
                        )}
                      </td>
                      <td className="data-table__actions" data-label="">
                        <IconButton
                          icon={<FileSignature size={15} aria-hidden="true" />}
                          label={p.contract ? t.personnel.downloadWorkContract : t.personnel.noContractLinkedYet}
                          disabled={!p.contract}
                          onClick={() => personnelApi.downloadContractPdf(p.idPersonnel)}
                        />
                        <IconButton
                          icon={<FileText size={15} aria-hidden="true" />}
                          label={t.personnel.downloadAttestation}
                          onClick={() => personnelApi.downloadAttestationPdf(p.idPersonnel)}
                        />
                        <span className="data-table__actions-divider" />
                        <RowActionsMenu
                          ariaLabel={`Actions for ${fullName(p)}`}
                          items={[
                            {
                              label: t.personnel.edit,
                              icon: <Pencil size={15} aria-hidden="true" />,
                              onClick: () => openEditModal(p),
                            },
                            {
                              label: t.personnel.delete,
                              icon: <Trash2 size={15} aria-hidden="true" />,
                              danger: true,
                              disabled: deleteMutation.isPending,
                              onClick: () => handleDelete(p),
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
                                <span className="contract-panel__label">{t.personnel.cin}</span>
                                <span className="contract-panel__value">{p.cin || '—'}</span>
                              </div>
                              <div className="contract-panel__item">
                                <span className="contract-panel__label">{t.personnel.cnssNumberShort}</span>
                                <span className="contract-panel__value">{p.cnssNumber || '—'}</span>
                              </div>
                              <div className="contract-panel__item">
                                <span className="contract-panel__label">{t.personnel.rib}</span>
                                <span className="contract-panel__value">{p.rib || '—'}</span>
                              </div>
                              {p.contract ? (
                                contractDetails(p.contract, t.personnel.contractDetailLabels).map(([label, value]) => (
                                  <div className="contract-panel__item" key={label}>
                                    <span className="contract-panel__label">{label}</span>
                                    <span className="contract-panel__value">{value}</span>
                                  </div>
                                ))
                              ) : (
                                <div className="contract-panel__item">
                                  <span className="contract-panel__label">{t.personnel.contractLabel}</span>
                                  <span className="contract-panel__value">{t.personnel.noContractLinkedYet}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t.personnel.addPersonnelTitle}</h2>
            <p className="auth-shell__subtitle">{t.personnel.addPersonnelSubtitle}</p>
            <form onSubmit={handleCreateSubmit}>
              {formError && <div className="alert alert--error">{formError}</div>}
              {prefillNotice && (
                <div className="alert alert--info">
                  {t.personnel.prefillNotice(isAdmin ? t.personnel.prefillCompanyExtra : '')}
                </div>
              )}

              <div className="fieldset">
                <div className="field-row">
                  <label className="field">
                    <span>{t.personnel.firstName}</span>
                    <input
                      value={createForm.firstname}
                      onChange={(e) => setCreateForm((f) => ({ ...f, firstname: e.target.value }))}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>{t.personnel.lastName}</span>
                    <input
                      value={createForm.lastname}
                      onChange={(e) => setCreateForm((f) => ({ ...f, lastname: e.target.value }))}
                      required
                    />
                  </label>
                </div>
                <label className="field">
                  <span>{t.personnel.email}</span>
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                    required
                  />
                </label>
                <label className="field">
                  <span>{t.personnel.temporaryPassword}</span>
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
                      title={showPassword ? t.personnel.hidePassword : t.personnel.showPassword}
                      aria-label={showPassword ? t.personnel.hidePassword : t.personnel.showPassword}
                    >
                      <span aria-hidden="true">{showPassword ? '🙈' : '👁️'}</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => setCreateForm((f) => ({ ...f, password: generateTempPassword() }))}
                    >
                      {t.personnel.generate}
                    </button>
                  </div>
                </label>
                {isAdmin && (
                  <label className="field">
                    <span>{t.personnel.company}</span>
                    <select
                      value={createForm.companyId ?? ''}
                      onChange={(e) =>
                        setCreateForm((f) => ({ ...f, companyId: Number(e.target.value) || undefined }))
                      }
                      required
                    >
                      <option value="">{t.personnel.selectCompany}</option>
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
                    <span>{t.personnel.cin}</span>
                    <input
                      value={createForm.cin}
                      onChange={(e) => setCreateForm((f) => ({ ...f, cin: e.target.value }))}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>{t.personnel.phone}</span>
                    <input
                      value={createForm.telephone}
                      onChange={(e) => setCreateForm((f) => ({ ...f, telephone: e.target.value }))}
                    />
                  </label>
                </div>
                <label className="field">
                  <span>{t.personnel.cnssNumber}</span>
                  <input
                    value={createForm.cnssNumber}
                    onChange={(e) => setCreateForm((f) => ({ ...f, cnssNumber: e.target.value }))}
                    required
                  />
                </label>
                <p className="field-hint">{t.personnel.matriculeHint}</p>
                <label className="field">
                  <span>{t.registerCompany.rib}</span>
                  <input
                    value={createForm.rib}
                    onChange={(e) => setCreateForm((f) => ({ ...f, rib: e.target.value }))}
                    required
                  />
                </label>
                <label className="field">
                  <span>{t.personnel.photoOptional}</span>
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
                  {t.personnel.cancel}
                </button>
                <button className="btn btn--primary" type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? t.personnel.creating : t.personnel.createPersonnel}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editing && editForm && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t.personnel.editTitle(fullName(editing))}</h2>
            <form onSubmit={handleEditSubmit}>
              {formError && <div className="alert alert--error">{formError}</div>}

              <div className="fieldset">
                <div className="field-row">
                  <label className="field">
                    <span>{t.personnel.cin}</span>
                    <input
                      value={editForm.cin}
                      onChange={(e) => setEditForm((f) => f && { ...f, cin: e.target.value })}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>{t.personnel.phone}</span>
                    <input
                      value={editForm.telephone}
                      onChange={(e) => setEditForm((f) => f && { ...f, telephone: e.target.value })}
                    />
                  </label>
                </div>
                <label className="field">
                  <span>{t.personnel.cnssNumber}</span>
                  <input
                    value={editForm.cnssNumber}
                    onChange={(e) => setEditForm((f) => f && { ...f, cnssNumber: e.target.value })}
                    required
                  />
                </label>
                <p className="field-hint">
                  {t.personnel.matriculeLabel(editing.matricule || t.personnel.matriculeNotAssigned)}
                </p>
                <label className="field">
                  <span>{t.registerCompany.rib}</span>
                  <input
                    value={editForm.rib}
                    onChange={(e) => setEditForm((f) => f && { ...f, rib: e.target.value })}
                    required
                  />
                </label>
                <label className="field">
                  <span>{t.personnel.photo}</span>
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
                  {t.personnel.cancel}
                </button>
                <button className="btn btn--primary" type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? t.personnel.saving : t.personnel.saveChanges}
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

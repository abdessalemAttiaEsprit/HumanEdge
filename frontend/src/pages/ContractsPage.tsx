import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { contractsApi } from '@/api/contracts';
import { personnelApi } from '@/api/personnel';
import { paymentsApi } from '@/api/payments';
import { getErrorMessage } from '@/lib/errors';
import { usePagination } from '@/lib/usePagination';
import { useConfirm } from '@/lib/useConfirm';
import { useSort } from '@/lib/useSort';
import { IconButton } from '@/components/IconButton';
import { Pagination } from '@/components/Pagination';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TableSkeleton } from '@/components/TableSkeleton';
import { SortableTh } from '@/components/SortableTh';
import { useToast } from '@/components/ToastProvider';
import type { Contract, ContractCreateRequest, ContractUpdateRequest, Personnel, TypeContrat } from '@/types';

const TYPE_LABEL: Record<TypeContrat, string> = {
  CDI: 'Permanent (CDI)',
  CDD: 'Fixed-term (CDD)',
  CDD_AI: 'Fixed-term (AI)',
  PROJET: 'Project-based',
  INTERIM: 'Temp / Interim',
  APPRENTISSAGE: 'Apprenticeship',
  STAGE: 'Internship',
  CONVENTION: 'Agreement',
};

const EMPTY_CREATE: Omit<ContractCreateRequest, 'personnel'> = {
  work: '',
  typeContrat: 'CDI',
  dateDebut: '',
  dateFin: '',
  categorie: '',
  salaireComplementaire: undefined,
  tauxHoraireSup: undefined,
  avantages: undefined,
};

type EditState = Omit<ContractUpdateRequest, 'typeContrat'> & { typeContrat: TypeContrat };

type ContractSortKey = 'employee' | 'work' | 'type' | 'start' | 'end' | 'category' | 'salary';

function personnelName(p?: Personnel): string {
  if (!p?.user) return '—';
  return `${p.user.firstname} ${p.user.lastname}`;
}

export function ContractsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { confirmOptions, requestConfirm, closeConfirm, handleConfirm } = useConfirm();

  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editing, setEditing] = useState<Contract | null>(null);
  const [selectedPersonnelId, setSelectedPersonnelId] = useState<number | ''>('');
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);
  const [editForm, setEditForm] = useState<EditState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: contracts, isLoading, isError } = useQuery({
    queryKey: ['contracts'],
    queryFn: contractsApi.list,
  });

  const { data: personnelList } = useQuery({
    queryKey: ['personnel'],
    queryFn: personnelApi.list,
  });

  const { data: categories } = useQuery({
    queryKey: ['salary-categories'],
    queryFn: paymentsApi.getSalaryCategories,
    enabled: showAddModal || !!editing,
  });

  // Contract.personnel is never serialized on read, so the employee for a given
  // contract is looked up from the Personnel list instead (personnel.contract *is*
  // serialized there).
  const personnelByContractId = useMemo(() => {
    const map = new Map<number, Personnel>();
    (personnelList ?? []).forEach((p) => {
      if (p.contract) map.set(p.contract.idContract, p);
    });
    return map;
  }, [personnelList]);

  const unassignedPersonnel = useMemo(
    () => (personnelList ?? []).filter((p) => !p.contract),
    [personnelList],
  );

  const createMutation = useMutation({
    mutationFn: contractsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['personnel'] });
      setShowAddModal(false);
      setCreateForm(EMPTY_CREATE);
      setSelectedPersonnelId('');
      setFormError(null);
      toast.showSuccess('Contract created.');
    },
    onError: (err) => {
      const message = getErrorMessage(err, 'Unable to create the contract');
      setFormError(message);
      toast.showError(message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ContractUpdateRequest }) =>
      contractsApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      setEditing(null);
      setEditForm(null);
      setFormError(null);
      toast.showSuccess('Contract updated.');
    },
    onError: (err) => {
      const message = getErrorMessage(err, 'Unable to update the contract');
      setFormError(message);
      toast.showError(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: contractsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['personnel'] });
      toast.showSuccess('Contract deleted.');
    },
    onError: (err) => toast.showError(getErrorMessage(err, 'Unable to delete the contract')),
  });

  const filtered = useMemo(() => {
    if (!contracts) return [];
    const q = search.trim().toLowerCase();
    if (!q) return contracts;
    return contracts.filter((c) => {
      const employee = personnelName(personnelByContractId.get(c.idContract));
      const haystack = [employee, c.work, c.categorie, c.typeContrat].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [contracts, search, personnelByContractId]);

  const getContractSortValue = (c: Contract, key: ContractSortKey): string | number => {
    switch (key) {
      case 'employee':
        return personnelName(personnelByContractId.get(c.idContract));
      case 'work':
        return c.work ?? '';
      case 'type':
        return c.typeContrat ? TYPE_LABEL[c.typeContrat] : '';
      case 'start':
        return c.dateDebut ?? '';
      case 'end':
        return c.dateFin ?? '';
      case 'category':
        return c.categorie ?? '';
      case 'salary':
        return c.salaireBase ?? -1;
    }
  };
  const { sorted, sortKey, direction, toggleSort } = useSort<Contract, ContractSortKey>(filtered, getContractSortValue);
  const { page, setPage, pageCount, pageItems } = usePagination(sorted, 10);

  const openAddModal = () => {
    setCreateForm(EMPTY_CREATE);
    setSelectedPersonnelId('');
    setFormError(null);
    setShowAddModal(true);
  };

  const openEditModal = (c: Contract) => {
    setEditing(c);
    setEditForm({
      work: c.work ?? '',
      typeContrat: c.typeContrat ?? 'CDI',
      dateDebut: c.dateDebut ?? '',
      dateFin: c.dateFin ?? '',
      categorie: c.categorie ?? '',
      salaireComplementaire: c.salaireComplementaire,
      tauxHoraireSup: c.tauxHoraireSup,
      avantages: c.avantages,
    });
    setFormError(null);
  };

  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!selectedPersonnelId) {
      setFormError('Please select an employee');
      return;
    }
    if (!createForm.categorie) {
      setFormError('Please select a salary category');
      return;
    }
    createMutation.mutate({ ...createForm, personnel: { idPersonnel: selectedPersonnelId } });
  };

  const handleEditSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!editing || !editForm) return;
    setFormError(null);
    updateMutation.mutate({ id: editing.idContract, payload: editForm });
  };

  const handleDelete = (c: Contract) => {
    const employee = personnelName(personnelByContractId.get(c.idContract));
    requestConfirm({
      title: 'Delete contract',
      message: `Delete the contract for ${employee}? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: () => deleteMutation.mutate(c.idContract),
    });
  };

  return (
    <div>
      <div className="page__header page__header--row">
        <div>
          <h1>Contracts</h1>
          <p className="page__subtitle">Manage employee work contracts and salary grid assignment.</p>
        </div>
        <div className="page__header-actions">
          <button className="btn btn--ghost" onClick={() => contractsApi.exportCsv()}>
            ⬇️ Export CSV
          </button>
          <button className="btn btn--primary" onClick={openAddModal}>
            + Add contract
          </button>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="toolbar__search"
          type="search"
          placeholder="Search by employee, role, category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && <TableSkeleton columns={8} />}
      {isError && <p className="jobs__status">Unable to load contracts.</p>}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">No records</span>
          <p>{search ? 'No contracts match your search.' : 'No contracts yet. Add the first one.'}</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <SortableTh
                  label="Employee"
                  sortKey="employee"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={toggleSort}
                />
                <SortableTh label="Role" sortKey="work" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh label="Type" sortKey="type" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh label="Start" sortKey="start" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh label="End" sortKey="end" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh
                  label="Category"
                  sortKey="category"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Base salary"
                  sortKey="salary"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={toggleSort}
                />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((c) => {
                const employee = personnelByContractId.get(c.idContract);
                return (
                  <tr key={c.idContract}>
                    <td data-label="Employee">
                      {employee ? (
                        personnelName(employee)
                      ) : (
                        <span className="badge badge--muted">Unassigned</span>
                      )}
                    </td>
                    <td data-label="Role">{c.work || '—'}</td>
                    <td data-label="Type">
                      {c.typeContrat ? (
                        <span className="badge badge--soft">{TYPE_LABEL[c.typeContrat]}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td data-label="Start">{c.dateDebut || '—'}</td>
                    <td data-label="End">{c.dateFin || '—'}</td>
                    <td data-label="Category">
                      {c.categorie} {c.echelon ? `· step ${c.echelon}` : ''}
                    </td>
                    <td data-label="Base salary">{c.salaireBase != null ? `${c.salaireBase.toFixed(3)} TND` : '—'}</td>
                    <td className="data-table__actions" data-label="">
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
            <h2>Add contract</h2>
            <form onSubmit={handleCreateSubmit}>
              {formError && <div className="alert alert--error">{formError}</div>}

              <div className="fieldset">
                <label className="field">
                  <span>Employee</span>
                  <select
                    value={selectedPersonnelId}
                    onChange={(e) => setSelectedPersonnelId(Number(e.target.value) || '')}
                    required
                  >
                    <option value="">
                      {unassignedPersonnel.length === 0 ? 'No unassigned employees' : 'Select an employee…'}
                    </option>
                    {unassignedPersonnel.map((p) => (
                      <option key={p.idPersonnel} value={p.idPersonnel}>
                        {personnelName(p)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Role / position</span>
                  <input
                    value={createForm.work}
                    onChange={(e) => setCreateForm((f) => ({ ...f, work: e.target.value }))}
                    placeholder="e.g. Backend developer"
                  />
                </label>
                <div className="field-row">
                  <label className="field">
                    <span>Contract type</span>
                    <select
                      value={createForm.typeContrat}
                      onChange={(e) =>
                        setCreateForm((f) => ({ ...f, typeContrat: e.target.value as TypeContrat }))
                      }
                    >
                      {Object.entries(TYPE_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Salary category</span>
                    <select
                      value={createForm.categorie}
                      onChange={(e) => setCreateForm((f) => ({ ...f, categorie: e.target.value }))}
                      required
                    >
                      <option value="">Select…</option>
                      {Object.entries(categories ?? {}).map(([code, description]) => (
                        <option key={code} value={code}>
                          {code} — {description}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="field-row">
                  <label className="field">
                    <span>Start date</span>
                    <input
                      type="date"
                      value={createForm.dateDebut}
                      onChange={(e) => setCreateForm((f) => ({ ...f, dateDebut: e.target.value }))}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>End date (optional)</span>
                    <input
                      type="date"
                      value={createForm.dateFin}
                      onChange={(e) => setCreateForm((f) => ({ ...f, dateFin: e.target.value }))}
                    />
                  </label>
                </div>
              </div>

              <div className="fieldset">
                <div className="field-row">
                  <label className="field">
                    <span>Extra allowances (optional)</span>
                    <input
                      type="number"
                      step="0.001"
                      value={createForm.avantages ?? ''}
                      onChange={(e) =>
                        setCreateForm((f) => ({ ...f, avantages: e.target.value ? Number(e.target.value) : undefined }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Overtime hourly rate (optional)</span>
                    <input
                      type="number"
                      step="0.001"
                      value={createForm.tauxHoraireSup ?? ''}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          tauxHoraireSup: e.target.value ? Number(e.target.value) : undefined,
                        }))
                      }
                    />
                  </label>
                </div>
                <label className="field">
                  <span>Supplementary salary (optional)</span>
                  <input
                    type="number"
                    step="0.001"
                    value={createForm.salaireComplementaire ?? ''}
                    onChange={(e) =>
                      setCreateForm((f) => ({
                        ...f,
                        salaireComplementaire: e.target.value ? Number(e.target.value) : undefined,
                      }))
                    }
                  />
                </label>
                <p className="auth-shell__subtitle" style={{ margin: 0 }}>
                  Base salary and salary step are computed automatically from the category and start date.
                </p>
              </div>

              <div className="modal__actions">
                <button type="button" className="btn btn--ghost" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button className="btn btn--primary" type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating…' : 'Create contract'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editing && editForm && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit contract — {personnelName(personnelByContractId.get(editing.idContract))}</h2>
            <form onSubmit={handleEditSubmit}>
              {formError && <div className="alert alert--error">{formError}</div>}

              <div className="fieldset">
                <label className="field">
                  <span>Role / position</span>
                  <input
                    value={editForm.work}
                    onChange={(e) => setEditForm((f) => f && { ...f, work: e.target.value })}
                  />
                </label>
                <div className="field-row">
                  <label className="field">
                    <span>Contract type</span>
                    <select
                      value={editForm.typeContrat}
                      onChange={(e) =>
                        setEditForm((f) => f && { ...f, typeContrat: e.target.value as TypeContrat })
                      }
                    >
                      {Object.entries(TYPE_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Salary category</span>
                    <select
                      value={editForm.categorie}
                      onChange={(e) => setEditForm((f) => f && { ...f, categorie: e.target.value })}
                      required
                    >
                      <option value="">Select…</option>
                      {Object.entries(categories ?? {}).map(([code, description]) => (
                        <option key={code} value={code}>
                          {code} — {description}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="field-row">
                  <label className="field">
                    <span>Start date</span>
                    <input
                      type="date"
                      value={editForm.dateDebut}
                      onChange={(e) => setEditForm((f) => f && { ...f, dateDebut: e.target.value })}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>End date (optional)</span>
                    <input
                      type="date"
                      value={editForm.dateFin}
                      onChange={(e) => setEditForm((f) => f && { ...f, dateFin: e.target.value })}
                    />
                  </label>
                </div>
              </div>

              <div className="fieldset">
                <div className="field-row">
                  <label className="field">
                    <span>Extra allowances (optional)</span>
                    <input
                      type="number"
                      step="0.001"
                      value={editForm.avantages ?? ''}
                      onChange={(e) =>
                        setEditForm(
                          (f) => f && { ...f, avantages: e.target.value ? Number(e.target.value) : undefined },
                        )
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Overtime hourly rate (optional)</span>
                    <input
                      type="number"
                      step="0.001"
                      value={editForm.tauxHoraireSup ?? ''}
                      onChange={(e) =>
                        setEditForm(
                          (f) => f && { ...f, tauxHoraireSup: e.target.value ? Number(e.target.value) : undefined },
                        )
                      }
                    />
                  </label>
                </div>
                <label className="field">
                  <span>Supplementary salary (optional)</span>
                  <input
                    type="number"
                    step="0.001"
                    value={editForm.salaireComplementaire ?? ''}
                    onChange={(e) =>
                      setEditForm(
                        (f) =>
                          f && {
                            ...f,
                            salaireComplementaire: e.target.value ? Number(e.target.value) : undefined,
                          },
                      )
                    }
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

      <ConfirmDialog options={confirmOptions} onConfirm={handleConfirm} onCancel={closeConfirm} />
    </div>
  );
}

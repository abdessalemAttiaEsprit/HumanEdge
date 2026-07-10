import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { contractsApi } from '@/api/contracts';
import { personnelApi } from '@/api/personnel';
import { paymentsApi } from '@/api/payments';
import { getErrorMessage } from '@/lib/errors';
import { IconButton } from '@/components/IconButton';
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

function personnelName(p?: Personnel): string {
  if (!p?.user) return '—';
  return `${p.user.firstname} ${p.user.lastname}`;
}

export function ContractsPage() {
  const queryClient = useQueryClient();

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
    },
    onError: (err) => setFormError(getErrorMessage(err, 'Unable to create the contract')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ContractUpdateRequest }) =>
      contractsApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      setEditing(null);
      setEditForm(null);
      setFormError(null);
    },
    onError: (err) => setFormError(getErrorMessage(err, 'Unable to update the contract')),
  });

  const deleteMutation = useMutation({
    mutationFn: contractsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['personnel'] });
    },
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
    if (!window.confirm(`Delete the contract for ${employee}? This cannot be undone.`)) return;
    deleteMutation.mutate(c.idContract);
  };

  return (
    <div>
      <div className="page__header page__header--row">
        <div>
          <h1>Contracts</h1>
          <p className="page__subtitle">Manage employee work contracts and salary grid assignment.</p>
        </div>
        <button className="btn btn--primary" onClick={openAddModal}>
          + Add contract
        </button>
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

      {isLoading && <p className="jobs__status">Loading contracts…</p>}
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
                <th>Employee</th>
                <th>Role</th>
                <th>Type</th>
                <th>Start</th>
                <th>End</th>
                <th>Category</th>
                <th>Base salary</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const employee = personnelByContractId.get(c.idContract);
                return (
                  <tr key={c.idContract}>
                    <td>
                      {employee ? (
                        personnelName(employee)
                      ) : (
                        <span className="badge badge--muted">Unassigned</span>
                      )}
                    </td>
                    <td>{c.work || '—'}</td>
                    <td>
                      {c.typeContrat ? (
                        <span className="badge badge--soft">{TYPE_LABEL[c.typeContrat]}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{c.dateDebut || '—'}</td>
                    <td>{c.dateFin || '—'}</td>
                    <td>
                      {c.categorie} {c.echelon ? `· step ${c.echelon}` : ''}
                    </td>
                    <td>{c.salaireBase != null ? `${c.salaireBase.toFixed(3)} TND` : '—'}</td>
                    <td className="data-table__actions">
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
    </div>
  );
}

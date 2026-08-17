import { Fragment, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Download, Pencil, Plus, Trash2 } from 'lucide-react';
import { contractsApi } from '@/api/contracts';
import { personnelApi } from '@/api/personnel';
import { paymentsApi } from '@/api/payments';
import { useLanguage } from '@/i18n/useLanguage';
import { getErrorMessage } from '@/lib/errors';
import { usePagination } from '@/lib/usePagination';
import { useConfirm } from '@/lib/useConfirm';
import { useSort } from '@/lib/useSort';
import { Pagination } from '@/components/Pagination';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TableSkeleton } from '@/components/TableSkeleton';
import { SortableTh } from '@/components/SortableTh';
import { RowActionsMenu } from '@/components/RowActionsMenu';
import { useToast } from '@/components/ToastProvider';
import type { Contract, ContractCreateRequest, ContractUpdateRequest, Personnel, TypeContrat } from '@/types';

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

function formatAmount(value?: number): string | undefined {
  return value != null ? `${value.toFixed(3)} TND` : undefined;
}

export function ContractsPage() {
  const { t } = useLanguage();
  const TYPE_LABEL = t.contractTypes;
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
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const toggleExpand = (id: number) => setExpandedId((cur) => (cur === id ? null : id));

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
      toast.showSuccess(t.contracts.createdSuccess);
    },
    onError: (err) => {
      const message = getErrorMessage(err, t.contracts.errorCreate);
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
      toast.showSuccess(t.contracts.updatedSuccess);
    },
    onError: (err) => {
      const message = getErrorMessage(err, t.contracts.errorUpdate);
      setFormError(message);
      toast.showError(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: contractsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['personnel'] });
      toast.showSuccess(t.contracts.deletedSuccess);
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.contracts.errorDelete)),
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
      setFormError(t.contracts.errorSelectEmployee);
      return;
    }
    if (!createForm.categorie) {
      setFormError(t.contracts.errorSelectCategory);
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
      title: t.contracts.deleteTitle,
      message: t.contracts.deleteMessage(employee),
      confirmLabel: t.contracts.delete,
      variant: 'danger',
      onConfirm: () => deleteMutation.mutate(c.idContract),
    });
  };

  return (
    <div>
      <div className="page__header page__header--row">
        <div>
          <h1>{t.contracts.title}</h1>
          <p className="page__subtitle">{t.contracts.subtitle}</p>
        </div>
        <div className="page__header-actions">
          <button className="btn btn--ghost" onClick={() => contractsApi.exportCsv()}>
            <Download size={16} aria-hidden="true" />
            {t.contracts.exportCsv}
          </button>
          <button className="btn btn--primary" onClick={openAddModal}>
            <Plus size={16} aria-hidden="true" />
            {t.contracts.addContract}
          </button>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="toolbar__search"
          type="search"
          placeholder={t.contracts.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && <TableSkeleton columns={7} />}
      {isError && <p className="jobs__status">{t.contracts.errorLoad}</p>}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">{t.common.noRecords}</span>
          <p>{search ? t.contracts.noneMatchSearch : t.contracts.noneYet}</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-icon"></th>
                <SortableTh
                  label={t.contracts.columnEmployee}
                  sortKey="employee"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={toggleSort}
                />
                <SortableTh label={t.contracts.columnRole} sortKey="work" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh label={t.contracts.columnType} sortKey="type" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh label={t.contracts.columnStart} sortKey="start" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh label={t.contracts.columnEnd} sortKey="end" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((c) => {
                const employee = personnelByContractId.get(c.idContract);
                const expanded = expandedId === c.idContract;
                return (
                  <Fragment key={c.idContract}>
                    <tr className={expanded ? 'data-table__row--expanded' : ''}>
                      <td data-label="">
                        <button
                          type="button"
                          className={`data-table__expand-toggle${expanded ? ' data-table__expand-toggle--open' : ''}`}
                          onClick={() => toggleExpand(c.idContract)}
                          aria-label={expanded ? t.contracts.hideSalaryDetails : t.contracts.showSalaryDetails}
                          title={expanded ? t.contracts.hideSalaryDetails : t.contracts.showSalaryDetails}
                        >
                          <ChevronDown size={16} aria-hidden="true" />
                        </button>
                      </td>
                      <td data-label={t.contracts.columnEmployee}>
                        {employee ? (
                          personnelName(employee)
                        ) : (
                          <span className="badge badge--muted">{t.contracts.unassigned}</span>
                        )}
                      </td>
                      <td data-label={t.contracts.columnRole}>{c.work || '—'}</td>
                      <td data-label={t.contracts.columnType}>
                        {c.typeContrat ? (
                          <span className="badge badge--soft">{TYPE_LABEL[c.typeContrat]}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td data-label={t.contracts.columnStart}>{c.dateDebut || '—'}</td>
                      <td data-label={t.contracts.columnEnd}>{c.dateFin || '—'}</td>
                      <td className="data-table__actions" data-label="">
                        <RowActionsMenu
                          ariaLabel={`Actions for the contract of ${personnelName(employee)}`}
                          items={[
                            { label: t.contracts.edit, icon: <Pencil size={15} aria-hidden="true" />, onClick: () => openEditModal(c) },
                            {
                              label: t.contracts.delete,
                              icon: <Trash2 size={15} aria-hidden="true" />,
                              danger: true,
                              disabled: deleteMutation.isPending,
                              onClick: () => handleDelete(c),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="data-table__expanded-row">
                        <td colSpan={7}>
                          <div className="contract-panel">
                            <div className="contract-panel__grid">
                              <div className="contract-panel__item">
                                <span className="contract-panel__label">{t.contracts.category}</span>
                                <span className="contract-panel__value">
                                  {c.categorie} {c.echelon ? t.contracts.step(c.echelon) : ''}
                                </span>
                              </div>
                              {[
                                [t.contracts.baseSalary, formatAmount(c.salaireBase)],
                                [t.contracts.supplementarySalary, formatAmount(c.salaireComplementaire)],
                                [t.contracts.overtimeRate, formatAmount(c.tauxHoraireSup)],
                                [t.contracts.allowances, formatAmount(c.avantages)],
                              ]
                                .filter((entry): entry is [string, string] => !!entry[1])
                                .map(([label, value]) => (
                                  <div className="contract-panel__item" key={label}>
                                    <span className="contract-panel__label">{label}</span>
                                    <span className="contract-panel__value">{value}</span>
                                  </div>
                                ))}
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
            <h2>{t.contracts.addContractTitle}</h2>
            <form onSubmit={handleCreateSubmit}>
              {formError && <div className="alert alert--error">{formError}</div>}

              <div className="fieldset">
                <label className="field">
                  <span>{t.contracts.employee}</span>
                  <select
                    value={selectedPersonnelId}
                    onChange={(e) => setSelectedPersonnelId(Number(e.target.value) || '')}
                    required
                  >
                    <option value="">
                      {unassignedPersonnel.length === 0 ? t.contracts.noUnassignedEmployees : t.contracts.selectEmployee}
                    </option>
                    {unassignedPersonnel.map((p) => (
                      <option key={p.idPersonnel} value={p.idPersonnel}>
                        {personnelName(p)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>{t.contracts.rolePosition}</span>
                  <input
                    value={createForm.work}
                    onChange={(e) => setCreateForm((f) => ({ ...f, work: e.target.value }))}
                    placeholder={t.contracts.rolePlaceholder}
                  />
                </label>
                <div className="field-row">
                  <label className="field">
                    <span>{t.contracts.contractType}</span>
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
                    <span>{t.contracts.salaryCategory}</span>
                    <select
                      value={createForm.categorie}
                      onChange={(e) => setCreateForm((f) => ({ ...f, categorie: e.target.value }))}
                      required
                    >
                      <option value="">{t.contracts.select}</option>
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
                    <span>{t.contracts.startDate}</span>
                    <input
                      type="date"
                      value={createForm.dateDebut}
                      onChange={(e) => setCreateForm((f) => ({ ...f, dateDebut: e.target.value }))}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>{t.contracts.endDateOptional}</span>
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
                    <span>{t.contracts.extraAllowancesOptional}</span>
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
                    <span>{t.contracts.overtimeRateOptional}</span>
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
                  <span>{t.contracts.supplementarySalaryOptional}</span>
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
                <p className="auth-shell__subtitle" style={{ margin: 0 }}>{t.contracts.autoSalaryHint}</p>
              </div>

              <div className="modal__actions">
                <button type="button" className="btn btn--ghost" onClick={() => setShowAddModal(false)}>
                  {t.contracts.cancel}
                </button>
                <button className="btn btn--primary" type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? t.contracts.creating : t.contracts.createContract}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editing && editForm && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t.contracts.editTitle(personnelName(personnelByContractId.get(editing.idContract)))}</h2>
            <form onSubmit={handleEditSubmit}>
              {formError && <div className="alert alert--error">{formError}</div>}

              <div className="fieldset">
                <label className="field">
                  <span>{t.contracts.rolePosition}</span>
                  <input
                    value={editForm.work}
                    onChange={(e) => setEditForm((f) => f && { ...f, work: e.target.value })}
                  />
                </label>
                <div className="field-row">
                  <label className="field">
                    <span>{t.contracts.contractType}</span>
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
                    <span>{t.contracts.salaryCategory}</span>
                    <select
                      value={editForm.categorie}
                      onChange={(e) => setEditForm((f) => f && { ...f, categorie: e.target.value })}
                      required
                    >
                      <option value="">{t.contracts.select}</option>
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
                    <span>{t.contracts.startDate}</span>
                    <input
                      type="date"
                      value={editForm.dateDebut}
                      onChange={(e) => setEditForm((f) => f && { ...f, dateDebut: e.target.value })}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>{t.contracts.endDateOptional}</span>
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
                    <span>{t.contracts.extraAllowancesOptional}</span>
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
                    <span>{t.contracts.overtimeRateOptional}</span>
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
                  <span>{t.contracts.supplementarySalaryOptional}</span>
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
                  {t.contracts.cancel}
                </button>
                <button className="btn btn--primary" type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? t.contracts.saving : t.contracts.saveChanges}
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

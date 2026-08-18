import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { tasksApi } from '@/api/tasks';
import { personnelApi } from '@/api/personnel';
import { useAuth } from '@/auth/useAuth';
import { useLanguage } from '@/i18n/useLanguage';
import type { Messages } from '@/i18n/en';
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
import type { Personnel, Task, TaskStatus } from '@/types';

const EMPTY_FORM = { title: '', description: '', startDate: '', endDate: '' };

const STATUS_SORT_RANK: Record<TaskStatus, number> = { TODO: 0, IN_PROGRESS: 1, DONE: 2 };

function personnelName(p?: Personnel): string {
  if (!p?.user) return '—';
  return `${p.user.firstname} ${p.user.lastname}`;
}

function StatusSelect({
  status,
  onChange,
  disabled,
  t,
}: {
  status: TaskStatus;
  onChange: (status: TaskStatus) => void;
  disabled?: boolean;
  t: Messages;
}) {
  return (
    <select
      className="chart-card__year-select"
      value={status}
      onChange={(e) => onChange(e.target.value as TaskStatus)}
      disabled={disabled}
      aria-label={t.tasks.my.updateStatusLabel}
    >
      <option value="TODO">{t.taskStatus.TODO}</option>
      <option value="IN_PROGRESS">{t.taskStatus.IN_PROGRESS}</option>
      <option value="DONE">{t.taskStatus.DONE}</option>
    </select>
  );
}

export function TasksPage() {
  const { user } = useAuth();
  return user?.role === 'EMPLOYE' ? <MyTasks /> : <ManagerTasks />;
}

// ============================================================================
// EMPLOYE: own tasks, status editable inline.
// ============================================================================
function MyTasks() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: tasks, isLoading, isError } = useQuery({
    queryKey: ['tasks', 'mine'],
    queryFn: tasksApi.listMine,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: TaskStatus }) => tasksApi.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', 'mine'] });
      toast.showSuccess(t.tasks.my.statusUpdatedSuccess);
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.tasks.my.errorUpdateStatus)),
  });

  if (isLoading) return <p className="jobs__status">{t.tasks.my.loading}</p>;
  if (isError) return <p className="jobs__status">{t.tasks.my.errorLoad}</p>;

  return (
    <div>
      <div className="page__header">
        <h1>{t.tasks.my.title}</h1>
        <p className="page__subtitle">{t.tasks.my.subtitle}</p>
      </div>

      {(tasks ?? []).length === 0 ? (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">{t.common.noRecords}</span>
          <p>{t.tasks.my.noneYet}</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.tasks.my.columnTitle}</th>
                <th>{t.tasks.my.columnDates}</th>
                <th>{t.tasks.my.columnStatus}</th>
              </tr>
            </thead>
            <tbody>
              {(tasks ?? []).map((task) => (
                <tr key={task.idTask}>
                  <td data-label={t.tasks.my.columnTitle}>
                    <strong>{task.title}</strong>
                    {task.description && <div className="field-hint">{task.description}</div>}
                  </td>
                  <td data-label={t.tasks.my.columnDates}>{task.startDate} → {task.endDate}</td>
                  <td data-label={t.tasks.my.columnStatus}>
                    <StatusSelect
                      status={task.status}
                      disabled={statusMutation.isPending}
                      onChange={(status) => statusMutation.mutate({ id: task.idTask, status })}
                      t={t}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ADMIN / COMPANY: assign tasks across personnel.
// ============================================================================
type TaskSortKey = 'employee' | 'title' | 'date' | 'status';

function ManagerTasks() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { confirmOptions, requestConfirm, closeConfirm, handleConfirm } = useConfirm();
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [selectedPersonnelId, setSelectedPersonnelId] = useState<number | ''>('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: tasks, isLoading, isError } = useQuery({
    queryKey: ['tasks'],
    queryFn: tasksApi.list,
  });

  const { data: personnelList } = useQuery({
    queryKey: ['personnel'],
    queryFn: personnelApi.list,
  });

  // Task.personnel is never serialized on read (JsonBackReference), so the assignee for a
  // given task is looked up from the Personnel list instead (personnel.tasks *is* serialized
  // there) — same workaround as Absence.personnel on AbsencesPage.
  const personnelByTaskId = useMemo(() => {
    const map = new Map<number, Personnel>();
    (personnelList ?? []).forEach((p) => {
      (p.tasks ?? []).forEach((task) => map.set(task.idTask, p));
    });
    return map;
  }, [personnelList]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['personnel'] });
  };

  const createMutation = useMutation({
    mutationFn: tasksApi.create,
    onSuccess: () => {
      invalidateAll();
      setShowAddModal(false);
      setForm(EMPTY_FORM);
      setSelectedPersonnelId('');
      setFormError(null);
      toast.showSuccess(t.tasks.manager.createdSuccess);
    },
    onError: (err) => {
      const message = getErrorMessage(err, t.tasks.manager.errorCreate);
      setFormError(message);
      toast.showError(message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ReturnType<typeof buildPayload> }) => tasksApi.update(id, payload),
    onSuccess: () => {
      invalidateAll();
      setEditing(null);
      setFormError(null);
      toast.showSuccess(t.tasks.manager.updatedSuccess);
    },
    onError: (err) => {
      const message = getErrorMessage(err, t.tasks.manager.errorUpdate);
      setFormError(message);
      toast.showError(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: tasksApi.remove,
    onSuccess: () => {
      invalidateAll();
      toast.showSuccess(t.tasks.manager.deletedSuccess);
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.tasks.manager.errorDelete)),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: TaskStatus }) => tasksApi.updateStatus(id, status),
    onSuccess: () => {
      invalidateAll();
      toast.showSuccess(t.tasks.my.statusUpdatedSuccess);
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.tasks.my.errorUpdateStatus)),
  });

  function buildPayload(f: typeof EMPTY_FORM) {
    return {
      title: f.title,
      description: f.description || undefined,
      startDate: f.startDate,
      endDate: f.endDate,
    };
  }

  const filtered = useMemo(() => {
    if (!tasks) return [];
    const q = search.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((task) => {
      const employee = personnelName(personnelByTaskId.get(task.idTask));
      const haystack = [employee, task.title].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [tasks, search, personnelByTaskId]);

  const getTaskSortValue = (task: Task, key: TaskSortKey): string | number => {
    switch (key) {
      case 'employee':
        return personnelName(personnelByTaskId.get(task.idTask));
      case 'title':
        return task.title;
      case 'date':
        return task.startDate;
      case 'status':
        return STATUS_SORT_RANK[task.status];
    }
  };

  const { sorted, sortKey, direction, toggleSort } = useSort<Task, TaskSortKey>(filtered, getTaskSortValue);
  const { page, setPage, pageCount, pageItems } = usePagination(sorted, 10);

  const openAddModal = () => {
    setForm(EMPTY_FORM);
    setSelectedPersonnelId('');
    setFormError(null);
    setShowAddModal(true);
  };

  const openEditModal = (task: Task) => {
    setEditing(task);
    setForm({
      title: task.title,
      description: task.description ?? '',
      startDate: task.startDate,
      endDate: task.endDate,
    });
    setFormError(null);
  };

  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!selectedPersonnelId) {
      setFormError(t.tasks.manager.errorSelectEmployee);
      return;
    }
    createMutation.mutate({ ...buildPayload(form), personnel: { idPersonnel: selectedPersonnelId } });
  };

  const handleEditSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setFormError(null);
    updateMutation.mutate({ id: editing.idTask, payload: buildPayload(form) });
  };

  const handleDelete = (task: Task) => {
    const employee = personnelName(personnelByTaskId.get(task.idTask));
    requestConfirm({
      title: t.tasks.manager.deleteTitle,
      message: t.tasks.manager.deleteMessage(employee),
      confirmLabel: t.tasks.manager.delete,
      variant: 'danger',
      onConfirm: () => deleteMutation.mutate(task.idTask),
    });
  };

  return (
    <div>
      <div className="page__header page__header--row">
        <div>
          <h1>{t.tasks.manager.title}</h1>
          <p className="page__subtitle">{t.tasks.manager.subtitle}</p>
        </div>
        <button className="btn btn--primary" onClick={openAddModal}>
          <Plus size={16} aria-hidden="true" />
          {t.tasks.manager.addTask}
        </button>
      </div>

      <div className="toolbar">
        <input
          className="toolbar__search"
          type="search"
          placeholder={t.tasks.manager.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && <TableSkeleton columns={4} />}
      {isError && <p className="jobs__status">{t.tasks.manager.errorLoad}</p>}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">{t.common.noRecords}</span>
          <p>{search ? t.tasks.manager.noneMatchSearch : t.tasks.manager.noneYet}</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <SortableTh label={t.tasks.manager.columnEmployee} sortKey="employee" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh label={t.tasks.manager.columnTitle} sortKey="title" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh label={t.tasks.manager.columnDates} sortKey="date" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh label={t.tasks.manager.columnStatus} sortKey="status" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((task) => {
                const employee = personnelByTaskId.get(task.idTask);
                return (
                  <tr key={task.idTask}>
                    <td data-label={t.tasks.manager.columnEmployee}>{personnelName(employee)}</td>
                    <td data-label={t.tasks.manager.columnTitle}>{task.title}</td>
                    <td data-label={t.tasks.manager.columnDates}>{task.startDate} → {task.endDate}</td>
                    <td data-label={t.tasks.manager.columnStatus}>
                      <StatusSelect
                        status={task.status}
                        disabled={statusMutation.isPending}
                        onChange={(status) => statusMutation.mutate({ id: task.idTask, status })}
                        t={t}
                      />
                    </td>
                    <td className="data-table__actions" data-label="">
                      <RowActionsMenu
                        ariaLabel={`Actions for the task of ${personnelName(employee)}`}
                        items={[
                          { label: t.tasks.manager.edit, icon: <Pencil size={15} aria-hidden="true" />, onClick: () => openEditModal(task) },
                          {
                            label: t.tasks.manager.delete,
                            icon: <Trash2 size={15} aria-hidden="true" />,
                            danger: true,
                            disabled: deleteMutation.isPending,
                            onClick: () => handleDelete(task),
                          },
                        ]}
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
            <h2>{t.tasks.manager.addModalTitle}</h2>
            <form onSubmit={handleCreateSubmit}>
              {formError && <div className="alert alert--error">{formError}</div>}
              <div className="fieldset">
                <label className="field">
                  <span>{t.tasks.manager.employee}</span>
                  <select
                    value={selectedPersonnelId}
                    onChange={(e) => setSelectedPersonnelId(Number(e.target.value) || '')}
                    required
                  >
                    <option value="">{t.tasks.manager.selectEmployee}</option>
                    {(personnelList ?? []).map((p) => (
                      <option key={p.idPersonnel} value={p.idPersonnel}>
                        {personnelName(p)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>{t.tasks.manager.titleLabel}</span>
                  <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
                </label>
                <label className="field">
                  <span>{t.tasks.manager.descriptionOptional}</span>
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </label>
                <div className="field-row">
                  <label className="field">
                    <span>{t.tasks.manager.startDate}</span>
                    <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} required />
                  </label>
                  <label className="field">
                    <span>{t.tasks.manager.endDate}</span>
                    <input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} required />
                  </label>
                </div>
              </div>
              <div className="modal__actions">
                <button type="button" className="btn btn--ghost" onClick={() => setShowAddModal(false)}>
                  {t.tasks.manager.cancel}
                </button>
                <button className="btn btn--primary" type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? t.tasks.manager.creating : t.tasks.manager.createTask}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t.tasks.manager.editModalTitle(personnelName(personnelByTaskId.get(editing.idTask)))}</h2>
            <form onSubmit={handleEditSubmit}>
              {formError && <div className="alert alert--error">{formError}</div>}
              <div className="fieldset">
                <label className="field">
                  <span>{t.tasks.manager.titleLabel}</span>
                  <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
                </label>
                <label className="field">
                  <span>{t.tasks.manager.descriptionOptional}</span>
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </label>
                <div className="field-row">
                  <label className="field">
                    <span>{t.tasks.manager.startDate}</span>
                    <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} required />
                  </label>
                  <label className="field">
                    <span>{t.tasks.manager.endDate}</span>
                    <input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} required />
                  </label>
                </div>
              </div>
              <div className="modal__actions">
                <button type="button" className="btn btn--ghost" onClick={() => setEditing(null)}>
                  {t.tasks.manager.cancel}
                </button>
                <button className="btn btn--primary" type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? t.tasks.manager.saving : t.tasks.manager.saveChanges}
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

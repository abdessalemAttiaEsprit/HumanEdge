import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, ChevronRight, Circle, Clock, Paperclip, Pencil, Plus, X } from 'lucide-react';
import { tasksApi } from '@/api/tasks';
import { personnelApi } from '@/api/personnel';
import { useAuth } from '@/auth/useAuth';
import { useLanguage } from '@/i18n/useLanguage';
import { getErrorMessage } from '@/lib/errors';
import { useConfirm } from '@/lib/useConfirm';
import { IconButton } from '@/components/IconButton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/ToastProvider';
import { StackedBarChart, type StackedDatum, type StackedSeries } from '@/components/charts';
import { fileUrl } from '@/api/axios';
import type { Personnel, Task, TaskPriority, TaskStatus } from '@/types';

const EMPTY_FORM = { title: '', description: '', startDate: '', endDate: '', priority: 'MEDIUM' as TaskPriority };
const STATUS_ORDER: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE'];
const UNASSIGNED = '__unassigned__';

function personnelName(p?: Personnel): string {
  if (!p?.user) return '—';
  return `${p.user.firstname} ${p.user.lastname}`;
}

function departmentKey(p: Personnel): string {
  return p.department?.trim() || UNASSIGNED;
}

function statusIcon(status: TaskStatus) {
  if (status === 'IN_PROGRESS') return Clock;
  if (status === 'DONE') return Check;
  return Circle;
}

function statusBadgeClass(status: TaskStatus): string {
  if (status === 'DONE') return 'badge badge--success';
  if (status === 'IN_PROGRESS') return 'badge badge--warning';
  return 'badge badge--muted';
}

function priorityBadgeClass(priority: TaskPriority): string {
  if (priority === 'HIGH') return 'badge badge--danger';
  if (priority === 'MEDIUM') return 'badge badge--soft';
  return 'badge badge--muted';
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
              {(tasks ?? []).map((task) => {
                const Icon = statusIcon(task.status);
                return (
                  <tr key={task.idTask}>
                    <td data-label={t.tasks.my.columnTitle}>
                      <strong>{task.title}</strong>
                      <span className={priorityBadgeClass(task.priority)} style={{ marginLeft: 8 }}>
                        {t.taskPriority[task.priority]}
                      </span>
                      {task.description && <div className="field-hint">{task.description}</div>}
                      {task.attachment && (
                        <IconButton
                          icon={<Paperclip size={15} aria-hidden="true" />}
                          label={t.tasks.my.downloadAttachment}
                          onClick={() => tasksApi.downloadAttachment(task.idTask, task.attachment)}
                        />
                      )}
                    </td>
                    <td data-label={t.tasks.my.columnDates}>{task.startDate} → {task.endDate}</td>
                    <td data-label={t.tasks.my.columnStatus}>
                      <button
                        type="button"
                        className={`${statusBadgeClass(task.status)} badge-btn`}
                        disabled={statusMutation.isPending}
                        onClick={() =>
                          statusMutation.mutate({
                            id: task.idTask,
                            status: STATUS_ORDER[(STATUS_ORDER.indexOf(task.status) + 1) % STATUS_ORDER.length],
                          })
                        }
                        title={t.tasks.my.updateStatusLabel}
                      >
                        <Icon size={13} aria-hidden="true" /> {t.taskStatus[task.status]}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// COMPANY: assign tasks by required skills (typeahead over approved skill labels,
// ranked candidates), then browse progress per department (read-only grouping —
// department itself is managed on the Personnel page, not here).
// ============================================================================
interface DepartmentGroup {
  key: string;
  label: string;
  members: Personnel[];
}

function statusCounts(tasks: Task[]) {
  return {
    TODO: tasks.filter((t) => t.status === 'TODO').length,
    IN_PROGRESS: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
    DONE: tasks.filter((t) => t.status === 'DONE').length,
  };
}

function ManagerTasks() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { confirmOptions, requestConfirm, closeConfirm, handleConfirm } = useConfirm();

  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [requiredSkills, setRequiredSkills] = useState<string[]>([]);
  const [skillQuery, setSkillQuery] = useState('');
  const [nameSearch, setNameSearch] = useState('');
  const [assignee, setAssignee] = useState<Personnel | null>(null);

  const [editing, setEditing] = useState<Task | null>(null);
  const [editingOwner, setEditingOwner] = useState<Personnel | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [createAttachment, setCreateAttachment] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: personnelList, isLoading, isError } = useQuery({
    queryKey: ['personnel'],
    queryFn: personnelApi.list,
  });

  const invalidateAll = () => queryClient.invalidateQueries({ queryKey: ['personnel'] });

  const departments = useMemo<DepartmentGroup[]>(() => {
    const map = new Map<string, Personnel[]>();
    (personnelList ?? []).forEach((p) => {
      const key = departmentKey(p);
      const list = map.get(key) ?? [];
      list.push(p);
      map.set(key, list);
    });
    const realKeys = [...map.keys()].filter((k) => k !== UNASSIGNED).sort((a, b) => a.localeCompare(b));
    const keys = map.has(UNASSIGNED) ? [...realKeys, UNASSIGNED] : realKeys;
    return keys.map((key) => ({
      key,
      label: key === UNASSIGNED ? t.tasks.manager.unassignedDepartment : key,
      members: map.get(key) ?? [],
    }));
  }, [personnelList, t]);

  const statusSeries = useMemo<StackedSeries[]>(
    () => [
      { key: 'TODO', label: t.taskStatus.TODO, color: 'var(--text-muted)' },
      { key: 'IN_PROGRESS', label: t.taskStatus.IN_PROGRESS, color: 'var(--warning)' },
      { key: 'DONE', label: t.taskStatus.DONE, color: 'var(--success)' },
    ],
    [t],
  );

  // Approved skill labels across the whole company — the pool the typeahead suggests from.
  const allSkillLabels = useMemo(() => {
    const map = new Map<string, string>();
    (personnelList ?? []).forEach((p) => {
      (p.skills ?? []).filter((s) => s.status === 'APPROVED').forEach((s) => map.set(s.label.toLowerCase(), s.label));
    });
    return [...map.values()].sort((a, b) => a.localeCompare(b));
  }, [personnelList]);

  const skillSuggestions = useMemo(() => {
    const q = skillQuery.trim().toLowerCase();
    if (q.length < 3) return [];
    return allSkillLabels
      .filter((label) => label.toLowerCase().includes(q) && !requiredSkills.some((r) => r.toLowerCase() === label.toLowerCase()))
      .slice(0, 8);
  }, [skillQuery, allSkillLabels, requiredSkills]);

  const candidates = useMemo(() => {
    if (!showAssignModal || !personnelList) return [];
    const q = nameSearch.trim().toLowerCase();
    const pool = q ? personnelList.filter((p) => personnelName(p).toLowerCase().includes(q)) : personnelList;
    if (requiredSkills.length === 0) {
      return pool.map((p) => ({ personnel: p, score: 0 })).sort((a, b) => personnelName(a.personnel).localeCompare(personnelName(b.personnel)));
    }
    const required = requiredSkills.map((s) => s.toLowerCase());
    return pool
      .map((p) => {
        const approvedLabels = (p.skills ?? []).filter((s) => s.status === 'APPROVED').map((s) => s.label.toLowerCase());
        const score = required.filter((r) => approvedLabels.includes(r)).length;
        return { personnel: p, score };
      })
      .sort((a, b) => b.score - a.score || personnelName(a.personnel).localeCompare(personnelName(b.personnel)));
  }, [showAssignModal, personnelList, nameSearch, requiredSkills]);

  const createMutation = useMutation({
    mutationFn: tasksApi.create,
    onSuccess: async (created) => {
      if (createAttachment) {
        try {
          await tasksApi.uploadAttachment(created.idTask, createAttachment);
        } catch {
          // The task itself was created successfully either way.
        }
      }
      invalidateAll();
      closeAssignModal();
      toast.showSuccess(t.tasks.manager.createdSuccess);
    },
    onError: (err) => {
      const message = getErrorMessage(err, t.tasks.manager.errorCreate);
      setFormError(message);
      toast.showError(message);
    },
  });

  const uploadAttachmentMutation = useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => tasksApi.uploadAttachment(id, file),
    onSuccess: (updated) => {
      invalidateAll();
      setEditing(updated);
      toast.showSuccess(t.tasks.manager.attachmentUploadedSuccess);
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.tasks.manager.errorUploadAttachment)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ReturnType<typeof buildPayload> }) => tasksApi.update(id, payload),
    onSuccess: () => {
      invalidateAll();
      setEditing(null);
      setEditingOwner(null);
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
      toast.showSuccess(t.tasks.manager.statusUpdatedSuccess);
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.tasks.manager.errorUpdateStatus)),
  });

  function buildPayload(f: typeof EMPTY_FORM) {
    return {
      title: f.title,
      description: f.description || undefined,
      startDate: f.startDate,
      endDate: f.endDate,
      priority: f.priority,
    };
  }

  const toggleExpanded = (id: number) => {
    setExpandedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openAssignModal = () => {
    setRequiredSkills([]);
    setSkillQuery('');
    setNameSearch('');
    setAssignee(null);
    setForm(EMPTY_FORM);
    setCreateAttachment(null);
    setFormError(null);
    setShowAssignModal(true);
  };

  const closeAssignModal = () => {
    setShowAssignModal(false);
    setAssignee(null);
  };

  const handleAddSkill = (label: string) => {
    setRequiredSkills((cur) => (cur.some((s) => s.toLowerCase() === label.toLowerCase()) ? cur : [...cur, label]));
    setSkillQuery('');
  };

  const handleSkillInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const value = skillQuery.trim();
    if (!value) return;
    handleAddSkill(value);
  };

  const openEditModal = (task: Task, owner: Personnel) => {
    setEditing(task);
    setEditingOwner(owner);
    setForm({
      title: task.title,
      description: task.description ?? '',
      startDate: task.startDate,
      endDate: task.endDate,
      priority: task.priority,
    });
    setFormError(null);
  };

  const handleEditAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editing) return;
    uploadAttachmentMutation.mutate({ id: editing.idTask, file });
    e.target.value = '';
  };

  const handleAssignSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!assignee) return;
    setFormError(null);
    createMutation.mutate({ ...buildPayload(form), personnel: { idPersonnel: assignee.idPersonnel } });
  };

  const handleEditSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setFormError(null);
    updateMutation.mutate({ id: editing.idTask, payload: buildPayload(form) });
  };

  const handleDeleteTask = (task: Task, owner: Personnel) => {
    requestConfirm({
      title: t.tasks.manager.deleteTitle,
      message: t.tasks.manager.deleteMessage(personnelName(owner)),
      confirmLabel: t.tasks.manager.delete,
      variant: 'danger',
      onConfirm: () => deleteMutation.mutate(task.idTask),
    });
  };

  if (isLoading) return <p className="jobs__status">{t.tasks.manager.loading}</p>;
  if (isError) return <p className="jobs__status">{t.tasks.manager.errorLoad}</p>;

  return (
    <div>
      <div className="page__header page__header--row">
        <div>
          <h1>{t.tasks.manager.title}</h1>
          <p className="page__subtitle">{t.tasks.manager.subtitle}</p>
        </div>
        <button className="btn btn--primary" onClick={openAssignModal}>
          <Plus size={16} aria-hidden="true" />
          {t.tasks.manager.assignTask}
        </button>
      </div>

      {departments.length === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">{t.common.noRecords}</span>
          <p>{t.tasks.manager.noEmployees}</p>
        </div>
      )}

      {departments.map((dept) => {
        const chartData: StackedDatum[] = dept.members.map((m) => ({
          label: personnelName(m),
          values: statusCounts(m.tasks ?? []),
        }));
        return (
          <div className="skill-card" key={dept.key} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 className="profile-panel__title" style={{ margin: 0 }}>{dept.label}</h2>
              <span className="badge badge--muted">{t.tasks.manager.membersCount(dept.members.length)}</span>
            </div>

            {dept.members.length === 0 ? (
              <div className="field-hint">{t.tasks.manager.noMembersYet}</div>
            ) : (
              <>
                <StackedBarChart data={chartData} series={statusSeries} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 16 }}>
                  {dept.members.map((m) => {
                    const tasks = m.tasks ?? [];
                    const done = tasks.filter((tk) => tk.status === 'DONE').length;
                    const expanded = expandedIds.has(m.idPersonnel);
                    return (
                      <div key={m.idPersonnel}>
                        <button className="member-list-item" onClick={() => toggleExpanded(m.idPersonnel)}>
                          {m.image ? (
                            <img className="avatar" src={fileUrl(m.image)} alt="" />
                          ) : (
                            <span className="avatar avatar--initials">{personnelName(m).slice(0, 1)}</span>
                          )}
                          <span className="member-list-item__body">
                            <span className="member-list-item__name">{personnelName(m)}</span>
                            <span className="member-list-item__role">{m.contract?.work || '—'}</span>
                          </span>
                          <span className="badge badge--muted">{t.tasks.manager.tasksDoneRatio(done, tasks.length)}</span>
                          <ChevronRight size={16} aria-hidden="true" style={{ transform: expanded ? 'rotate(90deg)' : undefined, transition: 'transform 0.15s' }} />
                        </button>

                        {expanded && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '6px 0 6px 44px' }}>
                            {tasks.length === 0 && <div className="field-hint">{t.tasks.manager.noTasksYet}</div>}
                            {tasks.map((task) => {
                              const Icon = statusIcon(task.status);
                              return (
                                <div key={task.idTask} className="task-row">
                                  <button
                                    type="button"
                                    className={`${statusBadgeClass(task.status)} badge-btn`}
                                    disabled={statusMutation.isPending}
                                    onClick={() =>
                                      statusMutation.mutate({
                                        id: task.idTask,
                                        status: STATUS_ORDER[(STATUS_ORDER.indexOf(task.status) + 1) % STATUS_ORDER.length],
                                      })
                                    }
                                  >
                                    <Icon size={13} aria-hidden="true" /> {t.taskStatus[task.status]}
                                  </button>
                                  <span className={`task-row__title${task.status === 'DONE' ? ' task-row__title--done' : ''}`}>
                                    {task.title}
                                  </span>
                                  <span className={priorityBadgeClass(task.priority)}>
                                    <AlertCircle size={12} aria-hidden="true" /> {t.taskPriority[task.priority]}
                                  </span>
                                  {task.attachment && (
                                    <IconButton
                                      icon={<Paperclip size={15} aria-hidden="true" />}
                                      label={t.tasks.manager.downloadAttachment}
                                      onClick={() => tasksApi.downloadAttachment(task.idTask, task.attachment)}
                                    />
                                  )}
                                  <IconButton
                                    icon={<Pencil size={15} aria-hidden="true" />}
                                    label={t.tasks.manager.edit}
                                    onClick={() => openEditModal(task, m)}
                                  />
                                  <IconButton
                                    icon={<X size={15} aria-hidden="true" />}
                                    label={t.tasks.manager.delete}
                                    variant="danger"
                                    disabled={deleteMutation.isPending}
                                    onClick={() => handleDeleteTask(task, m)}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        );
      })}

      {showAssignModal && (
        <div className="modal-overlay" onClick={closeAssignModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t.tasks.manager.assignModalTitle}</h2>
            {formError && <div className="alert alert--error">{formError}</div>}
            <div className="fieldset">
              <label className="field">
                <span>{t.tasks.manager.requiredSkillsLabel}</span>
                <input
                  value={skillQuery}
                  onChange={(e) => setSkillQuery(e.target.value)}
                  onKeyDown={handleSkillInputKeyDown}
                  placeholder={t.tasks.manager.requiredSkillsPlaceholder}
                />
              </label>
              {skillSuggestions.length > 0 && (
                <div className="autocomplete-list">
                  {skillSuggestions.map((label) => (
                    <button key={label} type="button" className="autocomplete-list__item" onClick={() => handleAddSkill(label)}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {requiredSkills.length > 0 && (
                <div className="tag-list" style={{ marginBottom: 10 }}>
                  {requiredSkills.map((s) => (
                    <span key={s} className="skill-chip">
                      <span className="badge badge--soft">{s}</span>
                      <IconButton
                        icon={<X size={12} aria-hidden="true" />}
                        label={t.tasks.manager.cancel}
                        onClick={() => setRequiredSkills((cur) => cur.filter((x) => x !== s))}
                      />
                    </span>
                  ))}
                </div>
              )}

              {!assignee && (
                <>
                  <label className="field">
                    <span>{t.tasks.manager.searchByNameLabel}</span>
                    <input
                      value={nameSearch}
                      onChange={(e) => setNameSearch(e.target.value)}
                      placeholder={t.tasks.manager.searchByNamePlaceholder}
                    />
                  </label>

                  <span className="tag-group__label">{t.tasks.manager.suggestedCandidates}</span>
                  <div className="candidate-list">
                    {candidates.length === 0 && <div className="field-hint">{t.tasks.manager.noCandidates}</div>}
                    {candidates.map(({ personnel, score }) => (
                      <button
                        key={personnel.idPersonnel}
                        type="button"
                        className="candidate-item"
                        onClick={() => setAssignee(personnel)}
                      >
                        {personnel.image ? (
                          <img className="avatar" src={fileUrl(personnel.image)} alt="" />
                        ) : (
                          <span className="avatar avatar--initials">{personnelName(personnel).slice(0, 1)}</span>
                        )}
                        <span className="member-list-item__body">
                          <span className="member-list-item__name">{personnelName(personnel)}</span>
                          <span className="member-list-item__role">{personnel.department?.trim() || t.tasks.manager.unassignedDepartment}</span>
                        </span>
                        {requiredSkills.length > 0 && (
                          <span className="badge badge--soft">{t.tasks.manager.matchingSkills(score, requiredSkills.length)}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {assignee && (
                <>
                  <div className="skill-chip" style={{ marginBottom: 14 }}>
                    <span className="badge badge--success">{t.tasks.manager.assigneeSelectedLabel(personnelName(assignee))}</span>
                    <IconButton
                      icon={<X size={12} aria-hidden="true" />}
                      label={t.tasks.manager.changeAssignee}
                      onClick={() => setAssignee(null)}
                    />
                  </div>
                  <form onSubmit={handleAssignSubmit}>
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
                      <label className="field">
                        <span>{t.tasks.manager.priorityLabel}</span>
                        <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as TaskPriority }))}>
                          <option value="LOW">{t.taskPriority.LOW}</option>
                          <option value="MEDIUM">{t.taskPriority.MEDIUM}</option>
                          <option value="HIGH">{t.taskPriority.HIGH}</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>{t.tasks.manager.attachmentOptional}</span>
                        <input type="file" onChange={(e) => setCreateAttachment(e.target.files?.[0] ?? null)} />
                      </label>
                    </div>
                    <div className="modal__actions">
                      <button type="button" className="btn btn--ghost" onClick={closeAssignModal}>
                        {t.tasks.manager.cancel}
                      </button>
                      <button className="btn btn--primary" type="submit" disabled={createMutation.isPending}>
                        {createMutation.isPending ? t.tasks.manager.creating : t.tasks.manager.createTask}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>

            {!assignee && (
              <div className="modal__actions">
                <button type="button" className="btn btn--ghost" onClick={closeAssignModal}>
                  {t.tasks.manager.close}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t.tasks.manager.editModalTitle(personnelName(editingOwner ?? undefined))}</h2>
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
                <label className="field">
                  <span>{t.tasks.manager.priorityLabel}</span>
                  <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as TaskPriority }))}>
                    <option value="LOW">{t.taskPriority.LOW}</option>
                    <option value="MEDIUM">{t.taskPriority.MEDIUM}</option>
                    <option value="HIGH">{t.taskPriority.HIGH}</option>
                  </select>
                </label>
                <label className="field">
                  <span>{t.tasks.manager.attachmentOptional}</span>
                  <input type="file" onChange={handleEditAttachmentChange} disabled={uploadAttachmentMutation.isPending} />
                </label>
                {editing.attachment && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => tasksApi.downloadAttachment(editing.idTask, editing.attachment)}
                  >
                    <Paperclip size={14} aria-hidden="true" />
                    {t.tasks.manager.downloadCurrentAttachment}
                  </button>
                )}
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

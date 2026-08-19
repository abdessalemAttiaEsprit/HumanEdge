import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Check,
  ChevronRight,
  Circle,
  Clock,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { tasksApi } from '@/api/tasks';
import { personnelApi } from '@/api/personnel';
import { useAuth } from '@/auth/useAuth';
import { useLanguage } from '@/i18n/useLanguage';
import { getErrorMessage } from '@/lib/errors';
import { useConfirm } from '@/lib/useConfirm';
import { IconButton } from '@/components/IconButton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/ToastProvider';
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
// COMPANY: teams (= departments) → members → tasks, three-column workspace.
// ============================================================================
function ManagerTasks() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { confirmOptions, requestConfirm, closeConfirm, handleConfirm } = useConfirm();

  const [draftTeams, setDraftTeams] = useState<string[]>([]);
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [selectedPersonnelId, setSelectedPersonnelId] = useState<number | null>(null);

  const [showAddTeamModal, setShowAddTeamModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');

  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [requiredSkills, setRequiredSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState('');
  const [memberSearch, setMemberSearch] = useState('');

  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [createAttachment, setCreateAttachment] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: personnelList, isLoading, isError } = useQuery({
    queryKey: ['personnel'],
    queryFn: personnelApi.list,
  });

  const invalidateAll = () => queryClient.invalidateQueries({ queryKey: ['personnel'] });

  const teams = useMemo(() => {
    const map = new Map<string, Personnel[]>();
    (personnelList ?? []).forEach((p) => {
      const key = departmentKey(p);
      const list = map.get(key) ?? [];
      list.push(p);
      map.set(key, list);
    });
    draftTeams.forEach((name) => {
      if (!map.has(name)) map.set(name, []);
    });
    const realKeys = [...map.keys()].filter((k) => k !== UNASSIGNED).sort((a, b) => a.localeCompare(b));
    const keys = map.has(UNASSIGNED) ? [...realKeys, UNASSIGNED] : realKeys;
    return keys.map((key) => ({ key, label: key === UNASSIGNED ? t.tasks.manager.unassignedDepartment : key, members: map.get(key) ?? [] }));
  }, [personnelList, draftTeams, t]);

  const currentTeam = teams.find((tm) => tm.key === selectedDept) ?? null;
  const currentMember = (personnelList ?? []).find((p) => p.idPersonnel === selectedPersonnelId) ?? null;
  const memberTasks = currentMember?.tasks ?? [];

  const addMemberMutation = useMutation({
    mutationFn: ({ personnel, department }: { personnel: Personnel; department: string }) =>
      personnelApi.update(personnel.idPersonnel, {
        cin: personnel.cin,
        cnssNumber: personnel.cnssNumber,
        rib: personnel.rib,
        telephone: personnel.telephone,
        image: personnel.image,
        department: department === UNASSIGNED ? undefined : department,
        user: { idUser: personnel.user!.idUser },
      }),
    onSuccess: () => {
      invalidateAll();
      toast.showSuccess(t.tasks.manager.memberAddedSuccess);
      setShowAddMemberModal(false);
      setRequiredSkills([]);
      setSkillInput('');
      setMemberSearch('');
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.tasks.manager.errorAddMember)),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (personnel: Personnel) =>
      personnelApi.update(personnel.idPersonnel, {
        cin: personnel.cin,
        cnssNumber: personnel.cnssNumber,
        rib: personnel.rib,
        telephone: personnel.telephone,
        image: personnel.image,
        department: undefined,
        user: { idUser: personnel.user!.idUser },
      }),
    onSuccess: () => {
      invalidateAll();
      toast.showSuccess(t.tasks.manager.memberRemovedSuccess);
      setSelectedPersonnelId(null);
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.tasks.manager.errorRemoveMember)),
  });

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
      setShowAddTaskModal(false);
      setForm(EMPTY_FORM);
      setCreateAttachment(null);
      setFormError(null);
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

  const candidates = useMemo(() => {
    if (!showAddMemberModal || !personnelList) return [];
    const pool = personnelList.filter((p) => departmentKey(p) !== selectedDept);
    const q = memberSearch.trim().toLowerCase();
    const withSearch = q ? pool.filter((p) => personnelName(p).toLowerCase().includes(q)) : pool;
    if (requiredSkills.length === 0) {
      return withSearch
        .map((p) => ({ personnel: p, score: 0 }))
        .sort((a, b) => personnelName(a.personnel).localeCompare(personnelName(b.personnel)));
    }
    const required = requiredSkills.map((s) => s.toLowerCase());
    return withSearch
      .map((p) => {
        const approvedLabels = (p.skills ?? []).filter((s) => s.status === 'APPROVED').map((s) => s.label.toLowerCase());
        const score = required.filter((r) => approvedLabels.includes(r)).length;
        return { personnel: p, score };
      })
      .sort((a, b) => b.score - a.score || personnelName(a.personnel).localeCompare(personnelName(b.personnel)));
  }, [showAddMemberModal, personnelList, selectedDept, memberSearch, requiredSkills]);

  const openAddTeamModal = () => {
    setNewTeamName('');
    setShowAddTeamModal(true);
  };

  const handleCreateTeam = (e: FormEvent) => {
    e.preventDefault();
    const name = newTeamName.trim();
    if (!name) return;
    setDraftTeams((cur) => (cur.includes(name) ? cur : [...cur, name]));
    setSelectedDept(name);
    setSelectedPersonnelId(null);
    setShowAddTeamModal(false);
  };

  const handleAddSkillTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const value = skillInput.trim();
    if (!value || requiredSkills.some((s) => s.toLowerCase() === value.toLowerCase())) {
      setSkillInput('');
      return;
    }
    setRequiredSkills((cur) => [...cur, value]);
    setSkillInput('');
  };

  const openAddTaskModal = () => {
    setForm(EMPTY_FORM);
    setCreateAttachment(null);
    setFormError(null);
    setShowAddTaskModal(true);
  };

  const openEditModal = (task: Task) => {
    setEditing(task);
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

  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!currentMember) return;
    setFormError(null);
    createMutation.mutate({ ...buildPayload(form), personnel: { idPersonnel: currentMember.idPersonnel } });
  };

  const handleEditSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setFormError(null);
    updateMutation.mutate({ id: editing.idTask, payload: buildPayload(form) });
  };

  const handleDeleteTask = (task: Task) => {
    requestConfirm({
      title: t.tasks.manager.deleteTitle,
      message: t.tasks.manager.deleteMessage(personnelName(currentMember ?? undefined)),
      confirmLabel: t.tasks.manager.delete,
      variant: 'danger',
      onConfirm: () => deleteMutation.mutate(task.idTask),
    });
  };

  const handleRemoveMember = (personnel: Personnel) => {
    requestConfirm({
      title: t.tasks.manager.removeMemberConfirmTitle,
      message: t.tasks.manager.removeMemberConfirmMessage(personnelName(personnel)),
      confirmLabel: t.tasks.manager.removeMember,
      variant: 'danger',
      onConfirm: () => removeMemberMutation.mutate(personnel),
    });
  };

  if (isLoading) return <p className="jobs__status">{t.tasks.manager.loading}</p>;
  if (isError) return <p className="jobs__status">{t.tasks.manager.errorLoad}</p>;

  return (
    <div>
      <div className="page__header">
        <h1>{t.tasks.manager.title}</h1>
        <p className="page__subtitle">{t.tasks.manager.subtitle}</p>
      </div>

      <div className="team-tasks">
        {/* ---- Column 1: teams (departments) ---- */}
        <div className="team-col">
          <div className="team-col__header">
            <Users size={16} aria-hidden="true" />
            <span>{t.tasks.manager.departmentsTitle}</span>
          </div>
          <div className="team-col__body">
            {teams.map((tm) => (
              <button
                key={tm.key}
                className={`team-list-item${tm.key === selectedDept ? ' team-list-item--active' : ''}`}
                onClick={() => {
                  setSelectedDept(tm.key);
                  setSelectedPersonnelId(null);
                }}
              >
                <span className="team-list-item__name">{tm.label}</span>
                <span className="badge badge--muted">{tm.members.length}</span>
              </button>
            ))}
          </div>
          <button className="team-col__footer-btn" onClick={openAddTeamModal}>
            <Plus size={15} aria-hidden="true" /> {t.tasks.manager.addTeam}
          </button>
        </div>

        {/* ---- Column 2: members of the selected team ---- */}
        <div className="team-col">
          {currentTeam ? (
            <>
              <div className="team-col__header team-col__header--row">
                <div>
                  <div className="team-col__title">{currentTeam.label}</div>
                  <div className="team-col__subtitle">{t.tasks.manager.membersCount(currentTeam.members.length)}</div>
                </div>
              </div>
              <div className="team-col__body">
                {currentTeam.members.length === 0 && <div className="field-hint" style={{ padding: '12px 4px' }}>{t.tasks.manager.noMembersYet}</div>}
                {currentTeam.members.map((m) => {
                  const done = (m.tasks ?? []).filter((tk) => tk.status === 'DONE').length;
                  return (
                    <button
                      key={m.idPersonnel}
                      className={`member-list-item${m.idPersonnel === selectedPersonnelId ? ' member-list-item--active' : ''}`}
                      onClick={() => setSelectedPersonnelId(m.idPersonnel)}
                    >
                      {m.image ? (
                        <img className="avatar" src={fileUrl(m.image)} alt="" />
                      ) : (
                        <span className="avatar avatar--initials">{personnelName(m).slice(0, 1)}</span>
                      )}
                      <span className="member-list-item__body">
                        <span className="member-list-item__name">{personnelName(m)}</span>
                        <span className="member-list-item__role">{m.contract?.work || '—'}</span>
                      </span>
                      <span className="badge badge--muted">{done}/{(m.tasks ?? []).length}</span>
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
              <button className="team-col__footer-btn" onClick={() => setShowAddMemberModal(true)}>
                <UserPlus size={15} aria-hidden="true" /> {t.tasks.manager.addMember}
              </button>
            </>
          ) : (
            <div className="field-hint" style={{ padding: 20 }}>{t.tasks.manager.selectDepartmentPrompt}</div>
          )}
        </div>

        {/* ---- Column 3: tasks of the selected member ---- */}
        <div className="team-col">
          {currentMember ? (
            <>
              <div className="team-col__header team-col__header--row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {currentMember.image ? (
                    <img className="avatar" src={fileUrl(currentMember.image)} alt="" />
                  ) : (
                    <span className="avatar avatar--initials">{personnelName(currentMember).slice(0, 1)}</span>
                  )}
                  <div>
                    <div className="team-col__title">{personnelName(currentMember)}</div>
                    <div className="team-col__subtitle">{currentMember.contract?.work || '—'}</div>
                  </div>
                </div>
                <IconButton
                  icon={<Trash2 size={15} aria-hidden="true" />}
                  label={t.tasks.manager.removeMember}
                  variant="danger"
                  disabled={removeMemberMutation.isPending}
                  onClick={() => handleRemoveMember(currentMember)}
                />
              </div>
              <div className="team-col__body">
                {memberTasks.length === 0 && <div className="field-hint" style={{ padding: '12px 4px' }}>{t.tasks.manager.noTasksYet}</div>}
                {memberTasks.map((task) => {
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
                        onClick={() => openEditModal(task)}
                      />
                      <IconButton
                        icon={<X size={15} aria-hidden="true" />}
                        label={t.tasks.manager.delete}
                        variant="danger"
                        disabled={deleteMutation.isPending}
                        onClick={() => handleDeleteTask(task)}
                      />
                    </div>
                  );
                })}
              </div>
              <button className="team-col__footer-btn" onClick={openAddTaskModal}>
                <Plus size={15} aria-hidden="true" /> {t.tasks.manager.addTask}
              </button>
            </>
          ) : (
            <div className="field-hint" style={{ padding: 20 }}>{t.tasks.manager.selectMemberPrompt}</div>
          )}
        </div>
      </div>

      {showAddTeamModal && (
        <div className="modal-overlay" onClick={() => setShowAddTeamModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t.tasks.manager.newTeamModalTitle}</h2>
            <form onSubmit={handleCreateTeam}>
              <div className="fieldset">
                <label className="field">
                  <span>{t.tasks.manager.newTeamNameLabel}</span>
                  <input
                    autoFocus
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    placeholder={t.tasks.manager.newTeamNamePlaceholder}
                    required
                  />
                </label>
              </div>
              <div className="modal__actions">
                <button type="button" className="btn btn--ghost" onClick={() => setShowAddTeamModal(false)}>
                  {t.tasks.manager.cancel}
                </button>
                <button className="btn btn--primary" type="submit">
                  {t.tasks.manager.create}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddMemberModal && currentTeam && (
        <div className="modal-overlay" onClick={() => setShowAddMemberModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t.tasks.manager.addMemberModalTitle}</h2>
            <div className="fieldset">
              <label className="field">
                <span>{t.tasks.manager.requiredSkillsLabel}</span>
                <input
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={handleAddSkillTag}
                  placeholder={t.tasks.manager.requiredSkillsPlaceholder}
                />
              </label>
              {requiredSkills.length > 0 && (
                <div className="tag-list">
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

              <label className="field">
                <span>{t.tasks.manager.searchByNameLabel}</span>
                <input
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder={t.tasks.manager.searchByNamePlaceholder}
                />
              </label>

              <span className="tag-group__label">{t.tasks.manager.suggestedCandidates}</span>
              <div className="candidate-list">
                {candidates.length === 0 && <div className="field-hint">{t.tasks.manager.noCandidates}</div>}
                {candidates.map(({ personnel, score }) => (
                  <button
                    key={personnel.idPersonnel}
                    className="candidate-item"
                    disabled={addMemberMutation.isPending}
                    onClick={() => addMemberMutation.mutate({ personnel, department: currentTeam.key })}
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
            </div>
            <div className="modal__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setShowAddMemberModal(false)}>
                {t.tasks.manager.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddTaskModal && (
        <div className="modal-overlay" onClick={() => setShowAddTaskModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t.tasks.manager.addModalTitle}</h2>
            <form onSubmit={handleCreateSubmit}>
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
                  <input type="file" onChange={(e) => setCreateAttachment(e.target.files?.[0] ?? null)} />
                </label>
              </div>
              <div className="modal__actions">
                <button type="button" className="btn btn--ghost" onClick={() => setShowAddTaskModal(false)}>
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
            <h2>{t.tasks.manager.editModalTitle(personnelName(currentMember ?? undefined))}</h2>
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

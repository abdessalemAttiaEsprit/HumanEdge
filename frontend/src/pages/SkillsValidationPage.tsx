import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Upload, X } from 'lucide-react';
import { personnelApi } from '@/api/personnel';
import { skillsApi } from '@/api/skills';
import { diplomasApi } from '@/api/diplomas';
import { fileUrl } from '@/api/axios';
import { useLanguage } from '@/i18n/useLanguage';
import type { Messages } from '@/i18n/en';
import { getErrorMessage } from '@/lib/errors';
import { translateSkillLabel } from '@/lib/skillCatalog';
import { usePagination } from '@/lib/usePagination';
import { useToast } from '@/components/ToastProvider';
import { IconButton } from '@/components/IconButton';
import { Pagination } from '@/components/Pagination';
import type { Personnel, Skill, SkillCategory } from '@/types';

function personnelName(p: Personnel): string {
  if (!p.user) return '—';
  return `${p.user.firstname} ${p.user.lastname}`;
}

function statusBadgeClass(status: Skill['status']): string {
  if (status === 'APPROVED') return 'badge badge--success';
  if (status === 'REJECTED') return 'badge badge--danger';
  return 'badge badge--warning';
}

interface Mutations {
  addSkill: (personnelId: number, label: string, category: SkillCategory) => void;
  addSkillPending: boolean;
  updateStatus: (id: number, status: 'APPROVED' | 'REJECTED') => void;
  updateStatusPending: boolean;
  addDiploma: (personnelId: number, name: string, file: File) => void;
  addDiplomaPending: boolean;
}

function PersonnelSkillCard({ personnel, t, mutations }: { personnel: Personnel; t: Messages; mutations: Mutations }) {
  const [customLabel, setCustomLabel] = useState('');
  const [customCategory, setCustomCategory] = useState<SkillCategory>('GENERAL');
  const [diplomaName, setDiplomaName] = useState('');

  const { data: suggestions } = useQuery({
    queryKey: ['skills', 'suggestions', personnel.idPersonnel],
    queryFn: () => skillsApi.getSuggestions(personnel.idPersonnel),
  });

  const skills = personnel.skills ?? [];
  const diplomas = personnel.diplomas ?? [];
  const existingLabels = useMemo(
    () => new Set(skills.map((s) => s.label.trim().toLowerCase())),
    [skills],
  );

  const handleCustomSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!customLabel.trim()) return;
    mutations.addSkill(personnel.idPersonnel, customLabel.trim(), customCategory);
    setCustomLabel('');
  };

  const handleDiplomaFile = (file: File | null) => {
    if (!file) return;
    const fallbackName = file.name.replace(/\.[^.]+$/, '');
    mutations.addDiploma(personnel.idPersonnel, diplomaName.trim() || fallbackName, file);
    setDiplomaName('');
  };

  return (
    <div className="skill-card">
      <div className="skill-card__header">
        {personnel.image ? (
          <img className="avatar" src={fileUrl(personnel.image)} alt="" />
        ) : (
          <span className="avatar avatar--initials">{personnelName(personnel).slice(0, 1)}</span>
        )}
        <div>
          <div className="skill-card__name">{personnelName(personnel)}</div>
          <div className="skill-card__meta">
            {personnel.department && <span className="badge badge--muted">{personnel.department}</span>}
            {personnel.contract?.work && <span className="badge badge--muted">{personnel.contract.work}</span>}
          </div>
        </div>
      </div>

      <div className="tag-list" style={{ margin: '14px 0' }}>
        {skills.length === 0 && <span className="field-hint">{t.skills.validation.noneYet}</span>}
        {skills.map((skill) => (
          <span key={skill.idSkill} className="skill-chip">
            <span className={statusBadgeClass(skill.status)}>{translateSkillLabel(skill.label, t.skillCatalog)}</span>
            {skill.status === 'PENDING' && (
              <span className="skill-chip__actions">
                <IconButton
                  icon={<Check size={13} aria-hidden="true" />}
                  label={t.skills.validation.approve}
                  disabled={mutations.updateStatusPending}
                  onClick={() => mutations.updateStatus(skill.idSkill, 'APPROVED')}
                />
                <IconButton
                  icon={<X size={13} aria-hidden="true" />}
                  label={t.skills.validation.reject}
                  variant="danger"
                  disabled={mutations.updateStatusPending}
                  onClick={() => mutations.updateStatus(skill.idSkill, 'REJECTED')}
                />
              </span>
            )}
          </span>
        ))}
      </div>

      {suggestions && (
        <>
          <div className="tag-group">
            <span className="tag-group__label">{t.skills.validation.generalTagsLabel}</span>
            <div className="tag-list">
              {suggestions.general
                .filter((label) => !existingLabels.has(label.trim().toLowerCase()))
                .map((label) => (
                  <button
                    key={label}
                    type="button"
                    className="tag"
                    disabled={mutations.addSkillPending}
                    onClick={() => mutations.addSkill(personnel.idPersonnel, label, 'GENERAL')}
                  >
                    + {translateSkillLabel(label, t.skillCatalog)}
                  </button>
                ))}
            </div>
          </div>
          <div className="tag-group">
            <span className="tag-group__label">{t.skills.validation.specificTagsLabel}</span>
            <div className="tag-list">
              {suggestions.specific
                .filter((label) => !existingLabels.has(label.trim().toLowerCase()))
                .map((label) => (
                  <button
                    key={label}
                    type="button"
                    className="tag"
                    disabled={mutations.addSkillPending}
                    onClick={() => mutations.addSkill(personnel.idPersonnel, label, 'SPECIFIC')}
                  >
                    + {translateSkillLabel(label, t.skillCatalog)}
                  </button>
                ))}
            </div>
          </div>
        </>
      )}

      <form className="field-row" onSubmit={handleCustomSubmit} style={{ marginTop: 6, alignItems: 'flex-end' }}>
        <label className="field">
          <span>{t.skills.validation.customLabel}</span>
          <input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder={t.skills.validation.customPlaceholder} />
        </label>
        <label className="field">
          <span>{t.skills.validation.categoryLabel}</span>
          <select value={customCategory} onChange={(e) => setCustomCategory(e.target.value as SkillCategory)}>
            <option value="GENERAL">{t.skills.validation.categoryGeneral}</option>
            <option value="SPECIFIC">{t.skills.validation.categorySpecific}</option>
          </select>
        </label>
        <button className="btn btn--ghost btn--sm" type="submit" disabled={mutations.addSkillPending || !customLabel.trim()}>
          {t.skills.validation.addSkill}
        </button>
      </form>

      <div className="skill-card__diplomas">
        <span className="tag-group__label">{t.skills.validation.diplomasLabel}</span>
        <div className="diploma-strip">
          {diplomas.length === 0 && <span className="field-hint">{t.skills.validation.noDiplomasYet}</span>}
          {diplomas.map((diploma) => (
            <div key={diploma.idDiploma} className="diploma-thumb" title={diploma.name}>
              <img src={fileUrl(diploma.image)} alt={diploma.name} />
              <span>{diploma.name}</span>
            </div>
          ))}
          <label className="diploma-upload" title={t.skills.validation.addDiploma}>
            <img src="/assets/nav-icons/diplome.svg" alt="" width={16} height={16} aria-hidden="true" />
            <input
              type="text"
              placeholder={t.skills.validation.diplomaNamePlaceholder}
              value={diplomaName}
              onChange={(e) => setDiplomaName(e.target.value)}
            />
            <span className="diploma-upload__icon">
              <Upload size={14} aria-hidden="true" />
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif"
                disabled={mutations.addDiplomaPending}
                onChange={(e) => {
                  handleDiplomaFile(e.target.files?.[0] ?? null);
                  e.target.value = '';
                }}
              />
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}

export function SkillsValidationPage() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState('');

  const { data: personnelList, isLoading, isError } = useQuery({
    queryKey: ['personnel'],
    queryFn: personnelApi.list,
  });

  const invalidateAll = () => queryClient.invalidateQueries({ queryKey: ['personnel'] });

  const addSkillMutation = useMutation({
    mutationFn: ({ personnelId, label, category }: { personnelId: number; label: string; category: SkillCategory }) =>
      skillsApi.addForPersonnel(personnelId, { label, category }),
    onSuccess: () => {
      invalidateAll();
      toast.showSuccess(t.skills.validation.addedSuccess);
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.skills.validation.errorAdd)),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'APPROVED' | 'REJECTED' }) => skillsApi.updateStatus(id, status),
    onSuccess: (_data, variables) => {
      invalidateAll();
      toast.showSuccess(variables.status === 'APPROVED' ? t.skills.validation.approvedSuccess : t.skills.validation.rejectedSuccess);
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.skills.validation.errorUpdateStatus)),
  });

  const addDiplomaMutation = useMutation({
    mutationFn: ({ personnelId, name, file }: { personnelId: number; name: string; file: File }) =>
      diplomasApi.addForPersonnel(personnelId, name, file),
    onSuccess: () => {
      invalidateAll();
      toast.showSuccess(t.skills.validation.diplomaAddedSuccess);
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.skills.validation.errorAddDiploma)),
  });

  const mutations: Mutations = {
    addSkill: (personnelId, label, category) => addSkillMutation.mutate({ personnelId, label, category }),
    addSkillPending: addSkillMutation.isPending,
    updateStatus: (id, status) => statusMutation.mutate({ id, status }),
    updateStatusPending: statusMutation.isPending,
    addDiploma: (personnelId, name, file) => addDiplomaMutation.mutate({ personnelId, name, file }),
    addDiplomaPending: addDiplomaMutation.isPending,
  };

  const filtered = useMemo(() => {
    if (!personnelList) return [];
    const q = search.trim().toLowerCase();
    if (!q) return personnelList;
    return personnelList.filter((p) => {
      const haystack = [personnelName(p), p.department, p.contract?.work].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [personnelList, search]);

  const { page, setPage, pageCount, pageItems } = usePagination(filtered, 6);

  return (
    <div className="page">
      <div className="page__header">
        <h1>{t.skills.validation.title}</h1>
        <p className="page__subtitle">{t.skills.validation.subtitle}</p>
      </div>

      <div className="toolbar">
        <input
          className="toolbar__search"
          type="search"
          placeholder={t.skills.validation.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && <p className="jobs__status">{t.skills.validation.loading}</p>}
      {isError && <p className="jobs__status">{t.skills.validation.errorLoad}</p>}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">{t.common.noRecords}</span>
          <p>{search ? t.skills.validation.noneMatchSearch : t.skills.validation.noEmployees}</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="card-grid card-grid--skills">
          {pageItems.map((p) => (
            <PersonnelSkillCard key={p.idPersonnel} personnel={p} t={t} mutations={mutations} />
          ))}
        </div>
      )}

      <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
    </div>
  );
}

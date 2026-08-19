import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GraduationCap, Trash2, Upload } from 'lucide-react';
import { skillsApi } from '@/api/skills';
import { diplomasApi } from '@/api/diplomas';
import { fileUrl } from '@/api/axios';
import { useLanguage } from '@/i18n/useLanguage';
import { getErrorMessage } from '@/lib/errors';
import { useConfirm } from '@/lib/useConfirm';
import { useToast } from '@/components/ToastProvider';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { IconButton } from '@/components/IconButton';
import type { Skill, SkillCategory } from '@/types';

function statusBadgeClass(status: Skill['status']): string {
  if (status === 'APPROVED') return 'badge badge--success';
  if (status === 'REJECTED') return 'badge badge--danger';
  return 'badge badge--warning';
}

export function SkillsPage() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { confirmOptions, requestConfirm, closeConfirm, handleConfirm } = useConfirm();

  const [customLabel, setCustomLabel] = useState('');
  const [customCategory, setCustomCategory] = useState<SkillCategory>('GENERAL');
  const [diplomaName, setDiplomaName] = useState('');
  const [diplomaFile, setDiplomaFile] = useState<File | null>(null);
  const [diplomaError, setDiplomaError] = useState<string | null>(null);

  const { data: skills, isLoading: skillsLoading, isError: skillsError } = useQuery({
    queryKey: ['skills', 'mine'],
    queryFn: skillsApi.listMine,
  });

  const { data: suggestions } = useQuery({
    queryKey: ['skills', 'suggestions', 'mine'],
    queryFn: () => skillsApi.getSuggestions(),
  });

  const { data: diplomas, isLoading: diplomasLoading, isError: diplomasError } = useQuery({
    queryKey: ['diplomas', 'mine'],
    queryFn: diplomasApi.listMine,
  });

  const existingLabels = useMemo(
    () => new Set((skills ?? []).map((s) => s.label.trim().toLowerCase())),
    [skills],
  );

  const addMutation = useMutation({
    mutationFn: skillsApi.createMine,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills', 'mine'] });
      toast.showSuccess(t.skills.employee.addedSuccess);
      setCustomLabel('');
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.skills.employee.errorAdd)),
  });

  const deleteMutation = useMutation({
    mutationFn: skillsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills', 'mine'] });
      toast.showSuccess(t.skills.employee.deletedSuccess);
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.skills.employee.errorDelete)),
  });

  const addDiplomaMutation = useMutation({
    mutationFn: () => diplomasApi.addMine(diplomaName, diplomaFile as File),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diplomas', 'mine'] });
      toast.showSuccess(t.skills.employee.diplomaAddedSuccess);
      setDiplomaName('');
      setDiplomaFile(null);
      setDiplomaError(null);
    },
    onError: (err) => {
      const message = getErrorMessage(err, t.skills.employee.errorAddDiploma);
      setDiplomaError(message);
      toast.showError(message);
    },
  });

  const deleteDiplomaMutation = useMutation({
    mutationFn: diplomasApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diplomas', 'mine'] });
      toast.showSuccess(t.skills.employee.diplomaDeletedSuccess);
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.skills.employee.errorDeleteDiploma)),
  });

  const handleAddSuggestion = (label: string, category: SkillCategory) => {
    if (existingLabels.has(label.trim().toLowerCase())) return;
    addMutation.mutate({ label, category });
  };

  const handleCustomSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!customLabel.trim()) return;
    addMutation.mutate({ label: customLabel.trim(), category: customCategory });
  };

  const handleDeleteSkill = (skill: Skill) => {
    requestConfirm({
      title: t.skills.employee.deleteTitle,
      message: t.skills.employee.deleteMessage(skill.label),
      confirmLabel: t.skills.employee.delete,
      variant: 'danger',
      onConfirm: () => deleteMutation.mutate(skill.idSkill),
    });
  };

  const handleDiplomaSubmit = (e: FormEvent) => {
    e.preventDefault();
    setDiplomaError(null);
    if (!diplomaName.trim()) {
      setDiplomaError(t.skills.employee.errorDiplomaNameRequired);
      return;
    }
    if (!diplomaFile) {
      setDiplomaError(t.skills.employee.errorDiplomaFileRequired);
      return;
    }
    addDiplomaMutation.mutate();
  };

  return (
    <div className="page">
      <div className="page__header">
        <h1>{t.skills.employee.title}</h1>
        <p className="page__subtitle">{t.skills.employee.subtitle}</p>
      </div>

      <div className="skill-card">
        <h2 className="profile-panel__title">{t.skills.employee.mySkillsTitle}</h2>

        {skillsLoading && <p className="jobs__status">{t.skills.employee.loading}</p>}
        {skillsError && <p className="jobs__status">{t.skills.employee.errorLoad}</p>}

        {!skillsLoading && !skillsError && (
          <div className="tag-list" style={{ marginBottom: 18 }}>
            {(skills ?? []).length === 0 && <span className="field-hint">{t.skills.employee.noneYet}</span>}
            {(skills ?? []).map((skill) => (
              <span key={skill.idSkill} className="skill-chip">
                <span className={statusBadgeClass(skill.status)}>{skill.label}</span>
                <span className="skill-chip__status-label">{t.skillStatus[skill.status]}</span>
                {skill.status !== 'APPROVED' && (
                  <IconButton
                    icon={<Trash2 size={13} aria-hidden="true" />}
                    label={t.skills.employee.delete}
                    variant="danger"
                    disabled={deleteMutation.isPending}
                    onClick={() => handleDeleteSkill(skill)}
                  />
                )}
              </span>
            ))}
          </div>
        )}

        {suggestions && (
          <>
            <div className="tag-group">
              <span className="tag-group__label">{t.skills.employee.generalTagsLabel}</span>
              <div className="tag-list">
                {suggestions.general
                  .filter((label) => !existingLabels.has(label.trim().toLowerCase()))
                  .map((label) => (
                    <button
                      key={label}
                      type="button"
                      className="tag"
                      disabled={addMutation.isPending}
                      onClick={() => handleAddSuggestion(label, 'GENERAL')}
                    >
                      + {label}
                    </button>
                  ))}
              </div>
            </div>
            <div className="tag-group">
              <span className="tag-group__label">{t.skills.employee.specificTagsLabel}</span>
              <div className="tag-list">
                {suggestions.specific
                  .filter((label) => !existingLabels.has(label.trim().toLowerCase()))
                  .map((label) => (
                    <button
                      key={label}
                      type="button"
                      className="tag"
                      disabled={addMutation.isPending}
                      onClick={() => handleAddSuggestion(label, 'SPECIFIC')}
                    >
                      + {label}
                    </button>
                  ))}
              </div>
            </div>
          </>
        )}

        <form className="field-row" onSubmit={handleCustomSubmit} style={{ marginTop: 8, alignItems: 'flex-end' }}>
          <label className="field">
            <span>{t.skills.employee.customLabel}</span>
            <input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder={t.skills.employee.customPlaceholder} />
          </label>
          <label className="field">
            <span>{t.skills.employee.categoryLabel}</span>
            <select value={customCategory} onChange={(e) => setCustomCategory(e.target.value as SkillCategory)}>
              <option value="GENERAL">{t.skills.employee.categoryGeneral}</option>
              <option value="SPECIFIC">{t.skills.employee.categorySpecific}</option>
            </select>
          </label>
          <button className="btn btn--primary" type="submit" disabled={addMutation.isPending || !customLabel.trim()}>
            {t.skills.employee.addCustom}
          </button>
        </form>
      </div>

      <div className="skill-card" style={{ marginTop: 24 }}>
        <h2 className="profile-panel__title">{t.skills.employee.myDiplomasTitle}</h2>

        {diplomasLoading && <p className="jobs__status">{t.skills.employee.loadingDiplomas}</p>}
        {diplomasError && <p className="jobs__status">{t.skills.employee.errorLoadDiplomas}</p>}

        {!diplomasLoading && !diplomasError && (
          <div className="card-grid" style={{ marginBottom: 18 }}>
            {(diplomas ?? []).length === 0 && <span className="field-hint">{t.skills.employee.noDiplomasYet}</span>}
            {(diplomas ?? []).map((diploma) => (
              <div key={diploma.idDiploma} className="diploma-card">
                <img className="diploma-card__image" src={fileUrl(diploma.image)} alt={diploma.name} />
                <div className="diploma-card__footer">
                  <span className="diploma-card__name">{diploma.name}</span>
                  <IconButton
                    icon={<Trash2 size={14} aria-hidden="true" />}
                    label={t.skills.employee.deleteDiploma}
                    variant="danger"
                    disabled={deleteDiplomaMutation.isPending}
                    onClick={() => deleteDiplomaMutation.mutate(diploma.idDiploma)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleDiplomaSubmit}>
          {diplomaError && <div className="alert alert--error">{diplomaError}</div>}
          <div className="field-row" style={{ alignItems: 'flex-end' }}>
            <label className="field">
              <span>{t.skills.employee.diplomaNameLabel}</span>
              <input
                value={diplomaName}
                onChange={(e) => setDiplomaName(e.target.value)}
                placeholder={t.skills.employee.diplomaNamePlaceholder}
              />
            </label>
            <label className="field-with-preview">
              {diplomaFile ? (
                <GraduationCap size={22} aria-hidden="true" />
              ) : (
                <Upload size={18} aria-hidden="true" />
              )}
              <span className="field">
                <span>{t.skills.employee.diplomaImageLabel}</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif"
                  onChange={(e) => setDiplomaFile(e.target.files?.[0] ?? null)}
                />
              </span>
            </label>
            <button className="btn btn--primary" type="submit" disabled={addDiplomaMutation.isPending}>
              {addDiplomaMutation.isPending ? t.skills.employee.addingDiploma : t.skills.employee.addDiploma}
            </button>
          </div>
        </form>
      </div>

      <ConfirmDialog options={confirmOptions} onConfirm={handleConfirm} onCancel={closeConfirm} />
    </div>
  );
}

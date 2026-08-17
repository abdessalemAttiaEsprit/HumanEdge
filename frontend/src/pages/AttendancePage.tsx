import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { personnelApi } from '@/api/personnel';
import { absencesApi } from '@/api/absences';
import { useLanguage } from '@/i18n/useLanguage';
import { getErrorMessage } from '@/lib/errors';
import { TableSkeleton } from '@/components/TableSkeleton';
import { useToast } from '@/components/ToastProvider';
import type { Absence, Personnel } from '@/types';

function personnelName(p: Personnel): string {
  return p.user ? `${p.user.firstname} ${p.user.lastname}` : '—';
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The absence (if any) covering the given date — either a single-day `dateAbsence` match, or a
 * multi-day `startDate`/`endDate` range that includes it (e.g. registered vacation).
 */
export function absenceCoveringDate(absences: Absence[] | undefined, dateIso: string): Absence | undefined {
  return (absences ?? []).find((a) => {
    if (a.dateAbsence) return a.dateAbsence === dateIso;
    if (a.startDate && a.endDate) return dateIso >= a.startDate && dateIso <= a.endDate;
    return false;
  });
}

/**
 * Daily roll call for a company's staff: mark each employee present or absent for a chosen day.
 * Built directly on top of the existing Absence system (see AbsencesPage) rather than a separate
 * log — marking someone absent here creates the same kind of unjustified Absence record, so it
 * counts against their leave quota and next payroll deduction exactly like a manually-entered one.
 * Multi-day absences already on file (e.g. registered vacation) show as "On leave" and can't be
 * toggled from here — they're managed from the Absences page instead.
 */
export function AttendancePage() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [date, setDate] = useState(todayIso());
  const [search, setSearch] = useState('');

  const { data: personnelList, isLoading, isError } = useQuery({
    queryKey: ['personnel'],
    queryFn: personnelApi.list,
  });

  const markAbsentMutation = useMutation({
    mutationFn: (personnelId: number) =>
      absencesApi.create({ dateAbsence: date, personnel: { idPersonnel: personnelId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personnel'] });
      queryClient.invalidateQueries({ queryKey: ['absences'] });
      toast.showSuccess(t.attendance.markedAbsent);
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.attendance.errorMarkAbsent)),
  });

  const markPresentMutation = useMutation({
    mutationFn: (absenceId: number) => absencesApi.remove(absenceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personnel'] });
      queryClient.invalidateQueries({ queryKey: ['absences'] });
      toast.showSuccess(t.attendance.markedPresent);
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.attendance.errorMarkPresent)),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = personnelList ?? [];
    if (!q) return list;
    return list.filter((p) => personnelName(p).toLowerCase().includes(q));
  }, [personnelList, search]);

  const absentCount = filtered.filter((p) => absenceCoveringDate(p.absences, date)).length;
  const presentCount = filtered.length - absentCount;

  return (
    <div>
      <div className="page__header">
        <h1>{t.attendance.title}</h1>
        <p className="page__subtitle">{t.attendance.subtitle}</p>
      </div>

      <div className="toolbar">
        <input
          className="toolbar__search"
          type="search"
          placeholder={t.attendance.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <input
          type="date"
          className="toolbar__search"
          style={{ maxWidth: 180 }}
          value={date}
          max={todayIso()}
          onChange={(e) => setDate(e.target.value)}
          aria-label={t.attendance.dateLabel}
        />
      </div>

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-tile">
          <span className="stat-tile__label">{t.attendance.present}</span>
          <span className="stat-tile__value">{presentCount}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-tile__label">{t.attendance.absent}</span>
          <span className="stat-tile__value">{absentCount}</span>
        </div>
      </div>

      {isLoading && <TableSkeleton columns={4} />}
      {isError && <p className="jobs__status">{t.attendance.errorLoad}</p>}
      {!isLoading && !isError && filtered.length === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">{t.common.noRecords}</span>
          <p>{search ? t.attendance.noneMatchSearch : t.attendance.noneYet}</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.attendance.columnEmployee}</th>
                <th>{t.attendance.columnMatricule}</th>
                <th>{t.attendance.columnContract}</th>
                <th>{t.attendance.columnStatus}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const covering = absenceCoveringDate(p.absences, date);
                const isAbsent = !!covering;
                const isRangeEntry = isAbsent && !covering!.dateAbsence && !!covering!.startDate;

                return (
                  <tr key={p.idPersonnel}>
                    <td data-label={t.attendance.columnEmployee}>{personnelName(p)}</td>
                    <td data-label={t.attendance.columnMatricule}>{p.matricule || '—'}</td>
                    <td data-label={t.attendance.columnContract}>
                      {p.contract ? (
                        <span className="badge badge--soft">
                          {p.contract.typeContrat ? t.contractTypes[p.contract.typeContrat] : '—'}
                        </span>
                      ) : (
                        <span className="badge badge--muted">{t.attendance.none}</span>
                      )}
                    </td>
                    <td data-label={t.attendance.columnStatus}>
                      <div className="attendance-toggle">
                        <button
                          type="button"
                          className={`attendance-toggle__btn attendance-toggle__btn--present${!isAbsent ? ' is-active' : ''}`}
                          disabled={!isAbsent || isRangeEntry || markPresentMutation.isPending}
                          onClick={() => covering && markPresentMutation.mutate(covering.idAbsence)}
                        >
                          <Check size={14} aria-hidden="true" />
                          {t.attendance.present}
                        </button>
                        <button
                          type="button"
                          className={`attendance-toggle__btn attendance-toggle__btn--absent${isAbsent ? ' is-active' : ''}`}
                          disabled={isAbsent || markAbsentMutation.isPending}
                          onClick={() => markAbsentMutation.mutate(p.idPersonnel)}
                        >
                          <X size={14} aria-hidden="true" />
                          {t.attendance.absent}
                        </button>
                        {isRangeEntry && (
                          <span className="badge badge--muted" title={t.attendance.manageFromAbsences}>
                            {t.attendance.onLeave}
                          </span>
                        )}
                      </div>
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

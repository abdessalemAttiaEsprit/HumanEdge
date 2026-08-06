import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { personnelApi } from '@/api/personnel';
import { absencesApi } from '@/api/absences';
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
function absenceCoveringDate(absences: Absence[] | undefined, dateIso: string): Absence | undefined {
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
      toast.showSuccess('Marked absent.');
    },
    onError: (err) => toast.showError(getErrorMessage(err, 'Unable to mark this employee absent')),
  });

  const markPresentMutation = useMutation({
    mutationFn: (absenceId: number) => absencesApi.remove(absenceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personnel'] });
      queryClient.invalidateQueries({ queryKey: ['absences'] });
      toast.showSuccess('Marked present.');
    },
    onError: (err) => toast.showError(getErrorMessage(err, 'Unable to mark this employee present')),
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
        <h1>Attendance</h1>
        <p className="page__subtitle">
          Mark each employee present or absent for a chosen day, at a glance. Marking someone
          absent records an unjustified absence for that date, which counts against their
          leave quota and next payroll deduction just like an entry from the Absences page.
        </p>
      </div>

      <div className="toolbar">
        <input
          className="toolbar__search"
          type="search"
          placeholder="Search by employee…"
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
          aria-label="Date"
        />
      </div>

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-tile">
          <span className="stat-tile__label">Present</span>
          <span className="stat-tile__value">{presentCount}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-tile__label">Absent</span>
          <span className="stat-tile__value">{absentCount}</span>
        </div>
      </div>

      {isLoading && <TableSkeleton columns={4} />}
      {isError && <p className="jobs__status">Unable to load personnel.</p>}
      {!isLoading && !isError && filtered.length === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">No records</span>
          <p>{search ? 'No employees match your search.' : 'No personnel records yet.'}</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Matricule</th>
                <th>Contract</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const covering = absenceCoveringDate(p.absences, date);
                const isAbsent = !!covering;
                const isRangeEntry = isAbsent && !covering!.dateAbsence && !!covering!.startDate;

                return (
                  <tr key={p.idPersonnel}>
                    <td data-label="Employee">{personnelName(p)}</td>
                    <td data-label="Matricule">{p.matricule || '—'}</td>
                    <td data-label="Contract">
                      {p.contract ? (
                        <span className="badge badge--soft">{p.contract.typeContrat}</span>
                      ) : (
                        <span className="badge badge--muted">None</span>
                      )}
                    </td>
                    <td data-label="Status">
                      <div className="attendance-toggle">
                        <button
                          type="button"
                          className={`attendance-toggle__btn attendance-toggle__btn--present${!isAbsent ? ' is-active' : ''}`}
                          disabled={!isAbsent || isRangeEntry || markPresentMutation.isPending}
                          onClick={() => covering && markPresentMutation.mutate(covering.idAbsence)}
                        >
                          <Check size={14} aria-hidden="true" />
                          Present
                        </button>
                        <button
                          type="button"
                          className={`attendance-toggle__btn attendance-toggle__btn--absent${isAbsent ? ' is-active' : ''}`}
                          disabled={isAbsent || markAbsentMutation.isPending}
                          onClick={() => markAbsentMutation.mutate(p.idPersonnel)}
                        >
                          <X size={14} aria-hidden="true" />
                          Absent
                        </button>
                        {isRangeEntry && (
                          <span className="badge badge--muted" title="Manage from the Absences page">
                            On leave
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

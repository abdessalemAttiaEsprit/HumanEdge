import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/i18n/useLanguage';
import type { Absence, Personnel } from '@/types';

interface AbsenceCalendarProps {
  absences: Absence[];
  personnelByAbsenceId: Map<number, Personnel>;
}

const MAX_VISIBLE_PER_DAY = 3;

function personnelName(p?: Personnel): string {
  if (!p?.user) return '—';
  return `${p.user.firstname} ${p.user.lastname}`;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Every calendar day a (single-day or ranged) absence covers, as 'YYYY-MM-DD' keys. */
function absenceDateKeys(a: Absence): string[] {
  if (a.dateAbsence) return [a.dateAbsence.slice(0, 10)];
  if (!a.startDate || !a.endDate) return [];
  const keys: string[] = [];
  const cur = new Date(a.startDate);
  const end = new Date(a.endDate);
  while (cur <= end) {
    keys.push(toDateKey(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return keys;
}

function statusChipClass(status?: string): string {
  if (status === 'APPROVED') return 'interview-chip--success';
  if (status === 'PENDING') return '';
  return '';
}

/** Month calendar showing employee absences as chips on each day they cover — read-only overview, meant to sit below the absences table. */
export function AbsenceCalendar({ absences, personnelByAbsenceId }: AbsenceCalendarProps) {
  const { t } = useLanguage();
  const [viewDate, setViewDate] = useState(() => startOfMonth(new Date()));

  // Un congé rejeté n'a pas eu lieu : ne l'affiche pas sur le calendrier.
  const activeAbsences = useMemo(() => absences.filter((a) => (a.status ?? 'APPROVED') !== 'REJECTED'), [absences]);

  const byDate = useMemo(() => {
    const map = new Map<string, Absence[]>();
    for (const a of activeAbsences) {
      for (const key of absenceDateKeys(a)) {
        const list = map.get(key) ?? [];
        list.push(a);
        map.set(key, list);
      }
    }
    return map;
  }, [activeAbsences]);

  const cells = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const firstWeekday = (firstOfMonth.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - firstWeekday);
    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      return date;
    });
  }, [viewDate]);

  const monthLabel = viewDate.toLocaleDateString(t.interviewCalendar.locale, { month: 'long', year: 'numeric' });
  const todayKey = toDateKey(new Date());
  const currentMonth = viewDate.getMonth();

  return (
    <div className="calendar">
      <div className="calendar__header">
        <h3>{monthLabel}</h3>
        <div className="calendar__nav">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            aria-label={t.interviewCalendar.previousMonth}
            title={t.interviewCalendar.previousMonth}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setViewDate(startOfMonth(new Date()))}>
            {t.interviewCalendar.today}
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
            aria-label={t.interviewCalendar.nextMonth}
            title={t.interviewCalendar.nextMonth}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="calendar__weekdays">
        {t.interviewCalendar.weekdays.map((d) => (
          <div key={d} className="calendar__weekday">
            {d}
          </div>
        ))}
      </div>

      <div className="calendar__grid">
        {cells.map((date) => {
          const key = toDateKey(date);
          const dayAbsences = byDate.get(key) ?? [];
          const isOtherMonth = date.getMonth() !== currentMonth;
          const isToday = key === todayKey;
          return (
            <div
              key={key}
              className={`calendar__cell${isOtherMonth ? ' calendar__cell--muted' : ''}${isToday ? ' calendar__cell--today' : ''}`}
            >
              <span className="calendar__date">{date.getDate()}</span>
              {dayAbsences.length > 0 && (
                <div className="calendar__events">
                  {dayAbsences.slice(0, MAX_VISIBLE_PER_DAY).map((a) => {
                    const employee = personnelByAbsenceId.get(a.idAbsence);
                    return (
                      <span
                        key={a.idAbsence}
                        className={`interview-chip ${statusChipClass(a.status)}`}
                        title={`${personnelName(employee)}${employee?.department ? ` — ${employee.department}` : ''}`}
                      >
                        {personnelName(employee)}
                      </span>
                    );
                  })}
                  {dayAbsences.length > MAX_VISIBLE_PER_DAY && (
                    <span className="calendar__more">{t.interviewCalendar.more(dayAbsences.length - MAX_VISIBLE_PER_DAY)}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

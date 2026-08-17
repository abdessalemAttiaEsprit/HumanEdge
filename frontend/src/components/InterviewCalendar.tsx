import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/i18n/useLanguage';
import type { Interview } from '@/types';

interface InterviewCalendarProps {
  interviews: Interview[];
}

const MAX_VISIBLE_PER_DAY = 3;

function candidateName(iv: Interview): string {
  const c = iv.candidate;
  if (!c) return '—';
  return [c.firstName, c.lastName].filter(Boolean).join(' ') || '—';
}

function statusChipClass(status?: string): string {
  if (status === 'COMPLETED') return 'interview-chip--success';
  if (status === 'CANCELLED') return 'interview-chip--danger';
  return '';
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Month calendar showing scheduled interviews as chips on their day — read-only overview, meant to sit below the interviews table. */
export function InterviewCalendar({ interviews }: InterviewCalendarProps) {
  const { t } = useLanguage();
  const [viewDate, setViewDate] = useState(() => startOfMonth(new Date()));

  const byDate = useMemo(() => {
    const map = new Map<string, Interview[]>();
    for (const iv of interviews) {
      if (!iv.interviewDate) continue;
      const key = iv.interviewDate.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(iv);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.interviewDate ?? '').localeCompare(b.interviewDate ?? ''));
    }
    return map;
  }, [interviews]);

  const cells = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    // getDay(): 0=Sun..6=Sat — shift so the grid starts on Monday.
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
          const dayInterviews = byDate.get(key) ?? [];
          const isOtherMonth = date.getMonth() !== currentMonth;
          const isToday = key === todayKey;
          return (
            <div
              key={key}
              className={`calendar__cell${isOtherMonth ? ' calendar__cell--muted' : ''}${isToday ? ' calendar__cell--today' : ''}`}
            >
              <span className="calendar__date">{date.getDate()}</span>
              {dayInterviews.length > 0 && (
                <div className="calendar__events">
                  {dayInterviews.slice(0, MAX_VISIBLE_PER_DAY).map((iv) => (
                    <span
                      key={iv.id}
                      className={`interview-chip ${statusChipClass(iv.status)}`}
                      title={`${candidateName(iv)} — ${iv.job?.title ?? t.interviewCalendar.noJob} — ${iv.interviewLocation ?? t.interviewCalendar.noLocation}`}
                    >
                      {iv.interviewDate?.slice(11, 16)} {candidateName(iv)}
                    </span>
                  ))}
                  {dayInterviews.length > MAX_VISIBLE_PER_DAY && (
                    <span className="calendar__more">{t.interviewCalendar.more(dayInterviews.length - MAX_VISIBLE_PER_DAY)}</span>
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

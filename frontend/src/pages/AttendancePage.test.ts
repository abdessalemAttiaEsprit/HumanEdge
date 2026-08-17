import { describe, expect, it } from 'vitest';
import { absenceCoveringDate } from './AttendancePage';
import type { Absence } from '@/types';

describe('absenceCoveringDate', () => {
  it('returns undefined when there is no absence list', () => {
    expect(absenceCoveringDate(undefined, '2026-03-10')).toBeUndefined();
  });

  it('matches a single-day absence on the exact date', () => {
    const absences: Absence[] = [{ idAbsence: 1, dateAbsence: '2026-03-10' }];

    expect(absenceCoveringDate(absences, '2026-03-10')?.idAbsence).toBe(1);
    expect(absenceCoveringDate(absences, '2026-03-11')).toBeUndefined();
  });

  it('matches a multi-day range absence for any date inside it, inclusive of both bounds', () => {
    const absences: Absence[] = [{ idAbsence: 2, startDate: '2026-03-10', endDate: '2026-03-14' }];

    expect(absenceCoveringDate(absences, '2026-03-10')?.idAbsence).toBe(2); // borne basse
    expect(absenceCoveringDate(absences, '2026-03-12')?.idAbsence).toBe(2); // au milieu
    expect(absenceCoveringDate(absences, '2026-03-14')?.idAbsence).toBe(2); // borne haute
  });

  it('does not match a date outside the range', () => {
    const absences: Absence[] = [{ idAbsence: 2, startDate: '2026-03-10', endDate: '2026-03-14' }];

    expect(absenceCoveringDate(absences, '2026-03-09')).toBeUndefined();
    expect(absenceCoveringDate(absences, '2026-03-15')).toBeUndefined();
  });

  it('ignores an absence with neither a single date nor a full range', () => {
    const absences: Absence[] = [{ idAbsence: 3 }];

    expect(absenceCoveringDate(absences, '2026-03-10')).toBeUndefined();
  });
});

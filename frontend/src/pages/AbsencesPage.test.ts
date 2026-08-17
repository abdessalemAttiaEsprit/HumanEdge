import { describe, expect, it } from 'vitest';
import { effectiveStatus } from './AbsencesPage';
import type { Absence } from '@/types';

describe('effectiveStatus', () => {
  it('returns the stored status when present', () => {
    expect(effectiveStatus({ idAbsence: 1, status: 'PENDING' } as Absence)).toBe('PENDING');
    expect(effectiveStatus({ idAbsence: 1, status: 'REJECTED' } as Absence)).toBe('REJECTED');
  });

  it('treats a missing status as APPROVED (records created before this workflow existed)', () => {
    expect(effectiveStatus({ idAbsence: 1 } as Absence)).toBe('APPROVED');
  });
});

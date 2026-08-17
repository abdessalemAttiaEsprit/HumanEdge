import { describe, expect, it } from 'vitest';
import {
  absenceDayCount,
  annualBareme,
  getPaymentSortValue,
  isJustified,
  marginalIrppRate,
  suggestAmounts,
} from './PayrollPage';
import type { Absence, Payment, Personnel } from '@/types';

/**
 * Ce fichier reproduit volontairement certains cas de test de
 * backend/.../SalaryCalculationServiceTest.java : IRPP_BRACKET_CEILINGS/RATES ici est un miroir
 * manuel du barème backend (voir le commentaire dans PayrollPage.tsx), donc les deux doivent
 * produire exactement les mêmes montants pour les mêmes entrées.
 */

describe('annualBareme / marginalIrppRate (miroir du barème IRPP backend)', () => {
  it('applies 0% up to the first bracket ceiling', () => {
    expect(annualBareme(0)).toBe(0);
    expect(annualBareme(5000)).toBe(0);
    expect(marginalIrppRate(5000)).toBe(0);
  });

  it('matches the backend SalaryCalculationServiceTest 26% bracket example', () => {
    // Même revenu annuel imposable que SalaryCalculationServiceTest#computesBreakdownWithoutAbsences...
    expect(annualBareme(9808.56)).toBeCloseTo(1250.2256, 4);
    expect(marginalIrppRate(9808.56)).toBe(0.26);
  });

  it('follows the progressive bracket table at each boundary', () => {
    expect(marginalIrppRate(5000.01)).toBe(0.26);
    expect(marginalIrppRate(20000)).toBe(0.26);
    expect(marginalIrppRate(20000.01)).toBe(0.28);
    expect(marginalIrppRate(30000)).toBe(0.28);
    expect(marginalIrppRate(30000.01)).toBe(0.32);
    expect(marginalIrppRate(50000)).toBe(0.32);
    expect(marginalIrppRate(50000.01)).toBe(0.35);
  });
});

function absence(overrides: Partial<Absence> = {}): Absence {
  return { idAbsence: 1, ...overrides };
}

describe('isJustified', () => {
  it('treats a reason or a justification document as justifying the absence', () => {
    expect(isJustified(absence({ reason: 'Certificat médical' }))).toBe(true);
    expect(isJustified(absence({ justification: 'file.pdf' }))).toBe(true);
  });

  it('treats blank/missing reason and justification as unjustified', () => {
    expect(isJustified(absence())).toBe(false);
    expect(isJustified(absence({ reason: '   ' }))).toBe(false);
  });
});

describe('absenceDayCount', () => {
  it('counts a single-day absence (no range) as 1 day', () => {
    expect(absenceDayCount(absence({ dateAbsence: '2026-03-05' }))).toBe(1);
  });

  it('counts a date range inclusively', () => {
    expect(absenceDayCount(absence({ startDate: '2026-03-05', endDate: '2026-03-07' }))).toBe(3);
  });
});

function personnelWithContract(salaireBase: number, avantages: number, absences: Absence[] = []): Personnel {
  return {
    idPersonnel: 1,
    cin: 'X',
    cnssNumber: 'X',
    rib: 'X',
    contract: { idContract: 1, salaireBase, avantages },
    absences,
  };
}

describe('suggestAmounts', () => {
  it('matches the backend breakdown for a salary with no absences (SalaryCalculationServiceTest parity)', () => {
    const result = suggestAmounts(personnelWithContract(1000, 0), 'JANUARY', 2026);

    expect(result.montantCnss).toBeCloseTo(91.8, 3);
    expect(result.irppRate).toBe(0.26);
    expect(result.montantIrpp).toBeCloseTo(104.185, 3);
    expect(result.payed).toBeCloseTo(804.015, 3);
    expect(result.justifiedDays).toBe(0);
    expect(result.nonJustifiedDays).toBe(0);
  });

  it('only counts absences that fall within the requested month/year', () => {
    const personnel = personnelWithContract(1000, 0, [
      absence({ idAbsence: 1, dateAbsence: '2026-03-05', reason: 'Congé maladie' }), // justifiée, dans le mois
      absence({ idAbsence: 2, dateAbsence: '2026-03-06' }), // non justifiée, dans le mois
      absence({ idAbsence: 3, dateAbsence: '2026-04-01', reason: 'Congé' }), // hors mois -> ignorée
    ]);

    const result = suggestAmounts(personnel, 'MARCH', 2026);

    expect(result.justifiedDays).toBe(1);
    expect(result.nonJustifiedDays).toBe(1);
    expect(result.deduction).toBeGreaterThan(0); // la journée non justifiée doit réduire le net
  });

  it('treats a contract with no salary data as zero rather than throwing', () => {
    const personnel: Personnel = { idPersonnel: 1, cin: 'X', cnssNumber: 'X', rib: 'X' };

    const result = suggestAmounts(personnel, 'JANUARY', 2026);

    expect(result.grossBase).toBe(0);
    expect(result.payed).toBe(0);
  });
});

describe('getPaymentSortValue', () => {
  const payment: Payment = {
    id: 1,
    year: 2026,
    month: 'MARCH',
    paymentDate: '2026-03-28',
    payed: 1200,
    status: 'VALIDATED',
    personnel: {
      idPersonnel: 1,
      cin: 'X',
      cnssNumber: 'X',
      rib: 'X',
      user: { idUser: 1, firstname: 'Jane', lastname: 'Doe', email: 'jane@demo.tn', role: 'EMPLOYE', enabled: true },
    },
  };

  it('extracts each sortable column consistently', () => {
    expect(getPaymentSortValue(payment, 'employee')).toBe('Jane Doe');
    expect(getPaymentSortValue(payment, 'paymentDate')).toBe('2026-03-28');
    expect(getPaymentSortValue(payment, 'netPay')).toBe(1200);
    expect(getPaymentSortValue(payment, 'status')).toBe('VALIDATED');
  });

  it('falls back to a dash for a payment with no linked personnel', () => {
    expect(getPaymentSortValue({ ...payment, personnel: undefined }, 'employee')).toBe('—');
  });
});

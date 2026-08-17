import { describe, expect, it } from 'vitest';
import { navItemsForRole } from './navigation';

/**
 * ADMIN est volontairement cantonné au Dashboard (voir le commentaire dans navigation.ts et
 * App.tsx) : cette restriction est une décision de sécurité/produit facile à casser par
 * inadvertance en ajoutant une nouvelle entrée de nav sans y penser, d'où ce test.
 */
describe('navItemsForRole', () => {
  it('restricts ADMIN to the Dashboard only', () => {
    const items = navItemsForRole('ADMIN');

    expect(items.map((i) => i.label)).toEqual(['Dashboard']);
  });

  it('gives COMPANY access to the operational modules', () => {
    const labels = navItemsForRole('COMPANY').map((i) => i.label);

    expect(labels).toEqual(
      expect.arrayContaining(['Dashboard', 'Personnel', 'Contracts', 'Attendance', 'Absences', 'Payroll']),
    );
  });

  it('never exposes Companies to any role (currently unreachable by design)', () => {
    (['ADMIN', 'COMPANY', 'EMPLOYE', 'GUEST'] as const).forEach((role) => {
      expect(navItemsForRole(role).some((i) => i.path === '/companies')).toBe(false);
    });
  });

  it('restricts EMPLOYE to self-service modules', () => {
    const labels = navItemsForRole('EMPLOYE').map((i) => i.label);

    expect(labels).toEqual(expect.arrayContaining(['Dashboard', 'Absences', 'Payroll', 'Job Postings']));
    expect(labels).not.toContain('Personnel');
    expect(labels).not.toContain('Attendance');
  });

  it('restricts GUEST to candidate-facing modules', () => {
    const labels = navItemsForRole('GUEST').map((i) => i.label);

    expect(labels).toEqual(expect.arrayContaining(['Dashboard', 'Job Postings', 'Candidates', 'Applications', 'Interviews']));
    expect(labels).not.toContain('Payroll');
  });
});

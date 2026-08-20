import { describe, expect, it } from 'vitest';
import { navItemsForRole } from './navigation';

/**
 * ADMIN n'a accès qu'aux modules plateforme (Dashboard + Companies), jamais aux modules
 * opérationnels d'une entreprise (Personnel, Contracts, ...) : cette restriction est une
 * décision de sécurité/produit facile à casser par inadvertance en ajoutant une nouvelle
 * entrée de nav sans y penser, d'où ce test.
 */
describe('navItemsForRole', () => {
  it('restricts ADMIN to platform-wide modules only', () => {
    const items = navItemsForRole('ADMIN');

    expect(items.map((i) => i.label)).toEqual(['Dashboard', 'Companies']);
  });

  it('gives COMPANY access to the operational modules', () => {
    const labels = navItemsForRole('COMPANY').map((i) => i.label);

    expect(labels).toEqual(
      expect.arrayContaining(['Dashboard', 'Personnel', 'Contracts', 'Attendance', 'Absences', 'Payroll']),
    );
  });

  it('exposes Companies to ADMIN only', () => {
    expect(navItemsForRole('ADMIN').some((i) => i.path === '/companies')).toBe(true);
    (['COMPANY', 'EMPLOYE', 'GUEST'] as const).forEach((role) => {
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

import type { Role } from '@/types';

export interface NavItem {
  label: string;
  path: string;
  /** Roles allowed to see/reach this entry. */
  roles: Role[];
  icon: string; // lightweight emoji, swappable for an icon library later
}

// Single source of truth: feeds both the sidebar and the module routes.
export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', roles: ['ADMIN', 'COMPANY', 'EMPLOYE', 'GUEST'], icon: '🏠' },
  { label: 'Companies', path: '/companies', roles: ['ADMIN'], icon: '🏢' },
  { label: 'Personnel', path: '/personnel', roles: ['ADMIN', 'COMPANY'], icon: '👥' },
  { label: 'Contracts', path: '/contracts', roles: ['ADMIN', 'COMPANY'], icon: '📄' },
  { label: 'Absences', path: '/absences', roles: ['ADMIN', 'COMPANY', 'EMPLOYE'], icon: '🗓️' },
  { label: 'Payroll', path: '/payments', roles: ['ADMIN', 'COMPANY', 'EMPLOYE'], icon: '💰' },
  { label: 'Job Postings', path: '/jobs', roles: ['ADMIN', 'COMPANY', 'EMPLOYE', 'GUEST'], icon: '📢' },
  { label: 'Candidates', path: '/candidates', roles: ['ADMIN', 'COMPANY', 'GUEST'], icon: '🧑‍💼' },
  { label: 'Applications', path: '/applications', roles: ['ADMIN', 'COMPANY', 'GUEST'], icon: '📨' },
  { label: 'Interviews', path: '/interviews', roles: ['ADMIN', 'COMPANY', 'GUEST'], icon: '💬' },
];

export function navItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

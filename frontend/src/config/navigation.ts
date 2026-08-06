import type { Role } from '@/types';

export interface NavItem {
  label: string;
  path: string;
  /** Roles allowed to see/reach this entry. */
  roles: Role[];
  icon: string; // lightweight emoji - used on the dashboard module cards / placeholder pages
  /** Custom icon shown in the bottom nav (see public/assets/nav-icons) - falls back to `icon` if unset. */
  iconSrc?: string;
}

// Single source of truth: feeds both the bottom nav and the module routes.
//
// ADMIN est volontairement cantonné au Dashboard pour l'instant (voir App.tsx) : toutes
// les autres entrées ont perdu 'ADMIN' de leur liste de rôles, y compris Companies qui lui
// était jusque-là exclusivement réservée (donc plus aucun rôle ne peut l'atteindre tant que
// ce n'est pas rouvert explicitement). Le Dashboard ADMIN affiche déjà la liste des
// entreprises en lecture seule, donc la visibilité plateforme reste disponible.
export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', roles: ['ADMIN', 'COMPANY', 'EMPLOYE', 'GUEST'], icon: '🏠', iconSrc: '/assets/nav-icons/dashboard.png' },
  { label: 'Companies', path: '/companies', roles: [], icon: '🏢' },
  { label: 'Personnel', path: '/personnel', roles: ['COMPANY'], icon: '👥', iconSrc: '/assets/nav-icons/personnel.png' },
  { label: 'Contracts', path: '/contracts', roles: ['COMPANY'], icon: '📄', iconSrc: '/assets/nav-icons/contracts.png' },
  { label: 'Attendance', path: '/attendance', roles: ['COMPANY'], icon: '🕒', iconSrc: '/assets/nav-icons/attendance.png' },
  { label: 'Absences', path: '/absences', roles: ['COMPANY', 'EMPLOYE'], icon: '🗓️', iconSrc: '/assets/nav-icons/absences.png' },
  { label: 'Payroll', path: '/payments', roles: ['COMPANY', 'EMPLOYE'], icon: '💰', iconSrc: '/assets/nav-icons/payroll.png' },
  { label: 'Job Postings', path: '/jobs', roles: ['COMPANY', 'EMPLOYE', 'GUEST'], icon: '📢', iconSrc: '/assets/nav-icons/job-postings.png' },
  { label: 'Candidates', path: '/candidates', roles: ['GUEST'], icon: '🧑‍💼', iconSrc: '/assets/nav-icons/candidates.png' },
  { label: 'Applications', path: '/applications', roles: ['COMPANY', 'GUEST'], icon: '📨', iconSrc: '/assets/nav-icons/applications.png' },
  { label: 'Interviews', path: '/interviews', roles: ['COMPANY', 'GUEST'], icon: '💬', iconSrc: '/assets/nav-icons/interviews.png' },
];

export function navItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

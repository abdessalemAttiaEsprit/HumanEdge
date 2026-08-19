import type { Role } from '@/types';
import type { Messages } from '@/i18n/en';

export interface NavItem {
  /** English fallback (also what non-translated call sites/tests match against). */
  label: string;
  /** Looked up as t.nav[key] wherever the label is actually rendered — see Layout/DashboardPage/App. */
  key: keyof Messages['nav'];
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
  { label: 'Dashboard', key: 'dashboard', path: '/dashboard', roles: ['ADMIN', 'COMPANY', 'EMPLOYE', 'GUEST'], icon: '🏠', iconSrc: '/assets/nav-icons/dashboard.png' },
  { label: 'Companies', key: 'companies', path: '/companies', roles: [], icon: '🏢' },
  { label: 'Personnel', key: 'personnel', path: '/personnel', roles: ['COMPANY'], icon: '👥', iconSrc: '/assets/nav-icons/personnel.png' },
  { label: 'Contracts', key: 'contracts', path: '/contracts', roles: ['COMPANY'], icon: '📄', iconSrc: '/assets/nav-icons/contracts.png' },
  { label: 'Attendance', key: 'attendance', path: '/attendance', roles: ['COMPANY'], icon: '🕒', iconSrc: '/assets/nav-icons/attendance.png' },
  { label: 'Absences', key: 'absences', path: '/absences', roles: ['COMPANY', 'EMPLOYE'], icon: '🗓️', iconSrc: '/assets/nav-icons/absences.png' },
  { label: 'Payroll', key: 'payroll', path: '/payments', roles: ['COMPANY', 'EMPLOYE'], icon: '💰', iconSrc: '/assets/nav-icons/payroll.png' },
  { label: 'Tasks', key: 'tasks', path: '/tasks', roles: ['COMPANY', 'EMPLOYE'], icon: '✅', iconSrc: '/assets/nav-icons/tasks.png' },
  { label: 'Skills', key: 'skills', path: '/skills', roles: ['EMPLOYE'], icon: '🎓', iconSrc: '/assets/nav-icons/diplome.svg' },
  { label: 'Skills Validation', key: 'skillsValidation', path: '/skills/validation', roles: ['COMPANY'], icon: '🏅', iconSrc: '/assets/nav-icons/diplome.svg' },
  { label: 'Messages', key: 'messages', path: '/messages', roles: ['COMPANY'], icon: '✉️', iconSrc: '/assets/nav-icons/messages.png' },
  { label: 'Job Postings', key: 'jobPostings', path: '/jobs', roles: ['COMPANY', 'EMPLOYE', 'GUEST'], icon: '📢', iconSrc: '/assets/nav-icons/job-postings.png' },
  { label: 'Candidates', key: 'candidates', path: '/candidates', roles: ['GUEST'], icon: '🧑‍💼', iconSrc: '/assets/nav-icons/candidates.png' },
  { label: 'Applications', key: 'applications', path: '/applications', roles: ['COMPANY', 'GUEST'], icon: '📨', iconSrc: '/assets/nav-icons/applications.png' },
  { label: 'Interviews', key: 'interviews', path: '/interviews', roles: ['COMPANY', 'GUEST'], icon: '💬', iconSrc: '/assets/nav-icons/interviews.png' },
];

export function navItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

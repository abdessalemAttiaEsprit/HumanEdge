import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { navItemsForRole } from '@/config/navigation';
import { fileUrl } from '@/api/axios';
import { useTheme } from '@/lib/useTheme';
import { NotificationBell } from './NotificationBell';
import { ThemeSwitch } from './ThemeSwitch';

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrator',
  COMPANY: 'Company',
  EMPLOYE: 'Employee',
  GUEST: 'Candidate',
};

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  if (!user) return null;

  const items = navItemsForRole(user.role);
  const avatar = fileUrl(user.img);
  const initials = `${user.firstname?.[0] ?? ''}${user.lastname?.[0] ?? ''}`.toUpperCase();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app-shell">
      <div className="app-main">
        <header className="topbar">
          <div className="topbar__brand">
            <img className="topbar__brand-logo" src="/assets/favicon.png" alt="HumanEdge" />
          </div>
          <div className="topbar__role">{ROLE_LABEL[user.role] ?? user.role}</div>
          <div className="topbar__user">
            <ThemeSwitch theme={theme} onToggle={toggleTheme} />
            <NotificationBell />
            <Link to="/profile" className="topbar__user-link" title="My profile">
              {avatar ? (
                <img className="avatar" src={avatar} alt={user.firstname} />
              ) : (
                <span className="avatar avatar--initials">{initials || '?'}</span>
              )}
              <div className="topbar__identity">
                <strong>
                  {user.firstname} {user.lastname}
                </strong>
                <small>{user.email}</small>
              </div>
            </Link>
            <button className="btn btn--ghost" onClick={handleLogout}>
              <LogOut size={16} aria-hidden="true" />
              Log out
            </button>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>

      <nav className="bottom-nav">
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/dashboard'}
            className={({ isActive }) => `bottom-nav__link${isActive ? ' bottom-nav__link--active' : ''}`}
          >
            <span className="bottom-nav__icon">
              {item.iconSrc ? <img src={item.iconSrc} alt="" aria-hidden="true" /> : item.icon}
            </span>
            <span className="bottom-nav__label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

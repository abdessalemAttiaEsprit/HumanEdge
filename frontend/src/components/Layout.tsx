import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import { navItemsForRole } from '@/config/navigation';
import { fileUrl } from '@/api/axios';

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrator',
  COMPANY: 'Company',
  EMPLOYE: 'Employee',
  GUEST: 'Candidate',
};

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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
      <aside className="sidebar">
        <div className="sidebar__brand">
          <img className="sidebar__brand-full" src="/assets/logo.png" alt="HumanEdge" />
          <img className="sidebar__brand-icon" src="/assets/favicon.png" alt="HumanEdge" />
        </div>
        <nav className="sidebar__nav">
          {items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/dashboard'}
              className={({ isActive }) => `nav-link${isActive ? ' nav-link--active' : ''}`}
            >
              <span className="nav-link__icon">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar__role">{ROLE_LABEL[user.role] ?? user.role}</div>
          <div className="topbar__user">
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
              Log out
            </button>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

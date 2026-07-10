import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

interface AuthLayoutProps {
  children: ReactNode;
  /** Optional card width override (register forms need more room than login). */
  wide?: boolean;
}

/** Shared split-screen layout for all auth pages: form on the left, photo on the right. */
export function AuthLayout({ children, wide }: AuthLayoutProps) {
  return (
    <div className="auth-shell">
      <div className="auth-shell__form">
        <Link to="/" className="auth-shell__brand">
          <img src="/assets/logo.png" alt="HumanEdge" />
        </Link>
        <div className={`auth-shell__form-inner${wide ? ' auth-shell__form-inner--wide' : ''}`}>
          {children}
        </div>
      </div>

      <div className="auth-shell__visual" aria-hidden="true">
        <img src="/assets/auth-illustration.jpg" alt="" />
        <div className="auth-shell__visual-caption">
          <h2>Run HR without the busywork</h2>
          <p>Contracts, payroll, absences and AI-assisted hiring — all in one place.</p>
        </div>
      </div>
    </div>
  );
}

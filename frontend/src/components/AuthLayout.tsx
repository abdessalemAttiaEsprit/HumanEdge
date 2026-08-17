import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useLanguage } from '@/i18n/useLanguage';
import { LanguageSwitch } from './LanguageSwitch';

interface AuthLayoutProps {
  children: ReactNode;
  /** Optional card width override (register forms need more room than login). */
  wide?: boolean;
}

/** Shared split-screen layout for all auth pages: form on the left, photo on the right. */
export function AuthLayout({ children, wide }: AuthLayoutProps) {
  const { lang, setLang, t } = useLanguage();
  return (
    <div className="auth-shell">
      <div className="auth-shell__form">
        <div className="auth-shell__topbar">
          <Link to="/" className="auth-shell__brand">
            <img src="/assets/logo.png" alt="HumanEdge" />
          </Link>
          <LanguageSwitch lang={lang} onChange={setLang} />
        </div>
        <div className={`auth-shell__form-inner${wide ? ' auth-shell__form-inner--wide' : ''}`}>
          {children}
        </div>
      </div>

      <div className="auth-shell__visual" aria-hidden="true">
        <img src="/assets/auth-illustration.jpg" alt="" />
        <div className="auth-shell__visual-caption">
          <h2>{t.authLayout.heading}</h2>
          <p>{t.authLayout.caption}</p>
        </div>
      </div>
    </div>
  );
}

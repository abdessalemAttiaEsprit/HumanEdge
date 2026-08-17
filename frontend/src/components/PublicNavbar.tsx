import { Link } from 'react-router-dom';
import { useLanguage } from '@/i18n/useLanguage';
import { LanguageSwitch } from './LanguageSwitch';

export function PublicNavbar() {
  const { lang, setLang, t } = useLanguage();
  return (
    <header className="public-nav">
      <div className="public-nav__inner">
        <Link to="/" className="public-nav__brand">
          <img src="/assets/logo.png" alt="HumanEdge" />
        </Link>

        <nav className="public-nav__links">
          <a href="#why">{t.publicNav.whyUs}</a>
          <a href="#jobs">{t.publicNav.jobOpenings}</a>
        </nav>

        <LanguageSwitch lang={lang} onChange={setLang} />

        <Link to="/login" className="btn btn--primary">
          {t.publicNav.signIn}
        </Link>
      </div>
    </header>
  );
}

import { Link } from 'react-router-dom';
import { useLanguage } from '@/i18n/useLanguage';

export function NotFoundPage() {
  const { t } = useLanguage();
  return (
    <div className="status-page">
      <div className="status-page__code">404</div>
      <h1>{t.statusPages.notFoundTitle}</h1>
      <p>{t.statusPages.notFoundDesc}</p>
      <Link className="btn btn--primary" to="/">
        {t.statusPages.backToHome}
      </Link>
    </div>
  );
}

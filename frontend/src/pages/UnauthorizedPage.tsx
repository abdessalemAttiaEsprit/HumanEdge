import { Link } from 'react-router-dom';
import { useLanguage } from '@/i18n/useLanguage';

export function UnauthorizedPage() {
  const { t } = useLanguage();
  return (
    <div className="status-page">
      <div className="status-page__code">403</div>
      <h1>{t.statusPages.unauthorizedTitle}</h1>
      <p>{t.statusPages.unauthorizedDesc}</p>
      <Link className="btn btn--primary" to="/dashboard">
        {t.statusPages.backToDashboard}
      </Link>
    </div>
  );
}

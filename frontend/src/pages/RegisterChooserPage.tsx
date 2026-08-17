import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import { useLanguage } from '@/i18n/useLanguage';
import { AuthLayout } from '@/components/AuthLayout';

export function RegisterChooserPage() {
  const { isAuthenticated } = useAuth();
  const { t } = useLanguage();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <AuthLayout>
      <h1>{t.registerChooser.title}</h1>
      <p className="auth-shell__subtitle">{t.registerChooser.subtitle}</p>

      <div className="account-choice">
        <Link to="/register/company" className="account-choice__card">
          <span className="account-choice__icon">🏢</span>
          <span className="account-choice__title">{t.registerChooser.companyTitle}</span>
          <span className="account-choice__desc">{t.registerChooser.companyDesc}</span>
        </Link>

        <Link to="/register/candidate" className="account-choice__card">
          <span className="account-choice__icon">🧑‍💼</span>
          <span className="account-choice__title">{t.registerChooser.candidateTitle}</span>
          <span className="account-choice__desc">{t.registerChooser.candidateDesc}</span>
        </Link>
      </div>

      <p className="auth-shell__footer">
        {t.registerChooser.alreadyHaveAccount} <Link to="/login">{t.registerChooser.signIn}</Link>
      </p>
    </AuthLayout>
  );
}

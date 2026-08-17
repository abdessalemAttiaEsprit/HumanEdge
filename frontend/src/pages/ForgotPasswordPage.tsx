import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '@/api/auth';
import { useLanguage } from '@/i18n/useLanguage';
import { AuthLayout } from '@/components/AuthLayout';
import { getErrorMessage } from '@/lib/errors';

export function ForgotPasswordPage() {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // The backend always responds the same way regardless of whether the account exists
  // (see PasswordResetService) - "sent" here just means the request completed, not that
  // an email necessarily went out.
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authApi.forgotPassword({ email });
      setSent(true);
    } catch (err) {
      setError(getErrorMessage(err, t.forgotPassword.errorSend));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout>
        <h1>{t.forgotPassword.checkEmail}</h1>
        <p className="auth-shell__subtitle">
          {t.forgotPassword.sentPrefix} <strong>{email}</strong>, {t.forgotPassword.sentSuffix}
        </p>
        <p className="auth-shell__footer">
          <Link to="/login">{t.forgotPassword.backToSignIn}</Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit}>
        <h1>{t.forgotPassword.title}</h1>
        <p className="auth-shell__subtitle">{t.forgotPassword.subtitle}</p>

        {error && <div className="alert alert--error">{error}</div>}

        <div className="auth-fields">
          <label className="field">
            <span>{t.forgotPassword.email}</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
          </label>
        </div>

        <button className="btn btn--primary btn--block" type="submit" disabled={loading}>
          {loading ? t.forgotPassword.sending : t.forgotPassword.sendResetLink}
        </button>

        <p className="auth-shell__footer">
          <Link to="/login">{t.forgotPassword.backToSignIn}</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

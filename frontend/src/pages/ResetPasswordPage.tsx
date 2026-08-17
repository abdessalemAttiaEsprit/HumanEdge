import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '@/api/auth';
import { useLanguage } from '@/i18n/useLanguage';
import { AuthLayout } from '@/components/AuthLayout';
import { getErrorMessage } from '@/lib/errors';

export function ResetPasswordPage() {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <AuthLayout>
        <h1>{t.resetPassword.invalidLink}</h1>
        <p className="auth-shell__subtitle">{t.resetPassword.invalidLinkDesc}</p>
        <p className="auth-shell__footer">
          <Link to="/forgot-password">{t.resetPassword.requestNewLink}</Link>
        </p>
      </AuthLayout>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError(t.resetPassword.passwordsMismatch);
      return;
    }

    setLoading(true);
    try {
      await authApi.resetPassword({ token, newPassword });
      setDone(true);
    } catch (err) {
      setError(getErrorMessage(err, t.resetPassword.errorReset));
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthLayout>
        <h1>{t.resetPassword.passwordUpdated}</h1>
        <p className="auth-shell__subtitle">{t.resetPassword.passwordUpdatedDesc}</p>
        <p className="auth-shell__footer">
          <Link to="/login">{t.resetPassword.goToSignIn}</Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit}>
        <h1>{t.resetPassword.title}</h1>

        {error && <div className="alert alert--error">{error}</div>}

        <div className="auth-fields">
          <label className="field">
            <span>{t.resetPassword.newPassword}</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              minLength={8}
              required
              autoFocus
            />
          </label>

          <label className="field">
            <span>{t.resetPassword.confirmPassword}</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              minLength={8}
              required
            />
          </label>
        </div>

        <button className="btn btn--primary btn--block" type="submit" disabled={loading}>
          {loading ? t.resetPassword.updating : t.resetPassword.updatePassword}
        </button>
      </form>
    </AuthLayout>
  );
}

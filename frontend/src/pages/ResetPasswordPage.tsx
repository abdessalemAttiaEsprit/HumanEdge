import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '@/api/auth';
import { AuthLayout } from '@/components/AuthLayout';
import { getErrorMessage } from '@/lib/errors';

export function ResetPasswordPage() {
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
        <h1>Invalid link</h1>
        <p className="auth-shell__subtitle">
          This password reset link is missing its token. Request a new one below.
        </p>
        <p className="auth-shell__footer">
          <Link to="/forgot-password">Request a new link</Link>
        </p>
      </AuthLayout>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await authApi.resetPassword({ token, newPassword });
      setDone(true);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to reset the password'));
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthLayout>
        <h1>Password updated</h1>
        <p className="auth-shell__subtitle">You can now sign in with your new password.</p>
        <p className="auth-shell__footer">
          <Link to="/login">Go to sign in</Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit}>
        <h1>Choose a new password</h1>

        {error && <div className="alert alert--error">{error}</div>}

        <div className="auth-fields">
          <label className="field">
            <span>New password</span>
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
            <span>Confirm password</span>
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
          {loading ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </AuthLayout>
  );
}

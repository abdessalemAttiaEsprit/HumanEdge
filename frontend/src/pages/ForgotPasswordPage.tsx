import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '@/api/auth';
import { AuthLayout } from '@/components/AuthLayout';
import { getErrorMessage } from '@/lib/errors';

export function ForgotPasswordPage() {
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
      setError(getErrorMessage(err, 'Unable to send the reset link'));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout>
        <h1>Check your email</h1>
        <p className="auth-shell__subtitle">
          If an account exists for <strong>{email}</strong>, we&apos;ve sent a link to reset your
          password. It expires in 45 minutes.
        </p>
        <p className="auth-shell__footer">
          <Link to="/login">Back to sign in</Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit}>
        <h1>Forgot password?</h1>
        <p className="auth-shell__subtitle">
          Enter your email and we&apos;ll send you a link to reset your password.
        </p>

        {error && <div className="alert alert--error">{error}</div>}

        <div className="auth-fields">
          <label className="field">
            <span>Email</span>
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
          {loading ? 'Sending…' : 'Send reset link'}
        </button>

        <p className="auth-shell__footer">
          <Link to="/login">Back to sign in</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

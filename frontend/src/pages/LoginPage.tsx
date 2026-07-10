import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import { AuthLayout } from '@/components/AuthLayout';
import { getErrorMessage } from '@/lib/errors';

interface LocationState {
  from?: { pathname: string };
}

const RESEND_COOLDOWN_SECONDS = 30;

export function LoginPage() {
  const { login, verifyOtp, resendOtp, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const from = (location.state as LocationState | null)?.from?.pathname ?? '/dashboard';

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  const handleCredentialsSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await login({ email, password });
      if (response.mfaRequired) {
        setMaskedEmail(response.maskedEmail ?? email);
        setStep('otp');
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
      } else {
        navigate(from, { replace: true });
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to sign in'));
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await verifyOtp({ email, code });
      navigate(from, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Invalid or expired verification code'));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setError(null);
    try {
      await resendOtp({ email });
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to resend the code'));
    }
  };

  if (step === 'otp') {
    return (
      <AuthLayout>
        <form onSubmit={handleOtpSubmit}>
          <h1>Verify your identity</h1>
          <p className="otp-hint">
            We sent a 6-digit verification code to <strong>{maskedEmail}</strong>. It expires in 5
            minutes.
          </p>

          {error && <div className="alert alert--error">{error}</div>}

          <label className="field">
            <span>Verification code</span>
            <input
              className="otp-input"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              required
              autoFocus
            />
          </label>

          <button className="btn btn--primary btn--block" type="submit" disabled={loading}>
            {loading ? 'Verifying…' : 'Verify'}
          </button>

          <div className="otp-actions">
            <button type="button" onClick={() => setStep('credentials')}>
              Back
            </button>
            <button type="button" onClick={handleResend} disabled={resendCooldown > 0}>
              {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code'}
            </button>
          </div>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <form onSubmit={handleCredentialsSubmit}>
        <h1>Sign in</h1>
        <p className="auth-shell__subtitle">Access your HumanEdge workspace</p>

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

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </label>
        </div>

        <button className="btn btn--primary btn--block" type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="auth-shell__footer">
          Don&apos;t have an account? <Link to="/register">Create one</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import { useLanguage } from '@/i18n/useLanguage';
import { AuthLayout } from '@/components/AuthLayout';
import { getErrorMessage } from '@/lib/errors';

interface LocationState {
  from?: { pathname: string };
}

const RESEND_COOLDOWN_SECONDS = 30;

export function LoginPage() {
  const { login, verifyOtp, resendOtp, isAuthenticated } = useAuth();
  const { t } = useLanguage();
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
      setError(getErrorMessage(err, t.login.errorSignIn));
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
      setError(getErrorMessage(err, t.login.errorOtp));
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
      setError(getErrorMessage(err, t.login.errorResend));
    }
  };

  if (step === 'otp') {
    return (
      <AuthLayout>
        <form onSubmit={handleOtpSubmit}>
          <h1>{t.login.verifyIdentity}</h1>
          <p className="otp-hint">
            {t.login.otpHintPrefix} <strong>{maskedEmail}</strong>. {t.login.otpHintSuffix}
          </p>

          {error && <div className="alert alert--error">{error}</div>}

          <label className="field">
            <span>{t.login.verificationCode}</span>
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
            {loading ? t.login.verifying : t.login.verify}
          </button>

          <div className="otp-actions">
            <button type="button" onClick={() => setStep('credentials')}>
              {t.login.back}
            </button>
            <button type="button" onClick={handleResend} disabled={resendCooldown > 0}>
              {resendCooldown > 0 ? t.login.resendCodeWithCooldown(resendCooldown) : t.login.resendCode}
            </button>
          </div>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <form onSubmit={handleCredentialsSubmit}>
        <h1>{t.login.signIn}</h1>
        <p className="auth-shell__subtitle">{t.login.subtitle}</p>

        {error && <div className="alert alert--error">{error}</div>}

        <div className="auth-fields">
          <label className="field">
            <span>{t.login.email}</span>
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
            <span>{t.login.password}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </label>
        </div>

        <p className="auth-shell__forgot">
          <Link to="/forgot-password">{t.login.forgotPassword}</Link>
        </p>

        <button className="btn btn--primary btn--block" type="submit" disabled={loading}>
          {loading ? t.login.signingIn : t.login.signIn}
        </button>

        <p className="auth-shell__footer">
          {t.login.noAccount} <Link to="/register">{t.login.createOne}</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

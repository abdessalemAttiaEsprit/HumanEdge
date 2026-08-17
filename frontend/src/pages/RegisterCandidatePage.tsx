import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import { useLanguage } from '@/i18n/useLanguage';
import { AuthLayout } from '@/components/AuthLayout';
import { getErrorMessage } from '@/lib/errors';
import type { RegisterRequest } from '@/types';

const EMPTY: RegisterRequest = {
  firstname: '',
  lastname: '',
  email: '',
  password: '',
  role: 'GUEST',
};

export function RegisterCandidatePage() {
  const { register, isAuthenticated } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [form, setForm] = useState<RegisterRequest>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const update = (patch: Partial<RegisterRequest>) => setForm((f) => ({ ...f, ...patch }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register(form);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, t.registerCandidate.errorCreate));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit}>
        <h1>{t.registerCandidate.title}</h1>
        <p className="auth-shell__subtitle">
          {t.registerCandidate.notCandidate}{' '}
          <Link to="/register/company">{t.registerCandidate.registerCompanyInstead}</Link>.
        </p>

        {error && <div className="alert alert--error">{error}</div>}

        <div className="field-row">
          <label className="field">
            <span>{t.registerCandidate.firstName}</span>
            <input value={form.firstname} onChange={(e) => update({ firstname: e.target.value })} required />
          </label>
          <label className="field">
            <span>{t.registerCandidate.lastName}</span>
            <input value={form.lastname} onChange={(e) => update({ lastname: e.target.value })} required />
          </label>
        </div>

        <label className="field">
          <span>{t.registerCandidate.email}</span>
          <input
            type="email"
            value={form.email}
            onChange={(e) => update({ email: e.target.value })}
            required
          />
        </label>

        <label className="field">
          <span>{t.registerCandidate.password}</span>
          <input
            type="password"
            value={form.password}
            onChange={(e) => update({ password: e.target.value })}
            required
          />
        </label>

        <button className="btn btn--primary btn--block" type="submit" disabled={loading}>
          {loading ? t.registerCandidate.creating : t.registerCandidate.createAccount}
        </button>

        <p className="auth-shell__footer">
          {t.registerCandidate.alreadyHaveAccount} <Link to="/login">{t.registerCandidate.signIn}</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

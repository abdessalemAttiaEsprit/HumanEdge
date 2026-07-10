import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
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
      setError(getErrorMessage(err, 'Unable to create the account'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit}>
        <h1>Create your candidate account</h1>
        <p className="auth-shell__subtitle">
          Not a candidate? <Link to="/register/company">Register your company instead</Link>.
        </p>

        {error && <div className="alert alert--error">{error}</div>}

        <div className="field-row">
          <label className="field">
            <span>First name</span>
            <input value={form.firstname} onChange={(e) => update({ firstname: e.target.value })} required />
          </label>
          <label className="field">
            <span>Last name</span>
            <input value={form.lastname} onChange={(e) => update({ lastname: e.target.value })} required />
          </label>
        </div>

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={form.email}
            onChange={(e) => update({ email: e.target.value })}
            required
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={form.password}
            onChange={(e) => update({ password: e.target.value })}
            required
          />
        </label>

        <button className="btn btn--primary btn--block" type="submit" disabled={loading}>
          {loading ? 'Creating account…' : 'Create account'}
        </button>

        <p className="auth-shell__footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

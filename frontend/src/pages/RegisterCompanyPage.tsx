import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import { authApi } from '@/api/auth';
import { AuthLayout } from '@/components/AuthLayout';
import { PlanPicker } from '@/components/PlanPicker';
import { CardPaymentFields } from '@/components/CardPaymentFields';
import { getErrorMessage } from '@/lib/errors';
import type { RegisterRequest } from '@/types';

const EMPTY: RegisterRequest = {
  firstname: '',
  lastname: '',
  email: '',
  password: '',
  role: 'COMPANY',
  companyName: '',
  fiscalNumber: '',
  cnssNumber: '',
  rib: '',
  phone: '',
  address: '',
  city: '',
  subscriptionPlan: '',
  cardHolder: '',
  cardNumber: '',
  cardExpiry: '',
  cardCvv: '',
};

export function RegisterCompanyPage() {
  const { register, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState<RegisterRequest>(EMPTY);
  const [logo, setLogo] = useState<File | null>(null);
  const [signature, setSignature] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: plans } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: authApi.getSubscriptionPlans,
  });

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const update = (patch: Partial<RegisterRequest>) => setForm((f) => ({ ...f, ...patch }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.subscriptionPlan) {
      setError('Please select a subscription plan');
      return;
    }
    setLoading(true);
    try {
      await register(form, { logo: logo ?? undefined, signature: signature ?? undefined });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to create the account'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout wide>
      <form onSubmit={handleSubmit}>
        <h1>Create your company account</h1>
        <p className="auth-shell__subtitle">
          Not a company?{' '}
          <Link to="/register/candidate">Register as a candidate instead</Link>.
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

        <fieldset className="fieldset">
          <legend>Company information</legend>
          <label className="field">
            <span>Company name</span>
            <input
              value={form.companyName}
              onChange={(e) => update({ companyName: e.target.value })}
              required
            />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Fiscal number</span>
              <input
                value={form.fiscalNumber}
                onChange={(e) => update({ fiscalNumber: e.target.value })}
                required
              />
            </label>
            <label className="field">
              <span>CNSS number</span>
              <input
                value={form.cnssNumber}
                onChange={(e) => update({ cnssNumber: e.target.value })}
                required
              />
            </label>
          </div>
          <label className="field">
            <span>Bank account number (RIB)</span>
            <input value={form.rib} onChange={(e) => update({ rib: e.target.value })} required />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Phone</span>
              <input value={form.phone} onChange={(e) => update({ phone: e.target.value })} />
            </label>
            <label className="field">
              <span>City</span>
              <input value={form.city} onChange={(e) => update({ city: e.target.value })} />
            </label>
          </div>
          <label className="field">
            <span>Company logo (optional)</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/svg+xml"
              onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className="field">
            <span>Signature (optional)</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/svg+xml"
              onChange={(e) => setSignature(e.target.files?.[0] ?? null)}
            />
          </label>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Subscription & payment</legend>

          <PlanPicker plans={plans} selected={form.subscriptionPlan ?? ''} onSelect={(code) => update({ subscriptionPlan: code })} />

          <CardPaymentFields
            value={{
              cardHolder: form.cardHolder ?? '',
              cardNumber: form.cardNumber ?? '',
              cardExpiry: form.cardExpiry ?? '',
              cardCvv: form.cardCvv ?? '',
            }}
            onChange={(patch) => update(patch)}
          />
        </fieldset>

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

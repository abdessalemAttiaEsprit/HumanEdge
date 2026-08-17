import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import { useLanguage } from '@/i18n/useLanguage';
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
  const { t } = useLanguage();
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
      setError(t.registerCompany.errorSelectPlan);
      return;
    }
    setLoading(true);
    try {
      await register(form, { logo: logo ?? undefined, signature: signature ?? undefined });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, t.registerCompany.errorCreate));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout wide>
      <form onSubmit={handleSubmit}>
        <h1>{t.registerCompany.title}</h1>
        <p className="auth-shell__subtitle">
          {t.registerCompany.notCompany}{' '}
          <Link to="/register/candidate">{t.registerCompany.registerCandidateInstead}</Link>.
        </p>

        {error && <div className="alert alert--error">{error}</div>}

        <div className="field-row">
          <label className="field">
            <span>{t.registerCompany.firstName}</span>
            <input value={form.firstname} onChange={(e) => update({ firstname: e.target.value })} required />
          </label>
          <label className="field">
            <span>{t.registerCompany.lastName}</span>
            <input value={form.lastname} onChange={(e) => update({ lastname: e.target.value })} required />
          </label>
        </div>

        <label className="field">
          <span>{t.registerCompany.email}</span>
          <input
            type="email"
            value={form.email}
            onChange={(e) => update({ email: e.target.value })}
            required
          />
        </label>

        <label className="field">
          <span>{t.registerCompany.password}</span>
          <input
            type="password"
            value={form.password}
            onChange={(e) => update({ password: e.target.value })}
            required
          />
        </label>

        <fieldset className="fieldset">
          <legend>{t.registerCompany.companyInformation}</legend>
          <label className="field">
            <span>{t.registerCompany.companyName}</span>
            <input
              value={form.companyName}
              onChange={(e) => update({ companyName: e.target.value })}
              required
            />
          </label>
          <div className="field-row">
            <label className="field">
              <span>{t.registerCompany.fiscalNumber}</span>
              <input
                value={form.fiscalNumber}
                onChange={(e) => update({ fiscalNumber: e.target.value })}
                required
              />
            </label>
            <label className="field">
              <span>{t.registerCompany.cnssNumber}</span>
              <input
                value={form.cnssNumber}
                onChange={(e) => update({ cnssNumber: e.target.value })}
                required
              />
            </label>
          </div>
          <label className="field">
            <span>{t.registerCompany.rib}</span>
            <input value={form.rib} onChange={(e) => update({ rib: e.target.value })} required />
          </label>
          <div className="field-row">
            <label className="field">
              <span>{t.registerCompany.phone}</span>
              <input value={form.phone} onChange={(e) => update({ phone: e.target.value })} />
            </label>
            <label className="field">
              <span>{t.registerCompany.city}</span>
              <input value={form.city} onChange={(e) => update({ city: e.target.value })} />
            </label>
          </div>
          <label className="field">
            <span>{t.registerCompany.companyLogo}</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/svg+xml"
              onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className="field">
            <span>{t.registerCompany.signature}</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/svg+xml"
              onChange={(e) => setSignature(e.target.files?.[0] ?? null)}
            />
          </label>
        </fieldset>

        <fieldset className="fieldset">
          <legend>{t.registerCompany.subscriptionAndPayment}</legend>

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
          {loading ? t.registerCompany.creating : t.registerCompany.createAccount}
        </button>

        <p className="auth-shell__footer">
          {t.registerCompany.alreadyHaveAccount} <Link to="/login">{t.registerCompany.signIn}</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

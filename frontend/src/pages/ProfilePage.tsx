import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/useAuth';
import { accountApi } from '@/api/account';
import { authApi } from '@/api/auth';
import { companiesApi } from '@/api/companies';
import { personnelApi } from '@/api/personnel';
import { fileUrl } from '@/api/axios';
import { getErrorMessage } from '@/lib/errors';
import { formatDateFr } from '@/lib/format';
import { PlanPicker } from '@/components/PlanPicker';
import { CardPaymentFields, type CardDetails } from '@/components/CardPaymentFields';
import { useToast } from '@/components/ToastProvider';
import { useEscapeKey } from '@/lib/useEscapeKey';
import type { CompanyUpdateRequest, SubscriptionPaymentRequest } from '@/types';

export function ProfilePage() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="page">
      <div className="page__header">
        <h1>My profile</h1>
        <p className="page__subtitle">Manage your account details.</p>
      </div>

      <div className="profile-stack">
        <AccountCard />
        {user.role === 'COMPANY' && user.companyId && (
          <>
            <CompanyCard companyId={user.companyId} />
            <SubscriptionCard companyId={user.companyId} />
          </>
        )}
        {user.role === 'EMPLOYE' && <EmployeeCard />}
        <PasswordCard />
      </div>
    </div>
  );
}

// ============================================================================
// Account: avatar (shown in the top bar) + read-only identity.
// ============================================================================
function AccountCard() {
  const { user, updateAvatar } = useAuth();
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;

  const avatarMutation = useMutation({
    mutationFn: accountApi.uploadAvatar,
    onSuccess: (updated) => {
      if (updated.img) updateAvatar(updated.img);
      setError(null);
    },
    onError: (err) => setError(getErrorMessage(err, 'Unable to upload the photo')),
  });

  const avatar = fileUrl(user.img);
  const initials = `${user.firstname?.[0] ?? ''}${user.lastname?.[0] ?? ''}`.toUpperCase();

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    avatarMutation.mutate(file);
    e.target.value = '';
  };

  return (
    <div className="chart-card">
      <h2 className="chart-card__title">Account</h2>
      {error && <div className="alert alert--error">{error}</div>}

      <div className="field-with-preview">
        {avatar ? (
          <img className="avatar avatar--lg" src={avatar} alt={user.firstname} />
        ) : (
          <span className="avatar avatar--lg avatar--initials">{initials || '?'}</span>
        )}
        <label className="field">
          <span>Profile picture (shown in the top bar)</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif"
            onChange={handleFileChange}
            disabled={avatarMutation.isPending}
          />
        </label>
      </div>

      {user.role !== 'COMPANY' && (
        <div className="field-row">
          <label className="field">
            <span>First name</span>
            <input value={user.firstname} disabled />
          </label>
          <label className="field">
            <span>Last name</span>
            <input value={user.lastname} disabled />
          </label>
        </div>
      )}
      <label className="field">
        <span>Email</span>
        <input value={user.email} disabled />
      </label>
    </div>
  );
}

// ============================================================================
// Company: editable company record + logo upload (COMPANY role only).
// ============================================================================
function CompanyCard({ companyId }: { companyId: number }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CompanyUpdateRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: company, isLoading } = useQuery({
    queryKey: ['company', companyId],
    queryFn: () => companiesApi.getById(companyId),
  });

  useEffect(() => {
    if (!company) return;
    setForm({
      companyName: company.companyName,
      phone: company.phone ?? '',
      address: company.address ?? '',
      city: company.city ?? '',
      state: company.state ?? '',
      country: company.country ?? '',
      postalCode: company.postalCode ?? '',
      logoUrl: company.logoUrl,
      fiscalNumber: company.fiscalNumber,
      cnssNumber: company.cnssNumber,
      signatureFileName: company.signatureFileName,
      rib: company.rib,
    });
  }, [company]);

  const updateMutation = useMutation({
    mutationFn: (payload: CompanyUpdateRequest) => companiesApi.update(companyId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company', companyId] });
      setError(null);
      setSaved(true);
    },
    onError: (err) => {
      setSaved(false);
      setError(getErrorMessage(err, 'Unable to update your company'));
    },
  });

  const logoMutation = useMutation({
    mutationFn: (file: File) => companiesApi.uploadLogo(companyId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company', companyId] });
      setError(null);
    },
    onError: (err) => setError(getErrorMessage(err, 'Unable to upload the logo')),
  });

  const handleLogoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    logoMutation.mutate(file);
    e.target.value = '';
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaved(false);
    updateMutation.mutate(form);
  };

  if (isLoading || !form) {
    return (
      <div className="chart-card">
        <h2 className="chart-card__title">Company</h2>
        <p className="jobs__status">Loading your company…</p>
      </div>
    );
  }

  return (
    <div className="chart-card">
      <h2 className="chart-card__title">Company</h2>
      {error && <div className="alert alert--error">{error}</div>}
      {saved && !error && <div className="alert alert--success">Company details saved.</div>}

      <div className="field-with-preview">
        {company?.logoUrl ? (
          <img className="avatar avatar--lg" src={fileUrl(company.logoUrl)} alt={form.companyName} />
        ) : (
          <span className="avatar avatar--lg avatar--initials">{form.companyName.slice(0, 1)}</span>
        )}
        <label className="field">
          <span>Company logo</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif"
            onChange={handleLogoChange}
            disabled={logoMutation.isPending}
          />
        </label>
      </div>

      <form onSubmit={handleSubmit}>
        <label className="field">
          <span>Company name</span>
          <input
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
            required
          />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Fiscal number</span>
            <input
              value={form.fiscalNumber}
              onChange={(e) => setForm({ ...form, fiscalNumber: e.target.value })}
              required
            />
          </label>
          <label className="field">
            <span>CNSS number</span>
            <input
              value={form.cnssNumber}
              onChange={(e) => setForm({ ...form, cnssNumber: e.target.value })}
              required
            />
          </label>
        </div>
        <label className="field">
          <span>Bank account number (RIB)</span>
          <input value={form.rib} onChange={(e) => setForm({ ...form, rib: e.target.value })} required />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Phone</span>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          <label className="field">
            <span>City</span>
            <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </label>
        </div>
        <label className="field">
          <span>Address</span>
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </label>
        <div className="field-row">
          <label className="field">
            <span>State</span>
            <input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
          </label>
          <label className="field">
            <span>Postal code</span>
            <input value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} />
          </label>
        </div>
        <label className="field">
          <span>Country</span>
          <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
        </label>

        <div className="chart-card__actions">
          <button className="btn btn--primary" type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ============================================================================
// Subscription: renew / change plan / cancel (COMPANY role only). A new simulated payment
// is always required to renew or switch plans — see SubscriptionService.updateSubscription.
// ============================================================================
function SubscriptionCard({ companyId }: { companyId: number }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showManage, setShowManage] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [card, setCard] = useState<CardDetails>({ cardHolder: '', cardNumber: '', cardExpiry: '', cardCvv: '' });
  const [error, setError] = useState<string | null>(null);

  const { data: subscription, isLoading } = useQuery({
    queryKey: ['company-subscription', companyId],
    queryFn: () => companiesApi.getSubscription(companyId),
  });

  const { data: plans } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: authApi.getSubscriptionPlans,
    enabled: showManage,
  });

  const updateMutation = useMutation({
    mutationFn: (payload: SubscriptionPaymentRequest) => companiesApi.updateSubscription(companyId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-subscription', companyId] });
      setShowManage(false);
      setError(null);
      toast.showSuccess('Payment successful — your subscription is up to date.');
    },
    onError: (err) => setError(getErrorMessage(err, 'Payment failed')),
  });

  const cancelMutation = useMutation({
    mutationFn: () => companiesApi.cancelSubscription(companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-subscription', companyId] });
      toast.showSuccess('Subscription canceled.');
    },
    onError: (err) => toast.showError(getErrorMessage(err, 'Unable to cancel your subscription')),
  });

  const openManage = () => {
    setSelectedPlan(subscription?.plan ?? '');
    setCard({ cardHolder: '', cardNumber: '', cardExpiry: '', cardCvv: '' });
    setError(null);
    setShowManage(true);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) {
      setError('Please select a plan');
      return;
    }
    setError(null);
    updateMutation.mutate({ plan: selectedPlan, ...card });
  };

  const handleCancel = () => {
    if (!window.confirm('Cancel your subscription? You can renew it anytime from this page.')) return;
    cancelMutation.mutate();
  };

  useEscapeKey(() => setShowManage(false), showManage);

  if (isLoading) {
    return (
      <div className="chart-card">
        <h2 className="chart-card__title">Subscription</h2>
        <p className="jobs__status">Loading…</p>
      </div>
    );
  }

  const planLabel = subscription ? subscription.plan.charAt(0) + subscription.plan.slice(1).toLowerCase() : null;
  const isActive = subscription?.status === 'ACTIVE';

  return (
    <div className="chart-card">
      <div className="chart-card__header">
        <h2 className="chart-card__title">Subscription</h2>
        {subscription && (
          <span className={isActive ? 'badge badge--soft' : 'badge badge--muted'}>{subscription.status}</span>
        )}
      </div>

      {subscription ? (
        <>
          <p className="field-hint">
            Plan: <strong>{planLabel}</strong> — {subscription.amount.toFixed(0)} {subscription.currency}/mo
            {subscription.periodEnd &&
              (isActive
                ? ` — renews on ${formatDateFr(subscription.periodEnd)}`
                : ` — period ended ${formatDateFr(subscription.periodEnd)}`)}
          </p>
          <div className="chart-card__actions">
            <button className="btn btn--primary" type="button" onClick={openManage}>
              {isActive ? 'Renew / change plan' : 'Reactivate subscription'}
            </button>
            {isActive && (
              <button
                className="btn btn--ghost"
                type="button"
                onClick={handleCancel}
                disabled={cancelMutation.isPending}
              >
                Cancel subscription
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="field-hint">No subscription on file.</p>
      )}

      {showManage && (
        <div className="modal-overlay" onClick={() => setShowManage(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Manage subscription</h2>
            <form onSubmit={handleSubmit}>
              {error && <div className="alert alert--error">{error}</div>}
              <PlanPicker plans={plans} selected={selectedPlan} onSelect={setSelectedPlan} />
              <CardPaymentFields value={card} onChange={(patch) => setCard((c) => ({ ...c, ...patch }))} />
              <div className="modal__actions">
                <button type="button" className="btn btn--ghost" onClick={() => setShowManage(false)}>
                  Cancel
                </button>
                <button className="btn btn--primary" type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Processing…' : 'Pay & confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Employee: own Personnel record — telephone/RIB editable, rest read-only.
// ============================================================================
function EmployeeCard() {
  const queryClient = useQueryClient();
  const [telephone, setTelephone] = useState('');
  const [rib, setRib] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: personnel, isLoading } = useQuery({
    queryKey: ['personnel', 'me'],
    queryFn: personnelApi.getMine,
  });

  useEffect(() => {
    if (!personnel) return;
    setTelephone(personnel.telephone ?? '');
    setRib(personnel.rib);
  }, [personnel]);

  const updateMutation = useMutation({
    mutationFn: () => personnelApi.updateMine({ telephone, rib }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personnel', 'me'] });
      setError(null);
      setSaved(true);
    },
    onError: (err) => {
      setSaved(false);
      setError(getErrorMessage(err, 'Unable to update your profile'));
    },
  });

  const photoMutation = useMutation({
    mutationFn: personnelApi.uploadMyImage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personnel', 'me'] });
      setPhotoError(null);
    },
    onError: (err) => setPhotoError(getErrorMessage(err, 'Unable to upload the photo')),
  });

  const handlePhotoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    photoMutation.mutate(file);
    e.target.value = '';
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    updateMutation.mutate();
  };

  if (isLoading || !personnel) {
    return (
      <div className="chart-card">
        <h2 className="chart-card__title">Employee record</h2>
        <p className="jobs__status">Loading your record…</p>
      </div>
    );
  }

  const contract = personnel.contract;

  return (
    <div className="chart-card">
      <h2 className="chart-card__title">Employee record</h2>
      {error && <div className="alert alert--error">{error}</div>}
      {saved && !error && <div className="alert alert--success">Profile saved.</div>}

      <div className="field-with-preview">
        {personnel.image ? (
          <img className="avatar avatar--lg" src={fileUrl(personnel.image)} alt="" />
        ) : (
          <span className="avatar avatar--lg avatar--initials">{personnel.cin.slice(0, 1)}</span>
        )}
        <label className="field">
          <span>Employee photo (used on your HR documents)</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif"
            onChange={handlePhotoChange}
            disabled={photoMutation.isPending}
          />
        </label>
      </div>
      {photoError && <div className="alert alert--error">{photoError}</div>}

      <form onSubmit={handleSubmit}>
        <div className="field-row">
          <label className="field">
            <span>CIN</span>
            <input value={personnel.cin} disabled />
          </label>
          <label className="field">
            <span>Matricule</span>
            <input value={personnel.matricule ?? '—'} disabled />
          </label>
        </div>
        <label className="field">
          <span>CNSS number</span>
          <input value={personnel.cnssNumber} disabled />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Phone</span>
            <input value={telephone} onChange={(e) => setTelephone(e.target.value)} />
          </label>
          <label className="field">
            <span>Bank account number (RIB)</span>
            <input value={rib} onChange={(e) => setRib(e.target.value)} required />
          </label>
        </div>

        <div className="chart-card__actions">
          <button className="btn btn--primary" type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>

      {contract && (
        <>
          <h3 className="chart-card__title" style={{ marginTop: 20 }}>Contract</h3>
          <div className="field-row">
            <label className="field">
              <span>Type</span>
              <input value={contract.typeContrat ?? '—'} disabled />
            </label>
            <label className="field">
              <span>Base salary</span>
              <input value={contract.salaireBase != null ? `${contract.salaireBase.toFixed(3)} TND` : '—'} disabled />
            </label>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Password: self-service change, any role.
// ============================================================================
function PasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: accountApi.changePassword,
    onSuccess: () => {
      setError(null);
      setSaved(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (err) => {
      setSaved(false);
      setError(getErrorMessage(err, 'Unable to change your password'));
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    if (newPassword !== confirmPassword) {
      setError('The new password and its confirmation do not match');
      return;
    }
    setError(null);
    mutation.mutate({ currentPassword, newPassword });
  };

  return (
    <div className="chart-card">
      <h2 className="chart-card__title">Password</h2>
      {error && <div className="alert alert--error">{error}</div>}
      {saved && !error && <div className="alert alert--success">Password changed.</div>}

      <form onSubmit={handleSubmit}>
        <label className="field">
          <span>Current password</span>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </label>
        <div className="field-row">
          <label className="field">
            <span>New password</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          <label className="field">
            <span>Confirm new password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
        </div>

        <div className="chart-card__actions">
          <button className="btn btn--primary" type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Change password'}
          </button>
        </div>
      </form>
    </div>
  );
}

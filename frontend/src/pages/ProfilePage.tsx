import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Briefcase,
  Building2,
  Calendar,
  Camera,
  Clock,
  CreditCard,
  FileText,
  Hash,
  Lock,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { useLanguage } from '@/i18n/useLanguage';
import { accountApi } from '@/api/account';
import { authApi } from '@/api/auth';
import { companiesApi } from '@/api/companies';
import { googleCalendarApi } from '@/api/googleCalendar';
import { personnelApi } from '@/api/personnel';
import { fileUrl } from '@/api/axios';
import { getErrorMessage } from '@/lib/errors';
import { formatDateFr } from '@/lib/format';
import { PlanPicker } from '@/components/PlanPicker';
import { CardPaymentFields, type CardDetails } from '@/components/CardPaymentFields';
import { useToast } from '@/components/ToastProvider';
import { useEscapeKey } from '@/lib/useEscapeKey';
import { useConfirm } from '@/lib/useConfirm';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { AuthResponse, CompanyUpdateRequest, SubscriptionPaymentRequest } from '@/types';

type TabKey = 'account' | 'company' | 'subscription' | 'employee' | 'security';

interface TabDef {
  key: TabKey;
  label: string;
  icon: React.ReactNode;
}

// ============================================================================
// Profile — cover header (avatar, role, at-a-glance facts) + tabbed sections
// below it. Each tab maps to a real, functional part of account self-service;
// there is no equivalent in this app for generic "posts/followers" content, so
// those are intentionally left out rather than faked.
// ============================================================================
export function ProfilePage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabKey>('account');
  if (!user) return null;

  const tabs: TabDef[] = [
    { key: 'account', label: t.profile.tabs.account, icon: <UserIcon size={15} aria-hidden="true" /> },
    ...(user.role === 'COMPANY'
      ? [
          { key: 'company' as const, label: t.profile.tabs.company, icon: <Building2 size={15} aria-hidden="true" /> },
          { key: 'subscription' as const, label: t.profile.tabs.subscription, icon: <CreditCard size={15} aria-hidden="true" /> },
        ]
      : []),
    ...(user.role === 'EMPLOYE'
      ? [{ key: 'employee' as const, label: t.profile.tabs.employee, icon: <Briefcase size={15} aria-hidden="true" /> }]
      : []),
    { key: 'security', label: t.profile.tabs.security, icon: <Lock size={15} aria-hidden="true" /> },
  ];

  return (
    <div className="page">
      <div className="card profile-card">
        <ProfileHeader user={user} />

        <div className="profile-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`profile-tab${activeTab === tab.key ? ' is-active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="profile-panel">
          {activeTab === 'account' && <AccountCard user={user} />}
          {activeTab === 'company' && user.companyId && <CompanyCard companyId={user.companyId} />}
          {activeTab === 'subscription' && user.companyId && <SubscriptionCard companyId={user.companyId} />}
          {activeTab === 'employee' && <EmployeeCard />}
          {activeTab === 'security' && <PasswordCard />}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Header: cover banner + avatar (click to change photo) + name/role, and a row
// of at-a-glance facts that vary by role — real data only, so ADMIN/GUEST (no
// company or contract to summarize) simply show no stats row.
// ============================================================================
function ProfileHeader({ user }: { user: AuthResponse }) {
  const { updateAvatar } = useAuth();
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);

  const avatarMutation = useMutation({
    mutationFn: accountApi.uploadAvatar,
    onSuccess: (updated) => {
      if (updated.img) updateAvatar(updated.img);
      setError(null);
    },
    onError: (err) => setError(getErrorMessage(err, t.profile.account.errorUploadPhoto)),
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
    <div className="profile-header">
      <div className="profile-header__cover" />

      <div className="profile-header__body">
        <div className="profile-header__identity">
          <label className="profile-header__avatar-upload" title={t.profile.changePhoto}>
            {avatar ? (
              <img className="avatar avatar--xl" src={avatar} alt={user.firstname} />
            ) : (
              <span className="avatar avatar--xl avatar--initials">{initials || '?'}</span>
            )}
            <span className="profile-header__avatar-edit">
              <Camera size={13} aria-hidden="true" />
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif"
              onChange={handleFileChange}
              disabled={avatarMutation.isPending}
            />
          </label>
          <div className="profile-header__name">
            {user.firstname} {user.lastname}
          </div>
          <div className="profile-header__role">{t.profile.roleLabel[user.role]}</div>
        </div>

        {user.role === 'COMPANY' && user.companyId && <CompanyQuickStats companyId={user.companyId} />}
        {user.role === 'EMPLOYE' && <EmployeeQuickStats />}
      </div>

      {error && (
        <div className="alert alert--error" style={{ margin: '0 24px 20px' }}>
          {error}
        </div>
      )}
    </div>
  );
}

function CompanyQuickStats({ companyId }: { companyId: number }) {
  const { t } = useLanguage();
  const { data: company } = useQuery({
    queryKey: ['company', companyId],
    queryFn: () => companiesApi.getById(companyId),
  });
  const { data: subscription } = useQuery({
    queryKey: ['company-subscription', companyId],
    queryFn: () => companiesApi.getSubscription(companyId),
  });
  const planLabel = subscription ? subscription.plan.charAt(0) + subscription.plan.slice(1).toLowerCase() : '—';

  return (
    <div className="profile-header__stats">
      <div className="profile-header__stat">
        <ShieldCheck size={16} aria-hidden="true" />
        <span className="profile-header__stat-value">{company?.verified ? t.profile.verified : t.profile.pending}</span>
        <span className="profile-header__stat-label">{t.profile.verification}</span>
      </div>
      <div className="profile-header__stat">
        <CreditCard size={16} aria-hidden="true" />
        <span className="profile-header__stat-value">{planLabel}</span>
        <span className="profile-header__stat-label">{t.profile.plan}</span>
      </div>
      <div className="profile-header__stat">
        <Calendar size={16} aria-hidden="true" />
        <span className="profile-header__stat-value">{company?.createdAt ? formatDateFr(company.createdAt) : '—'}</span>
        <span className="profile-header__stat-label">{t.profile.memberSince}</span>
      </div>
    </div>
  );
}

function EmployeeQuickStats() {
  const { t } = useLanguage();
  const { data: personnel } = useQuery({ queryKey: ['personnel', 'me'], queryFn: personnelApi.getMine });
  const contract = personnel?.contract;
  const years = contract?.dateDebut ? yearsSince(contract.dateDebut) : null;

  return (
    <div className="profile-header__stats">
      <div className="profile-header__stat">
        <Hash size={16} aria-hidden="true" />
        <span className="profile-header__stat-value">{personnel?.matricule ?? '—'}</span>
        <span className="profile-header__stat-label">{t.profile.matricule}</span>
      </div>
      <div className="profile-header__stat">
        <FileText size={16} aria-hidden="true" />
        <span className="profile-header__stat-value">
          {contract?.typeContrat ? t.contractTypes[contract.typeContrat] : '—'}
        </span>
        <span className="profile-header__stat-label">{t.profile.contract}</span>
      </div>
      <div className="profile-header__stat">
        <Clock size={16} aria-hidden="true" />
        <span className="profile-header__stat-value">{years != null ? t.profile.years(years) : '—'}</span>
        <span className="profile-header__stat-label">{t.profile.seniority}</span>
      </div>
    </div>
  );
}

function yearsSince(dateStr: string): number {
  const start = new Date(dateStr);
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  const monthDiff = now.getMonth() - start.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < start.getDate())) years--;
  return Math.max(0, years);
}

// ============================================================================
// Account: read-only identity (avatar/upload now lives in the header above).
// ============================================================================
function AccountCard({ user }: { user: AuthResponse }) {
  const { t } = useLanguage();
  return (
    <div>
      <h2 className="profile-panel__title">{t.profile.account.title}</h2>
      {user.role !== 'COMPANY' && (
        <div className="field-row">
          <label className="field">
            <span>{t.profile.account.firstName}</span>
            <input value={user.firstname} disabled />
          </label>
          <label className="field">
            <span>{t.profile.account.lastName}</span>
            <input value={user.lastname} disabled />
          </label>
        </div>
      )}
      <label className="field">
        <span>{t.profile.account.email}</span>
        <input value={user.email} disabled />
      </label>

      {(user.role === 'COMPANY' || user.role === 'EMPLOYE') && <GoogleCalendarCard />}
    </div>
  );
}

// ============================================================================
// Google Calendar: connect/disconnect (COMPANY and EMPLOYE only — the two roles
// that actually get absences/tasks/interviews/payroll dates synced, see
// GoogleCalendarSyncService on the backend). The OAuth flow leaves the SPA
// entirely (browser redirect to Google and back), so status is re-checked from
// the ?google=connected|error query param left by GoogleCalendarController#callback.
// ============================================================================
function GoogleCalendarCard() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: connected, isLoading } = useQuery({
    queryKey: ['google-calendar-status'],
    queryFn: googleCalendarApi.status,
  });

  const connectMutation = useMutation({
    mutationFn: googleCalendarApi.getAuthorizationUrl,
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.profile.googleCalendar.errorConnect)),
  });

  const disconnectMutation = useMutation({
    mutationFn: googleCalendarApi.disconnect,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-calendar-status'] });
      toast.showSuccess(t.profile.googleCalendar.disconnectedSuccess);
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.profile.googleCalendar.errorDisconnect)),
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('google');
    if (result === 'connected') {
      toast.showSuccess(t.profile.googleCalendar.connectedSuccess);
      queryClient.invalidateQueries({ queryKey: ['google-calendar-status'] });
    } else if (result === 'error') {
      toast.showError(t.profile.googleCalendar.errorConnect);
    }
    if (result) {
      // Nettoie l'URL pour ne pas redéclencher ce toast à chaque rafraîchissement de la page.
      window.history.replaceState({}, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <h3 className="profile-panel__title" style={{ marginTop: 20 }}>{t.profile.googleCalendar.title}</h3>
      <p className="field-hint">{t.profile.googleCalendar.description}</p>
      {isLoading ? (
        <p className="jobs__status">{t.profile.googleCalendar.loading}</p>
      ) : connected ? (
        <div className="chart-card__actions">
          <span className="badge badge--success">{t.profile.googleCalendar.connected}</span>
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() => disconnectMutation.mutate()}
            disabled={disconnectMutation.isPending}
          >
            {t.profile.googleCalendar.disconnect}
          </button>
        </div>
      ) : (
        <button
          className="btn btn--primary"
          type="button"
          onClick={() => connectMutation.mutate()}
          disabled={connectMutation.isPending}
        >
          {t.profile.googleCalendar.connect}
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Company: editable company record + logo upload (COMPANY role only).
// ============================================================================
function CompanyCard({ companyId }: { companyId: number }) {
  const { t } = useLanguage();
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
      setError(getErrorMessage(err, t.profile.company.errorUpdate));
    },
  });

  const logoMutation = useMutation({
    mutationFn: (file: File) => companiesApi.uploadLogo(companyId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company', companyId] });
      setError(null);
    },
    onError: (err) => setError(getErrorMessage(err, t.profile.company.errorUploadLogo)),
  });

  const handleLogoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    logoMutation.mutate(file);
    e.target.value = '';
  };

  const signatureMutation = useMutation({
    mutationFn: (file: File) => companiesApi.uploadSignature(companyId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company', companyId] });
      setError(null);
    },
    onError: (err) => setError(getErrorMessage(err, t.profile.company.errorUploadSignature)),
  });

  const handleSignatureChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    signatureMutation.mutate(file);
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
      <div>
        <h2 className="profile-panel__title">{t.profile.company.title}</h2>
        <p className="jobs__status">{t.profile.company.loading}</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="profile-panel__title">{t.profile.company.title}</h2>
      {error && <div className="alert alert--error">{error}</div>}
      {saved && !error && <div className="alert alert--success">{t.profile.company.saved}</div>}

      <div className="field-with-preview">
        {company?.logoUrl ? (
          <img className="avatar avatar--lg" src={fileUrl(company.logoUrl)} alt={form.companyName} />
        ) : (
          <span className="avatar avatar--lg avatar--initials">{form.companyName.slice(0, 1)}</span>
        )}
        <label className="field">
          <span>{t.profile.company.logo}</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif"
            onChange={handleLogoChange}
            disabled={logoMutation.isPending}
          />
        </label>
      </div>

      <div className="field-with-preview">
        {company?.signatureFileName && (
          <img className="signature-preview" src={fileUrl(company.signatureFileName)} alt={t.profile.company.signature} />
        )}
        <label className="field">
          <span>{t.profile.company.signature}</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif"
            onChange={handleSignatureChange}
            disabled={signatureMutation.isPending}
          />
        </label>
      </div>

      <form onSubmit={handleSubmit}>
        <label className="field">
          <span>{t.profile.company.companyName}</span>
          <input
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
            required
          />
        </label>
        <div className="field-row">
          <label className="field">
            <span>{t.profile.company.fiscalNumber}</span>
            <input
              value={form.fiscalNumber}
              onChange={(e) => setForm({ ...form, fiscalNumber: e.target.value })}
              required
            />
          </label>
          <label className="field">
            <span>{t.profile.company.cnssNumber}</span>
            <input
              value={form.cnssNumber}
              onChange={(e) => setForm({ ...form, cnssNumber: e.target.value })}
              required
            />
          </label>
        </div>
        <label className="field">
          <span>{t.profile.company.rib}</span>
          <input value={form.rib} onChange={(e) => setForm({ ...form, rib: e.target.value })} required />
        </label>
        <div className="field-row">
          <label className="field">
            <span>{t.profile.company.phone}</span>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          <label className="field">
            <span>{t.profile.company.city}</span>
            <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </label>
        </div>
        <label className="field">
          <span>{t.profile.company.address}</span>
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </label>
        <div className="field-row">
          <label className="field">
            <span>{t.profile.company.state}</span>
            <input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
          </label>
          <label className="field">
            <span>{t.profile.company.postalCode}</span>
            <input value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} />
          </label>
        </div>
        <label className="field">
          <span>{t.profile.company.country}</span>
          <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
        </label>

        <div className="chart-card__actions">
          <button className="btn btn--primary" type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? t.profile.company.saving : t.profile.company.saveChanges}
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
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { confirmOptions, requestConfirm, closeConfirm, handleConfirm } = useConfirm();
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
      toast.showSuccess(t.profile.subscription.paymentSuccess);
    },
    onError: (err) => setError(getErrorMessage(err, t.profile.subscription.errorPayment)),
  });

  const cancelMutation = useMutation({
    mutationFn: () => companiesApi.cancelSubscription(companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-subscription', companyId] });
      toast.showSuccess(t.profile.subscription.subscriptionCanceled);
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.profile.subscription.errorCancel)),
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
      setError(t.profile.subscription.errorSelectPlan);
      return;
    }
    setError(null);
    updateMutation.mutate({ plan: selectedPlan, ...card });
  };

  const handleCancel = () => {
    requestConfirm({
      title: t.profile.subscription.confirmCancelTitle,
      message: t.profile.subscription.confirmCancelMessage,
      confirmLabel: t.profile.subscription.confirmCancelConfirmLabel,
      cancelLabel: t.profile.subscription.confirmCancelKeepLabel,
      variant: 'danger',
      onConfirm: () => cancelMutation.mutate(),
    });
  };

  useEscapeKey(() => setShowManage(false), showManage);

  if (isLoading) {
    return (
      <div>
        <h2 className="profile-panel__title">{t.profile.subscription.title}</h2>
        <p className="jobs__status">{t.profile.subscription.loading}</p>
      </div>
    );
  }

  const planLabel = subscription ? subscription.plan.charAt(0) + subscription.plan.slice(1).toLowerCase() : null;
  const isActive = subscription?.status === 'ACTIVE';

  return (
    <div>
      <div className="chart-card__header">
        <h2 className="profile-panel__title">{t.profile.subscription.title}</h2>
        {subscription && (
          <span className={isActive ? 'badge badge--success' : 'badge badge--muted'}>{subscription.status}</span>
        )}
      </div>

      {subscription ? (
        <>
          <p className="field-hint">
            {t.profile.subscription.plan(planLabel ?? '—')} — {subscription.amount.toFixed(0)} {subscription.currency}/mo
            {subscription.periodEnd &&
              ` — ${
                isActive
                  ? t.profile.subscription.renewsOn(formatDateFr(subscription.periodEnd))
                  : t.profile.subscription.periodEnded(formatDateFr(subscription.periodEnd))
              }`}
          </p>
          <div className="chart-card__actions">
            <button className="btn btn--primary" type="button" onClick={openManage}>
              {isActive ? t.profile.subscription.renewOrChange : t.profile.subscription.reactivate}
            </button>
            {isActive && (
              <button
                className="btn btn--ghost"
                type="button"
                onClick={handleCancel}
                disabled={cancelMutation.isPending}
              >
                {t.profile.subscription.cancelSubscription}
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="field-hint">{t.profile.subscription.noSubscription}</p>
      )}

      {showManage && (
        <div className="modal-overlay" onClick={() => setShowManage(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t.profile.subscription.manage}</h2>
            <form onSubmit={handleSubmit}>
              {error && <div className="alert alert--error">{error}</div>}
              <PlanPicker plans={plans} selected={selectedPlan} onSelect={setSelectedPlan} />
              <CardPaymentFields value={card} onChange={(patch) => setCard((c) => ({ ...c, ...patch }))} />
              <div className="modal__actions">
                <button type="button" className="btn btn--ghost" onClick={() => setShowManage(false)}>
                  {t.profile.subscription.cancel}
                </button>
                <button className="btn btn--primary" type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? t.profile.subscription.processing : t.profile.subscription.payAndConfirm}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog options={confirmOptions} onConfirm={handleConfirm} onCancel={closeConfirm} />
    </div>
  );
}

// ============================================================================
// Employee: own Personnel record — telephone/RIB editable, rest read-only.
// ============================================================================
function EmployeeCard() {
  const { t } = useLanguage();
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
      setError(getErrorMessage(err, t.profile.employee.errorUpdate));
    },
  });

  const photoMutation = useMutation({
    mutationFn: personnelApi.uploadMyImage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personnel', 'me'] });
      setPhotoError(null);
    },
    onError: (err) => setPhotoError(getErrorMessage(err, t.profile.employee.errorUploadPhoto)),
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
      <div>
        <h2 className="profile-panel__title">{t.profile.employee.title}</h2>
        <p className="jobs__status">{t.profile.employee.loading}</p>
      </div>
    );
  }

  const contract = personnel.contract;

  return (
    <div>
      <h2 className="profile-panel__title">{t.profile.employee.title}</h2>
      {error && <div className="alert alert--error">{error}</div>}
      {saved && !error && <div className="alert alert--success">{t.profile.employee.saved}</div>}

      <div className="field-with-preview">
        {personnel.image ? (
          <img className="avatar avatar--lg" src={fileUrl(personnel.image)} alt="" />
        ) : (
          <span className="avatar avatar--lg avatar--initials">{personnel.cin.slice(0, 1)}</span>
        )}
        <label className="field">
          <span>{t.profile.employee.photoLabel}</span>
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
            <span>{t.profile.employee.cin}</span>
            <input value={personnel.cin} disabled />
          </label>
          <label className="field">
            <span>{t.profile.employee.matricule}</span>
            <input value={personnel.matricule ?? '—'} disabled />
          </label>
        </div>
        <label className="field">
          <span>{t.profile.employee.cnssNumber}</span>
          <input value={personnel.cnssNumber} disabled />
        </label>
        <div className="field-row">
          <label className="field">
            <span>{t.profile.employee.phone}</span>
            <input value={telephone} onChange={(e) => setTelephone(e.target.value)} />
          </label>
          <label className="field">
            <span>{t.profile.employee.rib}</span>
            <input value={rib} onChange={(e) => setRib(e.target.value)} required />
          </label>
        </div>

        <div className="chart-card__actions">
          <button className="btn btn--primary" type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? t.profile.employee.saving : t.profile.employee.saveChanges}
          </button>
        </div>
      </form>

      {contract && (
        <>
          <h3 className="profile-panel__title" style={{ marginTop: 20 }}>{t.profile.employee.contractTitle}</h3>
          <div className="field-row">
            <label className="field">
              <span>{t.profile.employee.type}</span>
              <input value={contract.typeContrat ? t.contractTypes[contract.typeContrat] : '—'} disabled />
            </label>
            <label className="field">
              <span>{t.profile.employee.baseSalary}</span>
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
  const { t } = useLanguage();
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
      setError(getErrorMessage(err, t.profile.password.errorChange));
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    if (newPassword !== confirmPassword) {
      setError(t.profile.password.errorMismatch);
      return;
    }
    setError(null);
    mutation.mutate({ currentPassword, newPassword });
  };

  return (
    <div>
      <h2 className="profile-panel__title">{t.profile.password.title}</h2>
      {error && <div className="alert alert--error">{error}</div>}
      {saved && !error && <div className="alert alert--success">{t.profile.password.saved}</div>}

      <form onSubmit={handleSubmit}>
        <label className="field">
          <span>{t.profile.password.current}</span>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </label>
        <div className="field-row">
          <label className="field">
            <span>{t.profile.password.new}</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          <label className="field">
            <span>{t.profile.password.confirm}</span>
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
            {mutation.isPending ? t.profile.password.saving : t.profile.password.change}
          </button>
        </div>
      </form>
    </div>
  );
}

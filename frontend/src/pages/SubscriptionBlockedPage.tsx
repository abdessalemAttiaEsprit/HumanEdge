import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/useAuth';
import { useLanguage } from '@/i18n/useLanguage';
import { authApi } from '@/api/auth';
import { companiesApi } from '@/api/companies';
import { getErrorMessage } from '@/lib/errors';
import { PlanPicker } from '@/components/PlanPicker';
import { CardPaymentFields, type CardDetails } from '@/components/CardPaymentFields';
import { useToast } from '@/components/ToastProvider';
import type { SubscriptionPaymentRequest } from '@/types';

/**
 * Page de paiement forcée : atteinte uniquement via la redirection de ProtectedRoute quand
 * user.subscriptionBlocked est true (abonnement expiré depuis plus de 24h sans renouvellement,
 * voir OwnershipGuard.checkCompanyOperational côté backend). Reprend le formulaire de
 * SubscriptionCard (ProfilePage) mais en page pleine, toujours affichée, sans bouton "gérer".
 */
export function SubscriptionBlockedPage() {
  const { user, clearSubscriptionBlock } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const toast = useToast();

  const [selectedPlan, setSelectedPlan] = useState('');
  const [card, setCard] = useState<CardDetails>({ cardHolder: '', cardNumber: '', cardExpiry: '', cardCvv: '' });
  const [error, setError] = useState<string | null>(null);

  const companyId = user?.companyId ?? null;

  const { data: plans } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: authApi.getSubscriptionPlans,
  });

  const updateMutation = useMutation({
    mutationFn: (payload: SubscriptionPaymentRequest) => companiesApi.updateSubscription(companyId as number, payload),
    onSuccess: () => {
      clearSubscriptionBlock();
      toast.showSuccess(t.profile.subscription.paymentSuccess);
      navigate('/dashboard', { replace: true });
    },
    onError: (err) => setError(getErrorMessage(err, t.profile.subscription.errorPayment)),
  });

  // Accès direct par URL sans être réellement bloqué, ou pas de companyId (ne devrait pas
  // arriver pour un COMPANY authentifié) : rien à faire ici.
  if (!user?.subscriptionBlocked || !companyId) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) {
      setError(t.profile.subscription.errorSelectPlan);
      return;
    }
    setError(null);
    updateMutation.mutate({ plan: selectedPlan, ...card });
  };

  return (
    <div className="page">
      <div className="page__header">
        <h1>{t.subscriptionBlocked.title}</h1>
      </div>

      <div className="alert alert--error" style={{ maxWidth: 640 }}>
        {t.subscriptionBlocked.message}
      </div>

      <form onSubmit={handleSubmit} style={{ maxWidth: 480, marginTop: 24 }}>
        {error && <div className="alert alert--error">{error}</div>}
        <PlanPicker plans={plans} selected={selectedPlan} onSelect={setSelectedPlan} />
        <CardPaymentFields value={card} onChange={(patch) => setCard((c) => ({ ...c, ...patch }))} />
        <button
          className="btn btn--primary btn--block"
          type="submit"
          disabled={updateMutation.isPending}
          style={{ marginTop: 16 }}
        >
          {updateMutation.isPending ? t.profile.subscription.processing : t.subscriptionBlocked.cta}
        </button>
      </form>
    </div>
  );
}

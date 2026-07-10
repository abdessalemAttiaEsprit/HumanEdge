import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { companiesApi } from '@/api/companies';
import { fileUrl } from '@/api/axios';
import { getErrorMessage } from '@/lib/errors';
import { formatDateFr } from '@/lib/format';
import { usePagination } from '@/lib/usePagination';
import { useEscapeKey } from '@/lib/useEscapeKey';
import { IconButton } from '@/components/IconButton';
import { Pagination } from '@/components/Pagination';
import { useToast } from '@/components/ToastProvider';
import type { Company } from '@/types';

export function CompaniesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [viewing, setViewing] = useState<Company | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [forceDeleting, setForceDeleting] = useState<Company | null>(null);
  const [forceConfirmText, setForceConfirmText] = useState('');
  const [forceError, setForceError] = useState<string | null>(null);

  const { data: companies, isLoading, isError } = useQuery({
    queryKey: ['companies'],
    queryFn: companiesApi.list,
  });

  const { data: subscription, isLoading: subscriptionLoading } = useQuery({
    queryKey: ['company-subscription', viewing?.idCompany],
    queryFn: () => companiesApi.getSubscription(viewing!.idCompany),
    enabled: !!viewing,
    retry: false,
  });

  const verifyMutation = useMutation({
    mutationFn: companiesApi.verify,
    onSuccess: (c) => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      setActionError(null);
      toast.showSuccess(`"${c.companyName}" marked as verified.`);
    },
    onError: (err) => {
      const message = getErrorMessage(err, 'Unable to verify this company');
      setActionError(message);
      toast.showError(message);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (c: Company) => (c.active ? companiesApi.deactivate(c.idCompany) : companiesApi.activate(c.idCompany)),
    onSuccess: (c) => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      setActionError(null);
      toast.showSuccess(`"${c.companyName}" ${c.active ? 'activated' : 'deactivated'}.`);
    },
    onError: (err) => {
      const message = getErrorMessage(err, 'Unable to update this company');
      setActionError(message);
      toast.showError(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: companiesApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      setActionError(null);
      toast.showSuccess('Company deleted.');
    },
    onError: (err) => {
      const message = getErrorMessage(err, 'Unable to delete this company');
      setActionError(message);
      toast.showError(message);
    },
  });

  const forceDeleteMutation = useMutation({
    mutationFn: companiesApi.removeCascade,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      setForceDeleting(null);
      setForceConfirmText('');
      setForceError(null);
      toast.showSuccess('Company and all its data were deleted.');
    },
    onError: (err) => setForceError(getErrorMessage(err, 'Unable to delete this company')),
  });

  const filtered = useMemo(() => {
    if (!companies) return [];
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) =>
      [c.companyName, c.fiscalNumber, c.cnssNumber, c.city].filter(Boolean).join(' ').toLowerCase().includes(q),
    );
  }, [companies, search]);

  const { page, setPage, pageCount, pageItems } = usePagination(filtered, 10);

  const handleDelete = (c: Company) => {
    if (!window.confirm(`Delete "${c.companyName}"? This removes the company and cannot be undone.`)) return;
    setActionError(null);
    deleteMutation.mutate(c.idCompany);
  };

  const openForceDelete = (c: Company) => {
    setForceDeleting(c);
    setForceConfirmText('');
    setForceError(null);
  };

  const closeForceDelete = () => {
    setForceDeleting(null);
    setForceConfirmText('');
    setForceError(null);
  };

  const handleForceDeleteSubmit = () => {
    if (!forceDeleting || forceConfirmText !== forceDeleting.companyName) return;
    setForceError(null);
    forceDeleteMutation.mutate(forceDeleting.idCompany);
  };

  useEscapeKey(() => setViewing(null), !!viewing);
  useEscapeKey(closeForceDelete, !!forceDeleting);

  const planLabel = subscription
    ? subscription.plan.charAt(0) + subscription.plan.slice(1).toLowerCase()
    : null;

  return (
    <div>
      <div className="page__header">
        <h1>Companies</h1>
        <p className="page__subtitle">Review, verify and manage registered companies.</p>
      </div>

      <div className="toolbar">
        <input
          className="toolbar__search"
          type="search"
          placeholder="Search by name, fiscal number, city…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {actionError && <div className="alert alert--error">{actionError}</div>}

      {isLoading && <p className="jobs__status">Loading companies…</p>}
      {isError && <p className="jobs__status">Unable to load companies.</p>}
      {!isLoading && !isError && filtered.length === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">No records</span>
          <p>{search ? 'No companies match your search.' : 'No companies registered yet.'}</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Fiscal number</th>
                <th>City</th>
                <th>Verified</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((c) => (
                <tr key={c.idCompany}>
                  <td className="data-table__name-cell">
                    {c.logoUrl ? (
                      <img className="avatar" src={fileUrl(c.logoUrl)} alt={c.companyName} />
                    ) : (
                      <span className="avatar avatar--initials">{c.companyName.slice(0, 1)}</span>
                    )}
                    {c.companyName}
                  </td>
                  <td>{c.fiscalNumber}</td>
                  <td>{c.city || '—'}</td>
                  <td>
                    {c.verified ? (
                      <span className="badge badge--soft">Verified</span>
                    ) : (
                      <span className="badge badge--muted">Pending</span>
                    )}
                  </td>
                  <td>
                    {c.active ? (
                      <span className="badge badge--soft">Active</span>
                    ) : (
                      <span className="badge badge--muted">Inactive</span>
                    )}
                  </td>
                  <td className="data-table__actions">
                    <IconButton icon="👁️" label="View details" onClick={() => setViewing(c)} />
                    {!c.verified && (
                      <IconButton
                        icon="✅"
                        label="Mark as verified"
                        onClick={() => verifyMutation.mutate(c.idCompany)}
                        disabled={verifyMutation.isPending}
                      />
                    )}
                    <IconButton
                      icon={c.active ? '🔒' : '🔓'}
                      label={c.active ? 'Deactivate' : 'Activate'}
                      onClick={() => toggleActiveMutation.mutate(c)}
                      disabled={toggleActiveMutation.isPending}
                    />
                    <IconButton
                      icon="🗑️"
                      label="Delete"
                      variant="danger"
                      onClick={() => handleDelete(c)}
                      disabled={deleteMutation.isPending}
                    />
                    <IconButton
                      icon="💣"
                      label="Force delete (cascade — also wipes users, personnel, contracts, payments…)"
                      variant="danger"
                      onClick={() => openForceDelete(c)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />

      {viewing && (
        <div className="modal-overlay" onClick={() => setViewing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{viewing.companyName}</h2>

            <div className="fieldset">
              <div className="field-row">
                <label className="field">
                  <span>Fiscal number</span>
                  <input value={viewing.fiscalNumber} disabled />
                </label>
                <label className="field">
                  <span>CNSS number</span>
                  <input value={viewing.cnssNumber} disabled />
                </label>
              </div>
              <label className="field">
                <span>Bank account number (RIB)</span>
                <input value={viewing.rib} disabled />
              </label>
              <div className="field-row">
                <label className="field">
                  <span>Phone</span>
                  <input value={viewing.phone || '—'} disabled />
                </label>
                <label className="field">
                  <span>City</span>
                  <input value={viewing.city || '—'} disabled />
                </label>
              </div>
              <label className="field">
                <span>Address</span>
                <input value={viewing.address || '—'} disabled />
              </label>
              {viewing.createdAt && (
                <p className="field-hint">Registered on {formatDateFr(viewing.createdAt)}</p>
              )}
            </div>

            <h3 className="chart-card__title">Subscription</h3>
            {subscriptionLoading && <p className="field-hint">Loading…</p>}
            {!subscriptionLoading && subscription && (
              <p className="field-hint">
                Plan: <strong>{planLabel}</strong> — {subscription.amount.toFixed(0)} {subscription.currency}/mo
                {subscription.periodEnd && ` — active until ${formatDateFr(subscription.periodEnd)}`}
              </p>
            )}
            {!subscriptionLoading && !subscription && (
              <p className="field-hint">No subscription on file.</p>
            )}

            <div className="modal__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setViewing(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {forceDeleting && (
        <div className="modal-overlay" onClick={closeForceDelete}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Force delete "{forceDeleting.companyName}"</h2>

            {forceError && <div className="alert alert--error">{forceError}</div>}

            <div className="alert alert--error">
              This permanently deletes the company <strong>and everything attached to it</strong>:
              its user accounts (owner + employees), personnel records, contracts, absences,
              payments, subscription and job postings (with their applications/interviews).
              This cannot be undone.
            </div>

            <label className="field">
              <span>
                Type <strong>{forceDeleting.companyName}</strong> to confirm
              </span>
              <input
                value={forceConfirmText}
                onChange={(e) => setForceConfirmText(e.target.value)}
                autoFocus
              />
            </label>

            <div className="modal__actions">
              <button type="button" className="btn btn--ghost" onClick={closeForceDelete}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={handleForceDeleteSubmit}
                disabled={forceConfirmText !== forceDeleting.companyName || forceDeleteMutation.isPending}
              >
                {forceDeleteMutation.isPending ? 'Deleting…' : 'Delete everything'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

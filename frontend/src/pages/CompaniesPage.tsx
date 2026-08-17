import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bomb, CheckCircle2, Download, Eye, Lock, Trash2, Unlock } from 'lucide-react';
import { companiesApi } from '@/api/companies';
import { fileUrl } from '@/api/axios';
import { useLanguage } from '@/i18n/useLanguage';
import { getErrorMessage } from '@/lib/errors';
import { formatDateFr } from '@/lib/format';
import { usePagination } from '@/lib/usePagination';
import { useEscapeKey } from '@/lib/useEscapeKey';
import { useConfirm } from '@/lib/useConfirm';
import { useSort } from '@/lib/useSort';
import { Pagination } from '@/components/Pagination';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TableSkeleton } from '@/components/TableSkeleton';
import { SortableTh } from '@/components/SortableTh';
import { RowActionsMenu } from '@/components/RowActionsMenu';
import { useToast } from '@/components/ToastProvider';
import type { Company } from '@/types';

type CompanySortKey = 'name' | 'fiscal' | 'city' | 'verified' | 'active';

function getCompanySortValue(c: Company, key: CompanySortKey): string | number {
  switch (key) {
    case 'name':
      return c.companyName ?? '';
    case 'fiscal':
      return c.fiscalNumber ?? '';
    case 'city':
      return c.city ?? '';
    case 'verified':
      return c.verified ? 1 : 0;
    case 'active':
      return c.active ? 1 : 0;
  }
}

export function CompaniesPage() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { confirmOptions, requestConfirm, closeConfirm, handleConfirm } = useConfirm();

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
      toast.showSuccess(t.companies.verifiedSuccess(c.companyName));
    },
    onError: (err) => {
      const message = getErrorMessage(err, t.companies.errorVerify);
      setActionError(message);
      toast.showError(message);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (c: Company) => (c.active ? companiesApi.deactivate(c.idCompany) : companiesApi.activate(c.idCompany)),
    onSuccess: (c) => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      setActionError(null);
      toast.showSuccess(c.active ? t.companies.activatedSuccess(c.companyName) : t.companies.deactivatedSuccess(c.companyName));
    },
    onError: (err) => {
      const message = getErrorMessage(err, t.companies.errorUpdate);
      setActionError(message);
      toast.showError(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: companiesApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      setActionError(null);
      toast.showSuccess(t.companies.deletedSuccess);
    },
    onError: (err) => {
      const message = getErrorMessage(err, t.companies.errorDelete);
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
      toast.showSuccess(t.companies.forceDeletedSuccess);
    },
    onError: (err) => setForceError(getErrorMessage(err, t.companies.errorDelete)),
  });

  const filtered = useMemo(() => {
    if (!companies) return [];
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) =>
      [c.companyName, c.fiscalNumber, c.cnssNumber, c.city].filter(Boolean).join(' ').toLowerCase().includes(q),
    );
  }, [companies, search]);

  const { sorted, sortKey, direction, toggleSort } = useSort<Company, CompanySortKey>(filtered, getCompanySortValue);
  const { page, setPage, pageCount, pageItems } = usePagination(sorted, 10);

  const handleDelete = (c: Company) => {
    requestConfirm({
      title: t.companies.deleteTitle,
      message: t.companies.deleteMessage(c.companyName),
      confirmLabel: t.companies.delete,
      variant: 'danger',
      onConfirm: () => {
        setActionError(null);
        deleteMutation.mutate(c.idCompany);
      },
    });
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
        <h1>{t.companies.title}</h1>
        <p className="page__subtitle">{t.companies.subtitle}</p>
      </div>

      <div className="toolbar">
        <input
          className="toolbar__search"
          type="search"
          placeholder={t.companies.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn btn--ghost" onClick={() => companiesApi.exportCsv()}>
          <Download size={16} aria-hidden="true" />
          {t.companies.exportCsv}
        </button>
      </div>

      {actionError && <div className="alert alert--error">{actionError}</div>}

      {isLoading && <TableSkeleton columns={6} />}
      {isError && <p className="jobs__status">{t.companies.errorLoad}</p>}
      {!isLoading && !isError && filtered.length === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">{t.common.noRecords}</span>
          <p>{search ? t.companies.noneMatchSearch : t.companies.noneYet}</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <SortableTh label={t.companies.columnCompany} sortKey="name" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh label={t.companies.columnFiscalNumber} sortKey="fiscal" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh label={t.companies.columnCity} sortKey="city" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh label={t.companies.columnVerified} sortKey="verified" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh label={t.companies.columnStatus} sortKey="active" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((c) => (
                <tr key={c.idCompany}>
                  <td className="data-table__name-cell" data-label={t.companies.columnCompany}>
                    {c.logoUrl ? (
                      <img className="avatar" src={fileUrl(c.logoUrl)} alt={c.companyName} />
                    ) : (
                      <span className="avatar avatar--initials">{c.companyName.slice(0, 1)}</span>
                    )}
                    {c.companyName}
                  </td>
                  <td data-label={t.companies.columnFiscalNumber}>{c.fiscalNumber}</td>
                  <td data-label={t.companies.columnCity}>{c.city || '—'}</td>
                  <td data-label={t.companies.columnVerified}>
                    {c.verified ? (
                      <span className="badge badge--success">{t.companies.verified}</span>
                    ) : (
                      <span className="badge badge--warning">{t.companies.pending}</span>
                    )}
                  </td>
                  <td data-label={t.companies.columnStatus}>
                    {c.active ? (
                      <span className="badge badge--success">{t.companies.active}</span>
                    ) : (
                      <span className="badge badge--muted">{t.companies.inactive}</span>
                    )}
                  </td>
                  <td className="data-table__actions" data-label="">
                    <RowActionsMenu
                      ariaLabel={`Actions for ${c.companyName}`}
                      items={[
                        { label: t.companies.viewDetails, icon: <Eye size={15} aria-hidden="true" />, onClick: () => setViewing(c) },
                        ...(c.verified
                          ? []
                          : [
                              {
                                label: t.companies.markAsVerified,
                                icon: <CheckCircle2 size={15} aria-hidden="true" />,
                                disabled: verifyMutation.isPending,
                                onClick: () => verifyMutation.mutate(c.idCompany),
                              },
                            ]),
                        {
                          label: c.active ? t.companies.deactivate : t.companies.activate,
                          icon: c.active ? <Lock size={15} aria-hidden="true" /> : <Unlock size={15} aria-hidden="true" />,
                          disabled: toggleActiveMutation.isPending,
                          onClick: () => toggleActiveMutation.mutate(c),
                        },
                        {
                          label: t.companies.delete,
                          icon: <Trash2 size={15} aria-hidden="true" />,
                          danger: true,
                          disabled: deleteMutation.isPending,
                          onClick: () => handleDelete(c),
                        },
                        {
                          label: t.companies.forceDeleteCascade,
                          icon: <Bomb size={15} aria-hidden="true" />,
                          danger: true,
                          onClick: () => openForceDelete(c),
                        },
                      ]}
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
                  <span>{t.companies.fiscalNumber}</span>
                  <input value={viewing.fiscalNumber} disabled />
                </label>
                <label className="field">
                  <span>{t.companies.cnssNumber}</span>
                  <input value={viewing.cnssNumber} disabled />
                </label>
              </div>
              <label className="field">
                <span>{t.companies.rib}</span>
                <input value={viewing.rib} disabled />
              </label>
              <div className="field-row">
                <label className="field">
                  <span>{t.companies.phone}</span>
                  <input value={viewing.phone || '—'} disabled />
                </label>
                <label className="field">
                  <span>{t.companies.city}</span>
                  <input value={viewing.city || '—'} disabled />
                </label>
              </div>
              <label className="field">
                <span>{t.companies.address}</span>
                <input value={viewing.address || '—'} disabled />
              </label>
              {viewing.createdAt && (
                <p className="field-hint">{t.companies.registeredOn(formatDateFr(viewing.createdAt))}</p>
              )}
            </div>

            <h3 className="chart-card__title">{t.companies.subscription}</h3>
            {subscriptionLoading && <p className="field-hint">{t.companies.loading}</p>}
            {!subscriptionLoading && subscription && (
              <p className="field-hint">
                {t.companies.plan(planLabel ?? '—')} — {subscription.amount.toFixed(0)} {subscription.currency}/mo
                {subscription.periodEnd && ` — ${t.companies.activeUntil(formatDateFr(subscription.periodEnd))}`}
              </p>
            )}
            {!subscriptionLoading && !subscription && (
              <p className="field-hint">{t.companies.noSubscription}</p>
            )}

            <div className="modal__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setViewing(null)}>
                {t.companies.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {forceDeleting && (
        <div className="modal-overlay" onClick={closeForceDelete}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t.companies.forceDeleteTitle(forceDeleting.companyName)}</h2>

            {forceError && <div className="alert alert--error">{forceError}</div>}

            <div className="alert alert--error">{t.companies.forceDeleteWarning}</div>

            <label className="field">
              <span>{t.companies.forceDeleteConfirmLabel(forceDeleting.companyName)}</span>
              <input
                value={forceConfirmText}
                onChange={(e) => setForceConfirmText(e.target.value)}
                autoFocus
              />
            </label>

            <div className="modal__actions">
              <button type="button" className="btn btn--ghost" onClick={closeForceDelete}>
                {t.companies.cancel}
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={handleForceDeleteSubmit}
                disabled={forceConfirmText !== forceDeleting.companyName || forceDeleteMutation.isPending}
              >
                {forceDeleteMutation.isPending ? t.companies.deleting : t.companies.deleteEverything}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog options={confirmOptions} onConfirm={handleConfirm} onCancel={closeConfirm} />
    </div>
  );
}

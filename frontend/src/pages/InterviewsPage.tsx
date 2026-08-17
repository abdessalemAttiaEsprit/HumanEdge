import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { Trash2, UserPlus } from 'lucide-react';
import { interviewsApi } from '@/api/interviews';
import { candidatesApi } from '@/api/candidates';
import { useAuth } from '@/auth/useAuth';
import { useLanguage } from '@/i18n/useLanguage';
import { getErrorMessage } from '@/lib/errors';
import { useConfirm } from '@/lib/useConfirm';
import { useSort } from '@/lib/useSort';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TableSkeleton } from '@/components/TableSkeleton';
import { SortableTh } from '@/components/SortableTh';
import { RowActionsMenu } from '@/components/RowActionsMenu';
import { InterviewCalendar } from '@/components/InterviewCalendar';
import { useToast } from '@/components/ToastProvider';
import type { Interview, InterviewStatus } from '@/types';

const STATUS_OPTIONS: InterviewStatus[] = ['SCHEDULED', 'COMPLETED', 'CANCELLED'];

function candidateName(iv: Interview): string {
  const c = iv.candidate;
  if (!c) return '—';
  return [c.firstName, c.lastName].filter(Boolean).join(' ') || '—';
}

function formatDateTime(v?: string): string {
  return v ? v.replace('T', ' ').slice(0, 16) : '—';
}

function interviewStatusBadgeClass(status?: string): string {
  if (status === 'COMPLETED') return 'badge badge--success';
  if (status === 'CANCELLED') return 'badge badge--danger';
  return 'badge badge--soft';
}

type InterviewSortKey = 'candidate' | 'job' | 'date' | 'location' | 'status';

function getInterviewSortValue(iv: Interview, key: InterviewSortKey): string | number {
  switch (key) {
    case 'candidate':
      return candidateName(iv);
    case 'job':
      return iv.job?.title ?? '';
    case 'date':
      return iv.interviewDate ?? '';
    case 'location':
      return iv.interviewLocation ?? '';
    case 'status':
      return iv.status ?? '';
  }
}

export function InterviewsPage() {
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'COMPANY';
  return canManage ? <ManageInterviews /> : <MyInterviews />;
}

// ============================================================================
// GUEST: read-only list of the candidate's own interviews.
// ============================================================================
function MyInterviews() {
  const { t } = useLanguage();
  const { data: me, isLoading: meLoading, error: meError } = useQuery({
    queryKey: ['candidate', 'me'],
    queryFn: candidatesApi.getMine,
    retry: false,
  });
  const hasProfile = !(meError instanceof AxiosError && meError.response?.status === 404);

  const { data: interviews, isLoading, isError } = useQuery({
    queryKey: ['interviews', 'by-candidate', me?.id],
    queryFn: () => interviewsApi.listByCandidate(me!.id),
    enabled: !!me,
  });

  const sorted = useMemo(
    () => [...(interviews ?? [])].sort((a, b) => (b.interviewDate ?? '').localeCompare(a.interviewDate ?? '')),
    [interviews],
  );

  if (meLoading) return <p className="jobs__status">{t.interviews.my.loading}</p>;

  if (!hasProfile) {
    return (
      <div>
        <div className="page__header">
          <h1>{t.interviews.my.title}</h1>
        </div>
        <div className="placeholder-box">
          <span className="placeholder-box__badge">{t.interviews.my.profileRequired}</span>
          <p>
            {t.interviews.my.profileRequiredPrefix} <Link to="/candidates">{t.interviews.my.candidateProfile}</Link>{' '}
            {t.interviews.my.profileRequiredSuffix}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page__header">
        <h1>{t.interviews.my.title}</h1>
        <p className="page__subtitle">{t.interviews.my.subtitle}</p>
      </div>

      {isLoading && <TableSkeleton columns={5} />}
      {isError && <p className="jobs__status">{t.interviews.my.errorLoad}</p>}

      {!isLoading && !isError && sorted.length === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">{t.common.noRecords}</span>
          <p>{t.interviews.my.noneYet}</p>
        </div>
      )}

      {!isLoading && sorted.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.interviews.my.columnJob}</th>
                <th>{t.interviews.my.columnCompany}</th>
                <th>{t.interviews.my.columnDateTime}</th>
                <th>{t.interviews.my.columnLocation}</th>
                <th>{t.interviews.my.columnStatus}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((iv) => (
                <tr key={iv.id}>
                  <td data-label={t.interviews.my.columnJob}>{iv.job?.title || '—'}</td>
                  <td data-label={t.interviews.my.columnCompany}>{iv.job?.createdByCompany?.companyName || '—'}</td>
                  <td data-label={t.interviews.my.columnDateTime}>{formatDateTime(iv.interviewDate)}</td>
                  <td data-label={t.interviews.my.columnLocation}>{iv.interviewLocation || '—'}</td>
                  <td data-label={t.interviews.my.columnStatus}>
                    <span className={interviewStatusBadgeClass(iv.status)}>
                      {iv.status ? t.interviewStatus[iv.status as InterviewStatus] ?? iv.status : '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sorted.length > 0 && <InterviewCalendar interviews={sorted} />}
    </div>
  );
}

// ============================================================================
// ADMIN / COMPANY: manage scheduled interviews (new interviews are scheduled
// from the Applications page, which needs an application to attach them to).
// ============================================================================
function ManageInterviews() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const { confirmOptions, requestConfirm, closeConfirm, handleConfirm } = useConfirm();
  const [search, setSearch] = useState('');

  const { data: interviews, isLoading, isError } = useQuery({
    queryKey: ['interviews'],
    queryFn: interviewsApi.list,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: InterviewStatus }) => interviewsApi.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interviews'] });
      toast.showSuccess(t.interviews.manage.statusUpdatedSuccess);
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.interviews.manage.errorStatus)),
  });

  const deleteMutation = useMutation({
    mutationFn: interviewsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interviews'] });
      toast.showSuccess(t.interviews.manage.deletedSuccess);
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.interviews.manage.errorDelete)),
  });

  const filtered = useMemo(() => {
    if (!interviews) return [];
    const q = search.trim().toLowerCase();
    if (!q) return interviews;
    return interviews.filter((iv) =>
      [candidateName(iv), iv.job?.title, iv.status].filter(Boolean).join(' ').toLowerCase().includes(q),
    );
  }, [interviews, search]);

  const { sorted, sortKey, direction, toggleSort } = useSort<Interview, InterviewSortKey>(
    filtered,
    getInterviewSortValue,
  );

  const handleDelete = (iv: Interview) => {
    requestConfirm({
      title: t.interviews.manage.deleteTitle,
      message: t.interviews.manage.deleteMessage(candidateName(iv), iv.job?.title ?? ''),
      confirmLabel: t.interviews.manage.delete,
      variant: 'danger',
      onConfirm: () => deleteMutation.mutate(iv.id),
    });
  };

  const handleAddAsEmployee = (iv: Interview) => {
    navigate('/personnel', {
      state: {
        prefillCandidate: {
          firstname: iv.candidate?.firstName ?? '',
          lastname: iv.candidate?.lastName ?? '',
          email: iv.candidate?.email ?? '',
          telephone: iv.candidate?.phoneNumber ?? '',
          cin: iv.candidate?.cin ?? '',
          companyId: iv.job?.createdByCompany?.idCompany,
        },
      },
    });
  };

  return (
    <div>
      <div className="page__header">
        <h1>{t.interviews.manage.title}</h1>
        <p className="page__subtitle">
          {t.interviews.manage.subtitlePrefix} <Link to="/applications">{t.interviews.manage.applicationsLink}</Link>{' '}
          {t.interviews.manage.subtitleSuffix}
        </p>
      </div>

      <div className="toolbar">
        <input
          className="toolbar__search"
          type="search"
          placeholder={t.interviews.manage.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && <TableSkeleton columns={6} />}
      {isError && <p className="jobs__status">{t.interviews.manage.errorLoad}</p>}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">{t.common.noRecords}</span>
          <p>{search ? t.interviews.manage.noneMatchSearch : t.interviews.manage.noneYet}</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <SortableTh
                  label={t.interviews.manage.columnCandidate}
                  sortKey="candidate"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={toggleSort}
                />
                <SortableTh label={t.interviews.manage.columnJob} sortKey="job" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh label={t.interviews.manage.columnDateTime} sortKey="date" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh
                  label={t.interviews.manage.columnLocation}
                  sortKey="location"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={toggleSort}
                />
                <SortableTh label={t.interviews.manage.columnStatus} sortKey="status" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((iv) => (
                <tr key={iv.id}>
                  <td data-label={t.interviews.manage.columnCandidate}>{candidateName(iv)}</td>
                  <td data-label={t.interviews.manage.columnJob}>{iv.job?.title || '—'}</td>
                  <td data-label={t.interviews.manage.columnDateTime}>{formatDateTime(iv.interviewDate)}</td>
                  <td data-label={t.interviews.manage.columnLocation}>{iv.interviewLocation || '—'}</td>
                  <td data-label={t.interviews.manage.columnStatus}>
                    <select
                      className="table-select"
                      aria-label={`Status for the interview with ${candidateName(iv)}`}
                      value={iv.status ?? 'SCHEDULED'}
                      onChange={(e) => statusMutation.mutate({ id: iv.id, status: e.target.value as InterviewStatus })}
                      disabled={statusMutation.isPending}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {t.interviewStatus[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="data-table__actions" data-label="">
                    <RowActionsMenu
                      ariaLabel={`Actions for the interview with ${candidateName(iv)}`}
                      items={[
                        ...(iv.status === 'COMPLETED'
                          ? [
                              {
                                label: t.interviews.manage.addAsEmployee,
                                icon: <UserPlus size={15} aria-hidden="true" />,
                                onClick: () => handleAddAsEmployee(iv),
                              },
                            ]
                          : []),
                        {
                          label: t.interviews.manage.delete,
                          icon: <Trash2 size={15} aria-hidden="true" />,
                          danger: true,
                          disabled: deleteMutation.isPending,
                          onClick: () => handleDelete(iv),
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

      {filtered.length > 0 && <InterviewCalendar interviews={sorted} />}

      <ConfirmDialog options={confirmOptions} onConfirm={handleConfirm} onCancel={closeConfirm} />
    </div>
  );
}

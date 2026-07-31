import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { interviewsApi } from '@/api/interviews';
import { candidatesApi } from '@/api/candidates';
import { useAuth } from '@/auth/useAuth';
import { getErrorMessage } from '@/lib/errors';
import { useConfirm } from '@/lib/useConfirm';
import { useSort } from '@/lib/useSort';
import { IconButton } from '@/components/IconButton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TableSkeleton } from '@/components/TableSkeleton';
import { SortableTh } from '@/components/SortableTh';
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

  if (meLoading) return <p className="jobs__status">Loading…</p>;

  if (!hasProfile) {
    return (
      <div>
        <div className="page__header">
          <h1>My interviews</h1>
        </div>
        <div className="placeholder-box">
          <span className="placeholder-box__badge">Profile required</span>
          <p>
            Create your <Link to="/candidates">candidate profile</Link> first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page__header">
        <h1>My interviews</h1>
        <p className="page__subtitle">Upcoming and past interviews for your applications.</p>
      </div>

      {isLoading && <TableSkeleton columns={5} />}
      {isError && <p className="jobs__status">Unable to load your interviews.</p>}

      {!isLoading && !isError && sorted.length === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">No records</span>
          <p>No interviews scheduled yet.</p>
        </div>
      )}

      {!isLoading && sorted.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Company</th>
                <th>Date &amp; time</th>
                <th>Location</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((iv) => (
                <tr key={iv.id}>
                  <td data-label="Job">{iv.job?.title || '—'}</td>
                  <td data-label="Company">{iv.job?.createdByCompany?.companyName || '—'}</td>
                  <td data-label="Date & time">{formatDateTime(iv.interviewDate)}</td>
                  <td data-label="Location">{iv.interviewLocation || '—'}</td>
                  <td data-label="Status">
                    <span className={interviewStatusBadgeClass(iv.status)}>{iv.status || '—'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ADMIN / COMPANY: manage scheduled interviews (new interviews are scheduled
// from the Applications page, which needs an application to attach them to).
// ============================================================================
function ManageInterviews() {
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
      toast.showSuccess('Interview status updated.');
    },
    onError: (err) => toast.showError(getErrorMessage(err, 'Unable to update the interview status')),
  });

  const deleteMutation = useMutation({
    mutationFn: interviewsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interviews'] });
      toast.showSuccess('Interview deleted.');
    },
    onError: (err) => toast.showError(getErrorMessage(err, 'Unable to delete the interview')),
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
      title: 'Delete interview',
      message: `Delete the interview with ${candidateName(iv)} for "${iv.job?.title}"?`,
      confirmLabel: 'Delete',
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
        <h1>Interviews</h1>
        <p className="page__subtitle">
          All scheduled interviews. New interviews are scheduled from the{' '}
          <Link to="/applications">Applications</Link> page.
        </p>
      </div>

      <div className="toolbar">
        <input
          className="toolbar__search"
          type="search"
          placeholder="Search by candidate, job, status…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && <TableSkeleton columns={6} />}
      {isError && <p className="jobs__status">Unable to load interviews.</p>}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">No records</span>
          <p>{search ? 'No interviews match your search.' : 'No interviews scheduled yet.'}</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <SortableTh
                  label="Candidate"
                  sortKey="candidate"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={toggleSort}
                />
                <SortableTh label="Job" sortKey="job" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh label="Date & time" sortKey="date" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableTh
                  label="Location"
                  sortKey="location"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={toggleSort}
                />
                <SortableTh label="Status" sortKey="status" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((iv) => (
                <tr key={iv.id}>
                  <td data-label="Candidate">{candidateName(iv)}</td>
                  <td data-label="Job">{iv.job?.title || '—'}</td>
                  <td data-label="Date & time">{formatDateTime(iv.interviewDate)}</td>
                  <td data-label="Location">{iv.interviewLocation || '—'}</td>
                  <td data-label="Status">
                    <select
                      className="table-select"
                      aria-label={`Status for the interview with ${candidateName(iv)}`}
                      value={iv.status ?? 'SCHEDULED'}
                      onChange={(e) => statusMutation.mutate({ id: iv.id, status: e.target.value as InterviewStatus })}
                      disabled={statusMutation.isPending}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="data-table__actions" data-label="">
                    {iv.status === 'COMPLETED' && (
                      <IconButton
                        icon="➕"
                        label="Suggestion: add this candidate as an employee"
                        onClick={() => handleAddAsEmployee(iv)}
                      />
                    )}
                    <IconButton
                      icon="🗑️"
                      label="Delete"
                      variant="danger"
                      onClick={() => handleDelete(iv)}
                      disabled={deleteMutation.isPending}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog options={confirmOptions} onConfirm={handleConfirm} onCancel={closeConfirm} />
    </div>
  );
}

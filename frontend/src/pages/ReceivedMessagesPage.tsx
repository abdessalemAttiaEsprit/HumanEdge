import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip } from 'lucide-react';
import { messagesApi } from '@/api/messages';
import { useLanguage } from '@/i18n/useLanguage';
import { getErrorMessage } from '@/lib/errors';
import { timeAgo } from '@/components/NotificationBell';
import { useToast } from '@/components/ToastProvider';
import type { EmployeeMessage, MessageCategory } from '@/types';

const MESSAGE_CATEGORIES: MessageCategory[] = ['DOCUMENT_REQUEST', 'WORK_ORGANIZATION', 'CAREER_DEVELOPMENT', 'OTHER'];

interface Thread {
  employeeUserId: number;
  employeeName: string;
  messages: EmployeeMessage[];
}

/** Groups the flat conversation list into one thread per employee — every message either comes
 * from that employee or targets them (a company reply always sets `recipient`). */
function buildThreads(messages: EmployeeMessage[]): Thread[] {
  const byEmployee = new Map<number, Thread>();
  messages.forEach((m) => {
    const employee = m.sender?.role === 'EMPLOYE' ? m.sender : m.recipient;
    if (!employee) return;
    let thread = byEmployee.get(employee.idUser);
    if (!thread) {
      thread = { employeeUserId: employee.idUser, employeeName: `${employee.firstname} ${employee.lastname}`.trim(), messages: [] };
      byEmployee.set(employee.idUser, thread);
    }
    thread.messages.push(m);
  });
  const threads = [...byEmployee.values()];
  threads.forEach((th) => th.messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  threads.sort((a, b) => {
    const aLast = a.messages[a.messages.length - 1]?.createdAt ?? '';
    const bLast = b.messages[b.messages.length - 1]?.createdAt ?? '';
    return bLast.localeCompare(aLast);
  });
  return threads;
}

/** Boîte de réception COMPANY : conversation par employé (leurs messages + vos réponses), voir DashboardPage#EmployeeDashboard côté employé. */
export function ReceivedMessagesPage() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [files, setFiles] = useState<Record<number, File | null>>({});
  const [fileInputKey, setFileInputKey] = useState<Record<number, number>>({});
  const [categoryFilter, setCategoryFilter] = useState<MessageCategory | 'ALL'>('ALL');

  const { data: messages, isLoading, isError } = useQuery({
    queryKey: ['messages', 'received'],
    queryFn: messagesApi.listReceived,
  });

  const allThreads = useMemo(() => buildThreads(messages ?? []), [messages]);
  const threads = useMemo(
    () =>
      categoryFilter === 'ALL'
        ? allThreads
        : allThreads.filter((th) => th.messages.some((m) => m.category === categoryFilter)),
    [allThreads, categoryFilter],
  );

  // Stats calculées sur l'ensemble non filtré (les messages initiés par un employé uniquement —
  // les réponses de l'entreprise n'ont pas de catégorie, voir Message.category côté backend).
  const stats = useMemo(() => {
    const counts: Record<MessageCategory, number> = {
      DOCUMENT_REQUEST: 0,
      WORK_ORGANIZATION: 0,
      CAREER_DEVELOPMENT: 0,
      OTHER: 0,
    };
    let total = 0;
    (messages ?? []).forEach((m) => {
      if (m.sender?.role === 'EMPLOYE') {
        total += 1;
        if (m.category) counts[m.category] += 1;
      }
    });
    return { total, counts };
  }, [messages]);

  const replyMutation = useMutation({
    mutationFn: ({ employeeUserId, content, file }: { employeeUserId: number; content: string; file: File | null }) =>
      messagesApi.reply(employeeUserId, content, file),
    onSuccess: (_sent, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages', 'received'] });
      setDrafts((d) => ({ ...d, [variables.employeeUserId]: '' }));
      setFiles((f) => ({ ...f, [variables.employeeUserId]: null }));
      setFileInputKey((k) => ({ ...k, [variables.employeeUserId]: (k[variables.employeeUserId] ?? 0) + 1 }));
      toast.showSuccess(t.receivedMessages.replySuccess);
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.receivedMessages.errorReply)),
  });

  const handleReplySubmit = (e: FormEvent, employeeUserId: number) => {
    e.preventDefault();
    const content = (drafts[employeeUserId] ?? '').trim();
    if (!content) return;
    replyMutation.mutate({ employeeUserId, content, file: files[employeeUserId] ?? null });
  };

  return (
    <div>
      <div className="page__header">
        <h1>{t.receivedMessages.title}</h1>
        <p className="page__subtitle">{t.receivedMessages.subtitle}</p>
      </div>

      {!isLoading && !isError && (messages ?? []).length > 0 && (
        <div className="stat-grid">
          <div className="stat-tile">
            <span className="stat-tile__label">{t.receivedMessages.statTotal}</span>
            <span className="stat-tile__value">{stats.total}</span>
          </div>
          {MESSAGE_CATEGORIES.map((c) => (
            <div className="stat-tile" key={c}>
              <span className="stat-tile__label">{t.messageCategory[c]}</span>
              <span className="stat-tile__value">{stats.counts[c]}</span>
            </div>
          ))}
        </div>
      )}

      {!isLoading && !isError && (messages ?? []).length > 0 && (
        <div className="toolbar">
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as MessageCategory | 'ALL')}>
            <option value="ALL">{t.receivedMessages.allCategories}</option>
            {MESSAGE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t.messageCategory[c]}
              </option>
            ))}
          </select>
        </div>
      )}

      {isLoading && <p className="jobs__status">{t.receivedMessages.loading}</p>}
      {isError && <p className="jobs__status">{t.receivedMessages.errorLoad}</p>}

      {!isLoading && !isError && threads.length === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">{t.common.noRecords}</span>
          <p>{t.receivedMessages.noneYet}</p>
        </div>
      )}

      {!isLoading && !isError && threads.length > 0 && (
        <div className="message-space">
          {threads.map((th) => (
            <div className="chart-card" key={th.employeeUserId}>
              <h2 className="chart-card__title">{th.employeeName}</h2>
              <ul className="message-list">
                {th.messages.map((m) => {
                  const fromUs = m.sender?.role === 'COMPANY';
                  return (
                    <li key={m.id} className={`message-list__item${fromUs ? ' message-list__item--reply' : ''}`}>
                      {fromUs && <span className="message-list__from">{t.receivedMessages.youLabel}</span>}
                      {!fromUs && m.category && <span className="badge badge--muted">{t.messageCategory[m.category]}</span>}
                      <p className="message-list__content">{m.content}</p>
                      {m.attachment && (
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => messagesApi.downloadAttachment(m.id, m.attachment)}
                        >
                          <Paperclip size={14} aria-hidden="true" />
                          {t.receivedMessages.downloadAttachment}
                        </button>
                      )}
                      <span className="message-list__time">{timeAgo(m.createdAt, t)}</span>
                    </li>
                  );
                })}
              </ul>
              <form className="message-reply" onSubmit={(e) => handleReplySubmit(e, th.employeeUserId)}>
                <input
                  type="text"
                  value={drafts[th.employeeUserId] ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [th.employeeUserId]: e.target.value }))}
                  placeholder={t.receivedMessages.replyPlaceholder}
                  maxLength={1000}
                />
                <input
                  key={fileInputKey[th.employeeUserId] ?? 0}
                  type="file"
                  className="message-reply__file"
                  onChange={(e) => setFiles((f) => ({ ...f, [th.employeeUserId]: e.target.files?.[0] ?? null }))}
                />
                <button
                  type="submit"
                  className="btn btn--primary btn--sm"
                  disabled={!(drafts[th.employeeUserId] ?? '').trim() || replyMutation.isPending}
                >
                  {t.receivedMessages.reply}
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { messagesApi } from '@/api/messages';
import { useLanguage } from '@/i18n/useLanguage';
import { getErrorMessage } from '@/lib/errors';
import { timeAgo } from '@/components/NotificationBell';
import { useToast } from '@/components/ToastProvider';
import type { EmployeeMessage } from '@/types';

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

  const { data: messages, isLoading, isError } = useQuery({
    queryKey: ['messages', 'received'],
    queryFn: messagesApi.listReceived,
  });

  const threads = useMemo(() => buildThreads(messages ?? []), [messages]);

  const replyMutation = useMutation({
    mutationFn: ({ employeeUserId, content }: { employeeUserId: number; content: string }) =>
      messagesApi.reply(employeeUserId, { content }),
    onSuccess: (_sent, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages', 'received'] });
      setDrafts((d) => ({ ...d, [variables.employeeUserId]: '' }));
      toast.showSuccess(t.receivedMessages.replySuccess);
    },
    onError: (err) => toast.showError(getErrorMessage(err, t.receivedMessages.errorReply)),
  });

  const handleReplySubmit = (e: FormEvent, employeeUserId: number) => {
    e.preventDefault();
    const content = (drafts[employeeUserId] ?? '').trim();
    if (!content) return;
    replyMutation.mutate({ employeeUserId, content });
  };

  return (
    <div>
      <div className="page__header">
        <h1>{t.receivedMessages.title}</h1>
        <p className="page__subtitle">{t.receivedMessages.subtitle}</p>
      </div>

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
                      <p className="message-list__content">{m.content}</p>
                      <span className="message-list__time">{timeAgo(m.createdAt, t)}</span>
                    </li>
                  );
                })}
              </ul>
              <form className="message-reply" onSubmit={(e) => handleReplySubmit(e, th.employeeUserId)}>
                <input
                  value={drafts[th.employeeUserId] ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [th.employeeUserId]: e.target.value }))}
                  placeholder={t.receivedMessages.replyPlaceholder}
                  maxLength={1000}
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

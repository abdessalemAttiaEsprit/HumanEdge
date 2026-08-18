import { useQuery } from '@tanstack/react-query';
import { messagesApi } from '@/api/messages';
import { useLanguage } from '@/i18n/useLanguage';
import { timeAgo } from '@/components/NotificationBell';

/** Boîte de réception COMPANY : messages envoyés par ses employés (voir DashboardPage#EmployeeDashboard). */
export function ReceivedMessagesPage() {
  const { t } = useLanguage();

  const { data: messages, isLoading, isError } = useQuery({
    queryKey: ['messages', 'received'],
    queryFn: messagesApi.listReceived,
  });

  return (
    <div>
      <div className="page__header">
        <h1>{t.receivedMessages.title}</h1>
        <p className="page__subtitle">{t.receivedMessages.subtitle}</p>
      </div>

      {isLoading && <p className="jobs__status">{t.receivedMessages.loading}</p>}
      {isError && <p className="jobs__status">{t.receivedMessages.errorLoad}</p>}

      {!isLoading && !isError && (messages ?? []).length === 0 && (
        <div className="placeholder-box">
          <span className="placeholder-box__badge">{t.common.noRecords}</span>
          <p>{t.receivedMessages.noneYet}</p>
        </div>
      )}

      {!isLoading && !isError && (messages ?? []).length > 0 && (
        <div className="chart-card">
          <ul className="message-list">
            {(messages ?? []).map((m) => (
              <li key={m.id} className="message-list__item">
                <p className="message-list__content">{m.content}</p>
                <span className="message-list__time">
                  {m.sender ? t.receivedMessages.from(`${m.sender.firstname} ${m.sender.lastname}`) : ''} · {timeAgo(m.createdAt, t)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

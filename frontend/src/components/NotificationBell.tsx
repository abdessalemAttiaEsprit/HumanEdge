import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '@/api/notifications';

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Cloche de notifications in-app (voir NotificationController/NotificationService côté backend). */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: unreadCount } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: notificationsApi.unreadCount,
    refetchInterval: 30_000,
  });

  const { data: notifications } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: notificationsApi.list,
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const handleToggle = () => setOpen((v) => !v);

  const handleMarkAllRead = async () => {
    await notificationsApi.markAllAsRead();
    invalidate();
  };

  const handleItemClick = async (id: number, read: boolean) => {
    if (!read) {
      await notificationsApi.markAsRead(id);
      invalidate();
    }
  };

  return (
    <div className="notification-bell" ref={containerRef}>
      <button
        type="button"
        className="icon-btn notification-bell__trigger"
        onClick={handleToggle}
        aria-label="Notifications"
        title="Notifications"
      >
        <span aria-hidden="true">🔔</span>
        {!!unreadCount && unreadCount > 0 && (
          <span className="notification-bell__badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notification-bell__panel">
          <div className="notification-bell__header">
            <strong>Notifications</strong>
            {!!unreadCount && unreadCount > 0 && (
              <button type="button" className="notification-bell__mark-all" onClick={handleMarkAllRead}>
                Mark all as read
              </button>
            )}
          </div>
          <div className="notification-bell__list">
            {notifications == null && <p className="jobs__status">Loading…</p>}
            {notifications != null && notifications.length === 0 && (
              <p className="jobs__status">No notifications yet.</p>
            )}
            {notifications?.map((n) => (
              <button
                key={n.id}
                type="button"
                className={`notification-bell__item${n.read ? '' : ' notification-bell__item--unread'}`}
                onClick={() => handleItemClick(n.id, n.read)}
              >
                <span className="notification-bell__message">{n.message}</span>
                <span className="notification-bell__time">{timeAgo(n.createdAt)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

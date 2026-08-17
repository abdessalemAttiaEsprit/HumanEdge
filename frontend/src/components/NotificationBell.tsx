import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '@/api/notifications';
import { useLanguage } from '@/i18n/useLanguage';
import type { Messages } from '@/i18n/en';

const PAGE_SIZE = 20;

export function timeAgo(iso: string, t: Messages): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return t.notificationBell.justNow;
  if (minutes < 60) return t.notificationBell.minutesAgo(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t.notificationBell.hoursAgo(hours);
  return t.notificationBell.daysAgo(Math.floor(hours / 24));
}

/** Cloche de notifications in-app (voir NotificationController/NotificationService côté backend). */
export function NotificationBell() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: unreadCount } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: notificationsApi.unreadCount,
    refetchInterval: 30_000,
  });

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['notifications', 'list'],
    queryFn: ({ pageParam }) => notificationsApi.list(pageParam, PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => (lastPage.length === PAGE_SIZE ? allPages.length : undefined),
    enabled: open,
  });

  const notifications = data?.pages.flat();

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

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    await notificationsApi.remove(id);
    invalidate();
  };

  return (
    <div className="notification-bell" ref={containerRef}>
      <button
        type="button"
        className="icon-btn notification-bell__trigger"
        onClick={handleToggle}
        aria-label={t.notificationBell.notifications}
        title={t.notificationBell.notifications}
      >
        <img src="/assets/icons/notifications.png" alt="" aria-hidden="true" />
        {!!unreadCount && unreadCount > 0 && (
          <span className="notification-bell__badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notification-bell__panel">
          <div className="notification-bell__header">
            <strong>{t.notificationBell.notifications}</strong>
            {!!unreadCount && unreadCount > 0 && (
              <button type="button" className="notification-bell__mark-all" onClick={handleMarkAllRead}>
                {t.notificationBell.markAllAsRead}
              </button>
            )}
          </div>
          <div className="notification-bell__list">
            {notifications == null && <p className="jobs__status">{t.notificationBell.loading}</p>}
            {notifications != null && notifications.length === 0 && (
              <p className="jobs__status">{t.notificationBell.noneYet}</p>
            )}
            {notifications?.map((n) => (
              <div
                key={n.id}
                role="button"
                tabIndex={0}
                className={`notification-bell__item${n.read ? '' : ' notification-bell__item--unread'}`}
                onClick={() => handleItemClick(n.id, n.read)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleItemClick(n.id, n.read);
                  }
                }}
              >
                <span className="notification-bell__message">{n.message}</span>
                <span className="notification-bell__time">{timeAgo(n.createdAt, t)}</span>
                <button
                  type="button"
                  className="notification-bell__delete"
                  onClick={(e) => handleDelete(e, n.id)}
                  title={t.notificationBell.deleteNotification}
                  aria-label={t.notificationBell.deleteNotification}
                >
                  ✕
                </button>
              </div>
            ))}
            {hasNextPage && (
              <button
                type="button"
                className="notification-bell__load-more"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? t.notificationBell.loading : t.notificationBell.loadMore}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

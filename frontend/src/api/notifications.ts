import { api } from './axios';
import type { AppNotification } from '@/types';

export const notificationsApi = {
  list(): Promise<AppNotification[]> {
    return api.get<AppNotification[]>('/api/notifications/me').then((r) => r.data);
  },

  unreadCount(): Promise<number> {
    return api.get<{ count: number }>('/api/notifications/me/unread-count').then((r) => r.data.count);
  },

  markAsRead(id: number): Promise<void> {
    return api.patch(`/api/notifications/${id}/read`).then(() => undefined);
  },

  markAllAsRead(): Promise<void> {
    return api.patch('/api/notifications/me/read-all').then(() => undefined);
  },
};

import { api } from './axios';
import type { Subscription } from '@/types';

export const subscriptionsApi = {
  /** ADMIN only: every company's subscription (see DashboardPage's admin view). */
  list(): Promise<Subscription[]> {
    return api.get<Subscription[]>('/api/subscriptions').then((r) => r.data);
  },
};

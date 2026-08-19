import { api } from './axios';

export const googleCalendarApi = {
  getAuthorizationUrl(): Promise<string> {
    return api.get<{ url: string }>('/api/google/oauth/authorize').then((r) => r.data.url);
  },

  status(): Promise<boolean> {
    return api.get<{ connected: boolean }>('/api/google/status').then((r) => r.data.connected);
  },

  disconnect(): Promise<void> {
    return api.delete('/api/google/disconnect').then(() => undefined);
  },
};

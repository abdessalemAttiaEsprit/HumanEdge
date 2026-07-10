import { api } from './axios';
import type { PublicJobResponse } from '@/types';

// Vitrine publique des offres ouvertes — aucune authentification requise (voir SecurityConfig).
export const publicJobsApi = {
  list(limit = 6): Promise<PublicJobResponse[]> {
    return api.get<PublicJobResponse[]>('/api/job/public', { params: { limit } }).then((r) => r.data);
  },
};

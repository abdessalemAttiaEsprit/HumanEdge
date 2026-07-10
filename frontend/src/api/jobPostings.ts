import { api } from './axios';
import type { JobPosting, JobPostingCreateRequest, JobPostingUpdateRequest } from '@/types';

export const jobPostingsApi = {
  list(): Promise<JobPosting[]> {
    return api.get<JobPosting[]>('/api/job').then((r) => r.data);
  },

  create(payload: JobPostingCreateRequest): Promise<JobPosting> {
    return api.post<JobPosting>('/api/job', payload).then((r) => r.data);
  },

  update(id: number, payload: JobPostingUpdateRequest): Promise<JobPosting> {
    return api.put<JobPosting>(`/api/job/${id}`, payload).then((r) => r.data);
  },

  remove(id: number): Promise<void> {
    return api.delete(`/api/job/${id}`).then(() => undefined);
  },

  changeStatus(id: number, status: string): Promise<void> {
    return api.patch(`/api/job/${id}/status`, null, { params: { status } }).then(() => undefined);
  },
};

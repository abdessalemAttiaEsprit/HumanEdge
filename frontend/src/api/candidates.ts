import { api } from './axios';
import type { Candidate, CandidateCreateRequest, CandidateUpdateRequest } from '@/types';

export const candidatesApi = {
  list(): Promise<Candidate[]> {
    return api.get<Candidate[]>('/api/candidate').then((r) => r.data);
  },

  /** Self-service: the logged-in GUEST's own candidate profile (404 if none created yet). */
  getMine(): Promise<Candidate> {
    return api.get<Candidate>('/api/candidate/me').then((r) => r.data);
  },

  getById(id: number): Promise<Candidate> {
    return api.get<Candidate>(`/api/candidate/${id}`).then((r) => r.data);
  },

  create(payload: CandidateCreateRequest): Promise<Candidate> {
    return api.post<Candidate>('/api/candidate', payload).then((r) => r.data);
  },

  update(id: number, payload: CandidateUpdateRequest): Promise<Candidate> {
    return api.put<Candidate>(`/api/candidate/${id}`, payload).then((r) => r.data);
  },

  remove(id: number): Promise<void> {
    return api.delete(`/api/candidate/${id}`).then(() => undefined);
  },

  uploadCv(id: number, file: File): Promise<Candidate> {
    const form = new FormData();
    form.append('file', file);
    return api
      .post<Candidate>(`/api/candidate/${id}/cv`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data);
  },

  async downloadCv(id: number, filename?: string): Promise<void> {
    const res = await api.get(`/api/candidate/${id}/cv`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(res.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename ?? `cv_${id}`;
    link.click();
    window.URL.revokeObjectURL(url);
  },
};

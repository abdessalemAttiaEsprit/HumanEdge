import { api } from './axios';
import type { Application, ApplicationStatus } from '@/types';

export const applicationsApi = {
  /** ADMIN: every application. COMPANY: only applications to their own job postings. */
  list(): Promise<Application[]> {
    return api.get<Application[]>('/api/application').then((r) => r.data);
  },

  getById(id: number): Promise<Application> {
    return api.get<Application>(`/api/application/${id}`).then((r) => r.data);
  },

  listByJob(jobPostingId: number): Promise<Application[]> {
    return api.get<Application[]>(`/api/application/job/${jobPostingId}`).then((r) => r.data);
  },

  listByCandidate(candidateId: number): Promise<Application[]> {
    return api.get<Application[]>(`/api/application/candidate/${candidateId}`).then((r) => r.data);
  },

  /** A candidate applies to a job posting with a cover letter. */
  apply(candidateId: number, jobPostingId: number, coverLetter: string): Promise<Application> {
    return api
      .post<Application>('/api/application/apply', null, { params: { candidateId, jobPostingId, coverLetter } })
      .then((r) => r.data);
  },

  updateStatus(id: number, status: ApplicationStatus): Promise<Application> {
    return api.patch<Application>(`/api/application/${id}/status`, null, { params: { status } }).then((r) => r.data);
  },

  evaluate(id: number, aiScore: number, aiFeedback: string): Promise<Application> {
    return api
      .post<Application>(`/api/application/${id}/evaluate`, null, { params: { aiScore, aiFeedback } })
      .then((r) => r.data);
  },

  evaluateWithAi(id: number): Promise<Application> {
    return api.post<Application>(`/api/application/${id}/evaluate-ai`).then((r) => r.data);
  },

  remove(id: number): Promise<void> {
    return api.delete(`/api/application/${id}`).then(() => undefined);
  },
};

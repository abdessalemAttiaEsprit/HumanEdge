import { api } from './axios';
import type { Interview, InterviewStatus } from '@/types';

export const interviewsApi = {
  /** ADMIN: every interview. COMPANY: only interviews for their own job postings. */
  list(): Promise<Interview[]> {
    return api.get<Interview[]>('/api/interview').then((r) => r.data);
  },

  getById(id: number): Promise<Interview> {
    return api.get<Interview>(`/api/interview/${id}`).then((r) => r.data);
  },

  listByApplication(applicationId: number): Promise<Interview[]> {
    return api.get<Interview[]>(`/api/interview/application/${applicationId}`).then((r) => r.data);
  },

  listByCandidate(candidateId: number): Promise<Interview[]> {
    return api.get<Interview[]>(`/api/interview/candidate/${candidateId}`).then((r) => r.data);
  },

  /** Schedules an interview for an application (also flips the application to SHORTLISTED and emails the candidate). */
  schedule(applicationId: number, date: string, location: string): Promise<Interview> {
    return api
      .post<Interview>('/api/interview/schedule', null, { params: { applicationId, date, location } })
      .then((r) => r.data);
  },

  updateStatus(id: number, status: InterviewStatus): Promise<Interview> {
    return api.patch<Interview>(`/api/interview/${id}/status`, null, { params: { status } }).then((r) => r.data);
  },

  remove(id: number): Promise<void> {
    return api.delete(`/api/interview/${id}`).then(() => undefined);
  },
};

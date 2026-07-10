import { api } from './axios';
import type { Absence, AbsenceCreateRequest, AbsenceUpdateRequest, QuotaSnapshot } from '@/types';

export const absencesApi = {
  list(): Promise<Absence[]> {
    return api.get<Absence[]>('/api/absences').then((r) => r.data);
  },

  create(payload: AbsenceCreateRequest): Promise<Absence> {
    return api.post<Absence>('/api/absences', payload).then((r) => r.data);
  },

  update(id: number, payload: AbsenceUpdateRequest): Promise<Absence> {
    return api.put<Absence>(`/api/absences/${id}`, payload).then((r) => r.data);
  },

  remove(id: number): Promise<void> {
    return api.delete(`/api/absences/${id}`).then(() => undefined);
  },

  getQuota(personnelId: number): Promise<QuotaSnapshot> {
    return api.get<QuotaSnapshot>(`/api/absences/quota/${personnelId}`).then((r) => r.data);
  },

  uploadJustification(id: number, file: File): Promise<Absence> {
    const form = new FormData();
    form.append('file', file);
    return api
      .post<Absence>(`/api/absences/${id}/justification`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data);
  },

  async downloadJustification(id: number, filename?: string): Promise<void> {
    const res = await api.get(`/api/absences/${id}/justification`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(res.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename ?? `justification_${id}`;
    link.click();
    window.URL.revokeObjectURL(url);
  },
};

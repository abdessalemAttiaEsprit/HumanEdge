import { api } from './axios';
import type { Diploma } from '@/types';

export const diplomasApi = {
  listMine(): Promise<Diploma[]> {
    return api.get<Diploma[]>('/api/diplomas/me').then((r) => r.data);
  },

  addMine(name: string, file: File): Promise<Diploma> {
    const form = new FormData();
    form.append('name', name);
    form.append('file', file);
    return api
      .post<Diploma>('/api/diplomas', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data);
  },

  listForPersonnel(personnelId: number): Promise<Diploma[]> {
    return api.get<Diploma[]>(`/api/diplomas/personnel/${personnelId}`).then((r) => r.data);
  },

  addForPersonnel(personnelId: number, name: string, file: File): Promise<Diploma> {
    const form = new FormData();
    form.append('name', name);
    form.append('file', file);
    return api
      .post<Diploma>(`/api/diplomas/personnel/${personnelId}`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data);
  },

  remove(id: number): Promise<void> {
    return api.delete(`/api/diplomas/${id}`).then(() => undefined);
  },
};

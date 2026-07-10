import { api } from './axios';
import type { Personnel, PersonnelCreateRequest, PersonnelSelfUpdateRequest, PersonnelUpdateRequest } from '@/types';

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

export const personnelApi = {
  list(): Promise<Personnel[]> {
    return api.get<Personnel[]>('/api/personnel').then((r) => r.data);
  },

  /** Self-service: the logged-in user's own personnel record (mainly for EMPLOYE). */
  getMine(): Promise<Personnel> {
    return api.get<Personnel>('/api/personnel/me').then((r) => r.data);
  },

  create(payload: PersonnelCreateRequest): Promise<Personnel> {
    return api.post<Personnel>('/api/personnel/employee', payload).then((r) => r.data);
  },

  update(id: number, payload: PersonnelUpdateRequest): Promise<Personnel> {
    return api.put<Personnel>(`/api/personnel/${id}`, payload).then((r) => r.data);
  },

  /** Self-service (EMPLOYE): updates only telephone/RIB on the caller's own record. */
  updateMine(payload: PersonnelSelfUpdateRequest): Promise<Personnel> {
    return api.put<Personnel>('/api/personnel/me', payload).then((r) => r.data);
  },

  remove(id: number): Promise<void> {
    return api.delete(`/api/personnel/${id}`).then(() => undefined);
  },

  uploadImage(id: number, file: File): Promise<Personnel> {
    const form = new FormData();
    form.append('file', file);
    return api
      .post<Personnel>(`/api/personnel/${id}/image`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data);
  },

  /** Self-service (EMPLOYE): uploads/replaces the caller's own photo. */
  uploadMyImage(file: File): Promise<Personnel> {
    const form = new FormData();
    form.append('file', file);
    return api
      .post<Personnel>('/api/personnel/me/image', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data);
  },

  async downloadContractPdf(id: number): Promise<void> {
    const res = await api.get(`/api/personnel/${id}/contract-pdf`, { responseType: 'blob' });
    downloadBlob(res.data, `contrat_${id}.pdf`);
  },

  async downloadAttestationPdf(id: number): Promise<void> {
    const res = await api.get(`/api/personnel/${id}/attestation-pdf`, { responseType: 'blob' });
    downloadBlob(res.data, `attestation_${id}.pdf`);
  },
};

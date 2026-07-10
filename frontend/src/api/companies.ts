import { api } from './axios';
import type { Company, CompanyUpdateRequest, Subscription, SubscriptionPaymentRequest } from '@/types';

export const companiesApi = {
  list(): Promise<Company[]> {
    return api.get<Company[]>('/api/companies').then((r) => r.data);
  },

  getById(id: number): Promise<Company> {
    return api.get<Company>(`/api/companies/${id}`).then((r) => r.data);
  },

  getSubscription(id: number): Promise<Subscription> {
    return api.get<Subscription>(`/api/companies/${id}/subscription`).then((r) => r.data);
  },

  /** Renews (same plan) or changes plan — always a new simulated payment. */
  updateSubscription(id: number, payload: SubscriptionPaymentRequest): Promise<Subscription> {
    return api.put<Subscription>(`/api/companies/${id}/subscription`, payload).then((r) => r.data);
  },

  cancelSubscription(id: number): Promise<Subscription> {
    return api.put<Subscription>(`/api/companies/${id}/subscription/cancel`).then((r) => r.data);
  },

  update(id: number, payload: CompanyUpdateRequest): Promise<Company> {
    return api.put<Company>(`/api/companies/${id}`, payload).then((r) => r.data);
  },

  uploadLogo(id: number, file: File): Promise<Company> {
    const form = new FormData();
    form.append('file', file);
    return api
      .post<Company>(`/api/companies/${id}/logo`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data);
  },

  /** ADMIN: marks the company's fiscal/CNSS documents as verified. */
  verify(id: number): Promise<Company> {
    return api.put<Company>(`/api/companies/${id}/verify`).then((r) => r.data);
  },

  activate(id: number): Promise<Company> {
    return api.put<Company>(`/api/companies/${id}/activate`).then((r) => r.data);
  },

  deactivate(id: number): Promise<Company> {
    return api.put<Company>(`/api/companies/${id}/deactivate`).then((r) => r.data);
  },

  remove(id: number): Promise<void> {
    return api.delete(`/api/companies/${id}`).then(() => undefined);
  },

  /** ADMIN only: cascade delete — wipes users, personnel, contracts, payments, subscription and job postings too. */
  removeCascade(id: number): Promise<void> {
    return api.delete(`/api/companies/${id}/force`).then(() => undefined);
  },
};

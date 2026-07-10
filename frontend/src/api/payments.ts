import { api } from './axios';
import type { Month, Payment, PaymentCreateRequest, PaymentUpdateRequest, PayrollGenerationSummary } from '@/types';

export const paymentsApi = {
  /** Salary grid categories (code -> description), e.g. { A1: "Cadres supérieurs...", ... }. */
  getSalaryCategories(): Promise<Record<string, string>> {
    return api.get<Record<string, string>>('/api/payments/salary-categories').then((r) => r.data);
  },

  list(): Promise<Payment[]> {
    return api.get<Payment[]>('/api/payments').then((r) => r.data);
  },

  /** Self-service: the logged-in user's own payslips (mainly for EMPLOYE). */
  getMine(): Promise<Payment[]> {
    return api.get<Payment[]>('/api/payments/me').then((r) => r.data);
  },

  create(payload: PaymentCreateRequest): Promise<Payment> {
    return api.post<Payment>('/api/payments', payload).then((r) => r.data);
  },

  update(id: number, payload: PaymentUpdateRequest): Promise<Payment> {
    return api.put<Payment>(`/api/payments/${id}`, payload).then((r) => r.data);
  },

  validate(id: number): Promise<Payment> {
    return api.patch<Payment>(`/api/payments/${id}/validate`).then((r) => r.data);
  },

  remove(id: number): Promise<void> {
    return api.delete(`/api/payments/${id}`).then(() => undefined);
  },

  /** Bulk-generates DRAFT payments for a given month (see PayrollGenerationSummary). */
  generate(month: Month, year: number, companyId?: number): Promise<PayrollGenerationSummary> {
    return api
      .post<PayrollGenerationSummary>('/api/payments/generate', null, {
        params: { month, year, companyId },
      })
      .then((r) => r.data);
  },

  async downloadPayslipPdf(id: number): Promise<void> {
    const res = await api.get(`/api/payments/${id}/fiche-paie-pdf`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(res.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fiche_paie_${id}.pdf`;
    link.click();
    window.URL.revokeObjectURL(url);
  },
};

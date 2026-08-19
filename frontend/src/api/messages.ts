import { api } from './axios';
import type { EmployeeMessage, MessageCreateRequest } from '@/types';

export const messagesApi = {
  list(): Promise<EmployeeMessage[]> {
    return api.get<EmployeeMessage[]>('/api/messages/me').then((r) => r.data);
  },

  send(payload: MessageCreateRequest): Promise<EmployeeMessage> {
    return api.post<EmployeeMessage>('/api/messages', payload).then((r) => r.data);
  },

  listReceived(): Promise<EmployeeMessage[]> {
    return api.get<EmployeeMessage[]>('/api/messages/received').then((r) => r.data);
  },

  reply(employeeUserId: number, content: string, file?: File | null): Promise<EmployeeMessage> {
    const form = new FormData();
    form.append('content', content);
    if (file) form.append('file', file);
    return api
      .post<EmployeeMessage>(`/api/messages/employee/${employeeUserId}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },

  async downloadAttachment(id: number, filename?: string): Promise<void> {
    const res = await api.get(`/api/messages/${id}/attachment`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(res.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename ?? `attachment_${id}`;
    link.click();
    window.URL.revokeObjectURL(url);
  },
};

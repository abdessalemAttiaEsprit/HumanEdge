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

  reply(employeeUserId: number, payload: MessageCreateRequest): Promise<EmployeeMessage> {
    return api.post<EmployeeMessage>(`/api/messages/employee/${employeeUserId}`, payload).then((r) => r.data);
  },
};

import { api } from './axios';
import type { Task, TaskCreateRequest, TaskStatus, TaskUpdateRequest } from '@/types';

export const tasksApi = {
  list(): Promise<Task[]> {
    return api.get<Task[]>('/api/tasks').then((r) => r.data);
  },

  listMine(): Promise<Task[]> {
    return api.get<Task[]>('/api/tasks/me').then((r) => r.data);
  },

  create(payload: TaskCreateRequest): Promise<Task> {
    return api.post<Task>('/api/tasks', payload).then((r) => r.data);
  },

  update(id: number, payload: TaskUpdateRequest): Promise<Task> {
    return api.put<Task>(`/api/tasks/${id}`, payload).then((r) => r.data);
  },

  updateStatus(id: number, status: TaskStatus): Promise<Task> {
    return api.put<Task>(`/api/tasks/${id}/status`, { status }).then((r) => r.data);
  },

  uploadAttachment(id: number, file: File): Promise<Task> {
    const form = new FormData();
    form.append('file', file);
    return api
      .post<Task>(`/api/tasks/${id}/attachment`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data);
  },

  async downloadAttachment(id: number, filename?: string): Promise<void> {
    const res = await api.get(`/api/tasks/${id}/attachment`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(res.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename ?? `attachment_${id}`;
    link.click();
    window.URL.revokeObjectURL(url);
  },

  remove(id: number): Promise<void> {
    return api.delete(`/api/tasks/${id}`).then(() => undefined);
  },
};

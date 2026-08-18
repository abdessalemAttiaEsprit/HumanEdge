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

  remove(id: number): Promise<void> {
    return api.delete(`/api/tasks/${id}`).then(() => undefined);
  },
};

import { api } from './axios';
import type { Skill, SkillCreateRequest, SkillStatus, SkillSuggestions } from '@/types';

export const skillsApi = {
  getSuggestions(personnelId?: number): Promise<SkillSuggestions> {
    return api
      .get<SkillSuggestions>('/api/skills/suggestions', { params: personnelId ? { personnelId } : undefined })
      .then((r) => r.data);
  },

  listMine(): Promise<Skill[]> {
    return api.get<Skill[]>('/api/skills/me').then((r) => r.data);
  },

  createMine(payload: SkillCreateRequest): Promise<Skill> {
    return api.post<Skill>('/api/skills', payload).then((r) => r.data);
  },

  listForPersonnel(personnelId: number): Promise<Skill[]> {
    return api.get<Skill[]>(`/api/skills/personnel/${personnelId}`).then((r) => r.data);
  },

  addForPersonnel(personnelId: number, payload: SkillCreateRequest): Promise<Skill> {
    return api.post<Skill>(`/api/skills/personnel/${personnelId}`, payload).then((r) => r.data);
  },

  updateStatus(id: number, status: SkillStatus): Promise<Skill> {
    return api.put<Skill>(`/api/skills/${id}/status`, { status }).then((r) => r.data);
  },

  remove(id: number): Promise<void> {
    return api.delete(`/api/skills/${id}`).then(() => undefined);
  },
};

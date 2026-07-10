import { api } from './axios';
import type { Contract, ContractCreateRequest, ContractUpdateRequest } from '@/types';

export const contractsApi = {
  list(): Promise<Contract[]> {
    return api.get<Contract[]>('/api/contracts').then((r) => r.data);
  },

  create(payload: ContractCreateRequest): Promise<Contract> {
    return api.post<Contract>('/api/contracts', payload).then((r) => r.data);
  },

  update(id: number, payload: ContractUpdateRequest): Promise<Contract> {
    return api.put<Contract>(`/api/contracts/${id}`, payload).then((r) => r.data);
  },

  remove(id: number): Promise<void> {
    return api.delete(`/api/contracts/${id}`).then(() => undefined);
  },
};

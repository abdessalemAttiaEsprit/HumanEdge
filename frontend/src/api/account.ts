import { api } from './axios';
import type { ChangePasswordRequest, User } from '@/types';

export const accountApi = {
  changePassword(payload: ChangePasswordRequest): Promise<void> {
    return api.put('/api/account/password', payload).then(() => undefined);
  },

  uploadAvatar(file: File): Promise<User> {
    const form = new FormData();
    form.append('file', file);
    return api
      .post<User>('/api/account/avatar', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data);
  },
};

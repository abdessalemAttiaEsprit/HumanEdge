import { api } from './axios';
import type {
  AuthResponse,
  ForgotPasswordRequest,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  ResendOtpRequest,
  ResetPasswordRequest,
  SubscriptionPlan,
  VerifyOtpRequest,
} from '@/types';

export interface RegisterFiles {
  logo?: File;
  signature?: File;
  userImage?: File;
}

export const authApi = {
  login(payload: LoginRequest): Promise<LoginResponse> {
    return api.post<LoginResponse>('/api/auth/login', payload).then((r) => r.data);
  },

  /** Public catalog of platform subscription plans, shown on the company registration form. */
  getSubscriptionPlans(): Promise<Record<string, SubscriptionPlan>> {
    return api.get<Record<string, SubscriptionPlan>>('/api/auth/subscription-plans').then((r) => r.data);
  },

  verifyOtp(payload: VerifyOtpRequest): Promise<AuthResponse> {
    return api.post<AuthResponse>('/api/auth/verify-otp', payload).then((r) => r.data);
  },

  resendOtp(payload: ResendOtpRequest): Promise<void> {
    return api.post('/api/auth/resend-otp', payload).then(() => undefined);
  },

  forgotPassword(payload: ForgotPasswordRequest): Promise<void> {
    return api.post('/api/auth/forgot-password', payload).then(() => undefined);
  },

  resetPassword(payload: ResetPasswordRequest): Promise<void> {
    return api.post('/api/auth/reset-password', payload).then(() => undefined);
  },

  // Plain JSON when there are no files (multipart isn't needed); switches to
  // multipart/form-data (with a "data" JSON part, matching AuthController's
  // @RequestPart("data") binding) as soon as a logo/signature/avatar is attached.
  register(payload: RegisterRequest, files?: RegisterFiles): Promise<AuthResponse> {
    if (!files?.logo && !files?.signature && !files?.userImage) {
      return api.post<AuthResponse>('/api/auth/register', payload).then((r) => r.data);
    }
    const form = new FormData();
    form.append('data', new Blob([JSON.stringify(payload)], { type: 'application/json' }));
    if (files.logo) form.append('logo', files.logo);
    if (files.signature) form.append('signature', files.signature);
    if (files.userImage) form.append('userImage', files.userImage);
    return api
      .post<AuthResponse>('/api/auth/register', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data);
  },
};

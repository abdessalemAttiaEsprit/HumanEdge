import { createContext } from 'react';
import type { RegisterFiles } from '@/api/auth';
import type {
  AuthResponse,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  ResendOtpRequest,
  Role,
  VerifyOtpRequest,
} from '@/types';

export interface AuthContextValue {
  user: AuthResponse | null;
  isAuthenticated: boolean;
  // Does NOT establish a session by itself when mfaRequired is true — the caller
  // must follow up with verifyOtp() to complete the login.
  login: (payload: LoginRequest) => Promise<LoginResponse>;
  verifyOtp: (payload: VerifyOtpRequest) => Promise<AuthResponse>;
  resendOtp: (payload: ResendOtpRequest) => Promise<void>;
  register: (payload: RegisterRequest, files?: RegisterFiles) => Promise<AuthResponse>;
  logout: () => void;
  hasRole: (...roles: Role[]) => boolean;
  /** Reflects a freshly-uploaded avatar filename into the session immediately (no re-login needed). */
  updateAvatar: (img: string) => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

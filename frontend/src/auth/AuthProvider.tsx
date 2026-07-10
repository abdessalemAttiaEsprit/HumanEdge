import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { authApi, type RegisterFiles } from '@/api/auth';
import { authStorage } from './storage';
import { AuthContext, type AuthContextValue } from './context';
import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  ResendOtpRequest,
  Role,
  VerifyOtpRequest,
} from '@/types';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthResponse | null>(() => authStorage.getUser());

  const login = useCallback(async (payload: LoginRequest) => {
    const response = await authApi.login(payload);
    if (!response.mfaRequired && response.auth) {
      authStorage.save(response.auth);
      setUser(response.auth);
    }
    return response;
  }, []);

  const verifyOtp = useCallback(async (payload: VerifyOtpRequest) => {
    const auth = await authApi.verifyOtp(payload);
    authStorage.save(auth);
    setUser(auth);
    return auth;
  }, []);

  const resendOtp = useCallback((payload: ResendOtpRequest) => authApi.resendOtp(payload), []);

  const register = useCallback(async (payload: RegisterRequest, files?: RegisterFiles) => {
    const auth = await authApi.register(payload, files);
    authStorage.save(auth);
    setUser(auth);
    return auth;
  }, []);

  const logout = useCallback(() => {
    authStorage.clear();
    setUser(null);
  }, []);

  const updateAvatar = useCallback((img: string) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, img };
      authStorage.save(next);
      return next;
    });
  }, []);

  const hasRole = useCallback(
    (...roles: Role[]) => (user ? roles.includes(user.role) : false),
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      login,
      verifyOtp,
      resendOtp,
      register,
      logout,
      hasRole,
      updateAvatar,
    }),
    [user, login, verifyOtp, resendOtp, register, logout, hasRole, updateAvatar],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

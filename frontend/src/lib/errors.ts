import { AxiosError } from 'axios';

interface ApiError {
  message?: string;
  errors?: Record<string, string>;
}

/** Extracts a readable message from an Axios error (matches the backend's GlobalExceptionHandler shape). */
export function getErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data as ApiError | undefined;
    if (data?.errors) {
      const first = Object.values(data.errors)[0];
      if (first) return first;
    }
    if (data?.message) return data.message;
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

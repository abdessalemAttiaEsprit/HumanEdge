import axios, { AxiosError } from 'axios';
import { authStorage } from '@/auth/storage';

const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8081';

export const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// --- Requête : injection du Bearer token -------------------------------------
api.interceptors.request.use((config) => {
  const token = authStorage.getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// --- Réponse : gestion globale du 401 (session expirée / invalide) -----------
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      authStorage.clear();
      // Évite une boucle si on est déjà sur la page de login.
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

// Construit l'URL absolue d'un fichier servi sous /uploads (logo, avatar, ...).
export function fileUrl(filename?: string | null): string | undefined {
  if (!filename) return undefined;
  return `${baseURL}/uploads/${filename}`;
}

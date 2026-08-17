import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { useAuth } from './useAuth';
import type { AuthContextValue } from './context';

vi.mock('./useAuth');

const mockedUseAuth = vi.mocked(useAuth);

/**
 * Couvre le gate d'accès utilisé par toutes les routes protégées de l'app (voir App.tsx) :
 * une session non authentifiée doit toujours atterrir sur /login, et un rôle non autorisé
 * sur /unauthorized — jamais laisser passer le contenu protégé dans ces deux cas.
 */
describe('ProtectedRoute', () => {
  it('redirects to /login when the user is not authenticated', () => {
    mockedUseAuth.mockReturnValue({ isAuthenticated: false, user: null } as AuthContextValue);

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
            <Route path="/protected" element={<div>Secret content</div>} />
          </Route>
          <Route path="/login" element={<div>Login page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Secret content')).not.toBeInTheDocument();
  });

  it('redirects to /unauthorized when the role is not in allowedRoles', () => {
    mockedUseAuth.mockReturnValue({
      isAuthenticated: true,
      user: { role: 'EMPLOYE' },
    } as AuthContextValue);

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
            <Route path="/protected" element={<div>Secret content</div>} />
          </Route>
          <Route path="/unauthorized" element={<div>Unauthorized page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Unauthorized page')).toBeInTheDocument();
    expect(screen.queryByText('Secret content')).not.toBeInTheDocument();
  });

  it('renders the protected content when the role is allowed', () => {
    mockedUseAuth.mockReturnValue({
      isAuthenticated: true,
      user: { role: 'ADMIN' },
    } as AuthContextValue);

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
            <Route path="/protected" element={<div>Secret content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Secret content')).toBeInTheDocument();
  });

  it('allows any authenticated role through when allowedRoles is not set', () => {
    mockedUseAuth.mockReturnValue({
      isAuthenticated: true,
      user: { role: 'GUEST' },
    } as AuthContextValue);

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/protected" element={<div>Secret content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Secret content')).toBeInTheDocument();
  });
});

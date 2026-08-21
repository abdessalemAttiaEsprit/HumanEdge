import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';
import type { Role } from '@/types';

interface ProtectedRouteProps {
  /** Si fourni, restreint l'accès aux rôles listés. Sinon, toute session authentifiée passe. */
  allowedRoles?: Role[];
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    // Mémorise la destination pour rediriger après login.
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  // Abonnement expiré depuis plus de 24h (voir OwnershipGuard.checkCompanyOperational côté
  // backend) : force la page de renouvellement plutôt que le reste de l'app, tant qu'elle
  // n'a pas payé. Placé ici (wrapper englobant toute la zone authentifiée) pour couvrir
  // toutes les routes imbriquées en un seul point.
  if (user?.subscriptionBlocked && location.pathname !== '/subscription-blocked') {
    return <Navigate to="/subscription-blocked" replace />;
  }

  return <Outlet />;
}

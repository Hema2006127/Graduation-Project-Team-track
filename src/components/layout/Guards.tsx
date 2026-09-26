import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import type { Role } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { homePath } from '@/lib/permissions';
import { PageLoader } from '@/components/ui/Display';

/** Requires a signed-in user with one of `roles`; others go to their own home (visitors to login). */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { profile, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader label="Checking your session…" />;
  if (!profile) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!roles.includes(profile.role)) return <Navigate to={homePath(profile.role)} replace />;
  return <>{children}</>;
}

/** The public, read-only site. Signed-in staff are sent to their own area. */
export function PublicOnly({ children }: { children: ReactNode }) {
  const { profile, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (profile) return <Navigate to={homePath(profile.role)} replace />;
  return <>{children}</>;
}

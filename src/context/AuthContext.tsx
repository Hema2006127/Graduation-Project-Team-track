import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Profile } from '@/types';
import { api, AppError } from '@/services';
import { canSignIn, ROLE_HOME, type Viewer } from '@/lib/permissions';

interface AuthState {
  /** Signed-in staff member, or null for a visitor. */
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string, remember: boolean) => Promise<Profile>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  const refresh = useCallback(async () => {
    try {
      const p = await api.currentProfile();
      // A session of a non-staff account (e.g. a user not promoted yet) is ended.
      if (p && !canSignIn(p.role)) {
        await api.signOut();
        setProfile(null);
      } else {
        setProfile(p);
      }
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    return api.onAuthChange(refresh);
  }, [refresh]);

  const value = useMemo<AuthState>(
    () => ({
      profile,
      loading,
      refresh,
      async signIn(email, password, remember) {
        qc.clear();
        const p = await api.signIn(email, password, remember);
        if (!canSignIn(p.role)) {
          await api.signOut();
          throw new AppError('Only admin and doctor accounts can sign in. Everyone else can view the site without signing in.');
        }
        setProfile(p);
        return p;
      },
      async signOut() {
        await api.signOut();
        qc.clear();
        setProfile(null);
      },
    }),
    [profile, loading, refresh, qc],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Profile of the signed-in user (only use under a staff route). */
export function useMe(): Profile {
  const { profile } = useAuth();
  if (!profile) throw new Error('Not authenticated');
  return profile;
}

/** Who is looking at the page: a staff role or a guest visitor, plus the URL prefix of their area. */
export function useViewer(): { role: Viewer; base: string; profile: Profile | null } {
  const { profile } = useAuth();
  const role: Viewer = profile?.role ?? 'guest';
  return { role, base: ROLE_HOME[role], profile };
}

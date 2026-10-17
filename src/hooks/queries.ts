import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/services';
import { useToast } from '@/components/ui/Toast';
import { buildIndex } from '@/lib/attendance';
import { nowKey } from '@/lib/dates';
import { useAuth } from '@/context/AuthContext';
import { can } from '@/lib/permissions';

export const qk = {
  settings: ['settings'] as const,
  specializations: ['specializations'] as const,
  members: ['members'] as const,
  profiles: ['profiles'] as const,
  sessions: ['sessions'] as const,
  attendance: ['attendance'] as const,
  tasks: ['tasks'] as const,
};

export const useSettings = () => useQuery({ queryKey: qk.settings, queryFn: api.getSettings });
export const useSpecializations = () => useQuery({ queryKey: qk.specializations, queryFn: api.listSpecializations });
export const useMembers = () => useQuery({ queryKey: qk.members, queryFn: api.listMembers });
export const useProfiles = () => useQuery({ queryKey: qk.profiles, queryFn: api.listProfiles });
export const useSessions = () => useQuery({ queryKey: qk.sessions, queryFn: api.listSessions });
/** All attendance the current user may see (RLS limits members to their own). */
export const useAttendance = () => useQuery({ queryKey: qk.attendance, queryFn: () => api.listAttendance() });
export const useTasks = (filter?: { specializationId?: string; weekNumber?: number }) =>
  useQuery({
    queryKey: [...qk.tasks, filter?.specializationId ?? 'all', filter?.weekNumber ?? 'all'],
    queryFn: () => api.listTasks(filter),
  });


/** Wall-clock "now" in the team timezone, refreshed every 30 s so phases update live. */
export function useNowKey() {
  const tz = useSettings().data?.timezone ?? 'UTC';
  const [key, setKey] = useState(() => nowKey(tz));
  useEffect(() => {
    setKey(nowKey(tz));
    const t = setInterval(() => setKey(nowKey(tz)), 30_000);
    return () => clearInterval(t);
  }, [tz]);
  return key;
}

/** Everything needed for statistics, loaded together. */
export function useAttendanceData() {
  const settings = useSettings();
  const members = useMembers();
  const specializations = useSpecializations();
  const sessions = useSessions();
  const attendance = useAttendance();
  const profiles = useProfiles();
  const now = useNowKey();
  const queries = [settings, members, specializations, sessions, attendance, profiles];
  const isLoading = queries.some((q) => q.isLoading);
  const error = queries.find((q) => q.error)?.error ?? null;

  const index = useMemo(
    () => (sessions.data && attendance.data ? buildIndex(sessions.data, attendance.data, now) : null),
    [sessions.data, attendance.data, now],
  );
  const lookup = useMemo(() => {
    const spec = new Map((specializations.data ?? []).map((s) => [s.id, s]));
    const member = new Map((members.data ?? []).map((m) => [m.id, m]));
    const profile = new Map((profiles.data ?? []).map((p) => [p.id, p]));
    const session = new Map((sessions.data ?? []).map((s) => [s.id, s]));
    return {
      specName: (id: string | null) => (id ? spec.get(id)?.name : undefined) ?? '—',
      member: (id: string) => member.get(id),
      profileName: (id: string | null) => (id ? profile.get(id)?.full_name : undefined) ?? '—',
      session: (id: string) => session.get(id),
    };
  }, [specializations.data, members.data, profiles.data, sessions.data]);

  return {
    isLoading,
    error,
    retry: () => queries.forEach((q) => q.error && q.refetch()),
    now,
    index,
    lookup,
    settings: settings.data,
    members: members.data ?? [],
    specializations: specializations.data ?? [],
    sessions: sessions.data ?? [],
    attendance: attendance.data ?? [],
    profiles: profiles.data ?? [],
    threshold: settings.data?.low_attendance_threshold ?? 75,
  };
}

/** Doctors (and admins) that can be assigned to sessions. */
export function useDoctors() {
  const { data = [], ...rest } = useProfiles();
  return { ...rest, data: data.filter((p) => p.role === 'doctor' || p.role === 'admin') };
}

/**
 * Wraps a mutation with cache invalidation + success/error toasts.
 * `invalidate` lists the query keys whose data changed.
 */
export function useApiMutation<TVars, TResult>(
  fn: (vars: TVars) => Promise<TResult>,
  opts: { invalidate: (readonly string[])[]; success?: string | ((r: TResult, v: TVars) => string); errorTitle?: string },
) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, v) => {
      opts.invalidate.forEach((key) => qc.invalidateQueries({ queryKey: key }));
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(r, v) : opts.success);
    },
    onError: (e) => toast.error(opts.errorTitle ?? 'Action failed', errorMessage(e)),
  });
}

export function useCan() {
  const role = useAuth().profile?.role;
  return useMemo(
    () => Object.fromEntries(Object.entries(can).map(([k, f]) => [k, f(role)])) as Record<keyof typeof can, boolean>,
    [role],
  );
}

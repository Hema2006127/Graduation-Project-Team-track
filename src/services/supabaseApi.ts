import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js';
import type { AttendanceRecord, Profile, Session, TeamMember } from '@/types';
import { AppError, type Api } from './api';

const REMEMBER_KEY = 'ta.remember';

/** "Remember me": persist the session in localStorage, otherwise only for this tab. */
const authStorage = {
  getItem: (k: string) => localStorage.getItem(k) ?? sessionStorage.getItem(k),
  setItem: (k: string, v: string) => {
    const remember = localStorage.getItem(REMEMBER_KEY) !== 'false';
    (remember ? localStorage : sessionStorage).setItem(k, v);
    (remember ? sessionStorage : localStorage).removeItem(k);
  },
  removeItem: (k: string) => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  },
};

/** Columns anonymous visitors may read (see migration 20260927000003_public_read.sql). */
const PUBLIC_COLUMNS = {
  team_members: 'id,member_code,full_name,avatar_url,specialization_id,status,created_at,updated_at',
  attendance: 'id,session_id,team_member_id,status,recorded_at,created_at,updated_at',
  profiles: 'id,full_name,role',
};

const CONSTRAINT_MESSAGES: Record<string, string> = {
  team_members_member_code_key: 'A member with this Member ID already exists.',
  team_members_email_key: 'A member with this email already exists.',
  specializations_name_key: 'A specialization with this name already exists.',
  attendance_session_member_key: 'This member already has an attendance record for this session.',
  profiles_email_key: 'An account with this email already exists.',
  sessions_time_order: 'End time must be after start time.',
};

/** Maps Postgres / PostgREST errors to friendly messages. */
function fail(error: PostgrestError | { message: string; code?: string }): never {
  const code = error.code ?? '';
  const msg = error.message ?? '';
  const constraint = Object.keys(CONSTRAINT_MESSAGES).find((c) => msg.includes(c));
  if (constraint) throw new AppError(CONSTRAINT_MESSAGES[constraint], code);
  if (code === '23503') {
    throw new AppError(
      msg.includes('team_members')
        ? 'This member has attendance history and cannot be deleted. Deactivate them instead.'
        : msg.includes('specializations')
          ? 'This specialization is assigned to members. Reassign them first.'
          : 'This record is in use and cannot be deleted.',
      code,
    );
  }
  if (code === '42501' || /row-level security|permission denied/i.test(msg))
    throw new AppError("You don't have permission to perform this action.", code);
  if (code === 'PGRST116') throw new AppError('Record not found or you do not have access to it.', code);
  throw new AppError(msg || 'Unexpected server error.', code);
}

async function one<T>(p: PromiseLike<{ data: T | null; error: PostgrestError | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) fail(error);
  if (data === null) throw new AppError('Record not found or you do not have access to it.');
  return data;
}

export function createSupabaseApi(url: string, anonKey: string): Api {
  const sb: SupabaseClient = createClient(url, anonKey, {
    auth: { storage: authStorage, persistSession: true, autoRefreshToken: true },
  });

  /** Fetches every row despite PostgREST's max-rows limit. */
  async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>) {
    const size = 1000;
    const out: T[] = [];
    for (let from = 0; ; from += size) {
      const { data, error } = await build(from, from + size - 1);
      if (error) fail(error);
      out.push(...(data ?? []));
      if (!data || data.length < size) return out;
    }
  }

  /**
   * Signed-in users get full rows; visitors only the public columns. Typed as '*'
   * because callers fill the missing private fields with empty values.
   */
  async function columns(table: keyof typeof PUBLIC_COLUMNS) {
    const { data } = await sb.auth.getSession();
    return (data.session ? '*' : PUBLIC_COLUMNS[table]) as '*';
  }

  const api: Api = {
    mode: 'supabase',

    async signIn(email, password, remember) {
      localStorage.setItem(REMEMBER_KEY, String(remember));
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new AppError(/invalid/i.test(error.message) ? 'Incorrect email or password.' : error.message);
      const profile = await api.currentProfile();
      if (!profile) {
        await sb.auth.signOut();
        throw new AppError('Your account has no profile. Contact the administrator.');
      }
      return profile;
    },
    async signOut() {
      await sb.auth.signOut();
    },
    async currentProfile() {
      const { data } = await sb.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) return null;
      const { data: profile, error } = await sb.from('profiles').select('*').eq('id', uid).maybeSingle();
      if (error) fail(error);
      return profile as Profile | null;
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') setTimeout(cb, 0);
      });
      return () => data.subscription.unsubscribe();
    },
    async changePassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw new AppError(error.message);
    },

    getSettings: () => one(sb.from('app_settings').select('*').eq('id', 1).single()),
    updateSettings: (input) => one(sb.from('app_settings').update(input).eq('id', 1).select().single()),

    listSpecializations: () => all((f, t) => sb.from('specializations').select('*').order('name').range(f, t)),
    createSpecialization: (input) => one(sb.from('specializations').insert(input).select().single()),
    updateSpecialization: (id, input) => one(sb.from('specializations').update(input).eq('id', id).select().single()),
    async deleteSpecialization(id) {
      const { error } = await sb.from('specializations').delete().eq('id', id);
      if (error) fail(error);
    },

    async listMembers() {
      const cols = await columns('team_members');
      const rows = await all<TeamMember>((f, t) => sb.from('team_members').select(cols).order('member_code').range(f, t));
      return rows.map((m) => ({ ...m, email: m.email ?? '', phone: m.phone ?? null }));
    },
    createMember: (input) => one(sb.from('team_members').insert(input).select().single()),
    updateMember: (id, input) => one(sb.from('team_members').update(input).eq('id', id).select().single()),
    async deleteMember(id) {
      const { error, count } = await sb.from('team_members').delete({ count: 'exact' }).eq('id', id);
      if (error) fail(error);
      if (!count) throw new AppError("You don't have permission to delete this member.");
    },
    async uploadAvatar(file) {
      if (file.size > 2 * 1024 * 1024) throw new AppError('Image must be smaller than 2 MB.');
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await sb.storage.from('avatars').upload(path, file, { contentType: file.type });
      if (error) throw new AppError(error.message);
      return sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    },

    async listProfiles() {
      const cols = await columns('profiles');
      const rows = await all<Profile>((f, t) => sb.from('profiles').select(cols).order('full_name').range(f, t));
      return rows.map((p) => ({ ...p, email: p.email ?? '', team_member_id: p.team_member_id ?? null, created_at: p.created_at ?? '' }));
    },
    updateProfile: (id, patch) => one(sb.from('profiles').update(patch).eq('id', id).select().single()),

    listSessions: () =>
      all<Session>((f, t) =>
        sb.from('sessions').select('*').order('session_date').order('start_time').range(f, t),
      ),
    createSession: (input) => one(sb.from('sessions').insert(input).select().single()),
    updateSession: (id, input) => one(sb.from('sessions').update(input).eq('id', id).select().single()),
    setSessionCancelled: (id, cancelled) =>
      one(sb.from('sessions').update({ status: cancelled ? 'cancelled' : 'scheduled' }).eq('id', id).select().single()),
    async deleteSession(id) {
      const { error, count } = await sb.from('sessions').delete({ count: 'exact' }).eq('id', id);
      if (error) fail(error);
      if (!count) throw new AppError("You don't have permission to delete this session.");
    },

    async listAttendance(filter = {}) {
      const cols = await columns('attendance');
      const rows = await all<AttendanceRecord>((f, t) => {
        let q = sb.from('attendance').select(cols).order('id');
        if (filter.sessionId) q = q.eq('session_id', filter.sessionId);
        if (filter.memberId) q = q.eq('team_member_id', filter.memberId);
        return q.range(f, t);
      });
      return rows.map((r) => ({ ...r, notes: r.notes ?? null, recorded_by: r.recorded_by ?? null }));
    },
    async saveAttendance(sessionId, entries) {
      const rows = entries.map((e) => ({ session_id: sessionId, ...e }));
      const { data, error } = await sb
        .from('attendance')
        .upsert(rows, { onConflict: 'session_id,team_member_id' })
        .select();
      if (error) fail(error);
      return data as AttendanceRecord[];
    },
  };
  return api;
}

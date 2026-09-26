/**
 * Demo backend: keeps a small database in localStorage so the app can be
 * tried without a Supabase project. It mirrors the rules of the SQL schema
 * (RLS, unique constraints and triggers) so behaviour is identical.
 * Not for production — use Supabase (see README).
 */
import type {
  AppSettings, AttendanceRecord, MemberInput, Profile, Role, Session, Specialization, TeamMember,
} from '@/types';
import { addDays, hhmm, nowKey, todayIn } from '@/lib/dates';
import { AppError, type Api } from '../api';
import {
  SEED_ACCOUNTS, SEED_ATTENDANCE, SEED_MEMBERS, SEED_PASSWORDS, SEED_SESSIONS, SEED_SETTINGS, SEED_SPECIALIZATIONS,
} from './seedData';

const DB_KEY = 'ta.demo.db.v2';
const USER_KEY = 'ta.demo.user';

interface DemoAccount extends Profile {
  password: string;
}
interface DemoDb {
  settings: AppSettings;
  specializations: Specialization[];
  members: TeamMember[];
  accounts: DemoAccount[];
  sessions: Session[];
  attendance: AttendanceRecord[];
}

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const denied = () => new AppError("You don't have permission to perform this action.", '42501');

export function buildSeedDb(): DemoDb {
  const created = now();
  const today = todayIn(SEED_SETTINGS.timezone);
  const db: DemoDb = {
    settings: { ...SEED_SETTINGS, updated_at: created },
    specializations: SEED_SPECIALIZATIONS.map((s) => ({ ...s, created_at: created })),
    members: SEED_MEMBERS.map((m) => ({
      id: m.id, member_code: m.member_code, full_name: m.full_name, email: m.email, phone: m.phone,
      avatar_url: null, specialization_id: m.specialization_id, status: m.finalStatus,
      created_at: created, updated_at: created,
    })),
    accounts: SEED_ACCOUNTS.map((a) => ({
      id: a.id, full_name: a.full_name, email: a.email, role: a.role, team_member_id: a.memberId,
      created_at: created, password: SEED_PASSWORDS[a.role],
    })),
    sessions: SEED_SESSIONS.map((s) => ({
      id: s.id, title: s.title, description: s.description, session_date: addDays(today, s.dayOffset),
      start_time: s.start_time, end_time: s.end_time, doctor_id: s.doctor_id, team_group: s.team_group,
      location: s.location, notes: s.notes, status: s.cancelled ? 'cancelled' : 'scheduled',
      cancelled_at: s.cancelled ? created : null, created_by: SEED_ACCOUNTS[0].id, created_at: created, updated_at: created,
    })),
    attendance: [],
  };
  // Roster = members active at the time of each session (mirrors seed.sql).
  const marks = new Map(SEED_ATTENDANCE.map((a) => [`${a.session_id}|${a.team_member_id}`, a]));
  for (const s of db.sessions) {
    for (const m of db.members) {
      const mark = marks.get(`${s.id}|${m.id}`);
      if (m.status === 'inactive' && !mark) continue;
      db.attendance.push({
        id: uid(), session_id: s.id, team_member_id: m.id, status: mark?.status ?? null, notes: mark?.notes ?? null,
        recorded_by: mark?.recorded_by ?? null, recorded_at: mark ? created : null, created_at: created, updated_at: created,
      });
    }
  }
  return db;
}

export function createDemoApi(storage: Storage = localStorage): Api {
  let db: DemoDb = (() => {
    try {
      const raw = storage.getItem(DB_KEY);
      if (raw) return JSON.parse(raw) as DemoDb;
    } catch {
      /* corrupted -> reseed */
    }
    return buildSeedDb();
  })();
  const listeners = new Set<() => void>();

  const persist = () => storage.setItem(DB_KEY, JSON.stringify(db));
  persist();

  const currentUserId = () => sessionStorage.getItem(USER_KEY) ?? storage.getItem(USER_KEY);
  const me = () => db.accounts.find((a) => a.id === currentUserId()) ?? null;
  const requireUser = () => {
    const u = me();
    if (!u) throw new AppError('Your session has expired. Please sign in again.', '401');
    return u;
  };
  const requireStaff = () => {
    const u = requireUser();
    if (u.role !== 'admin' && u.role !== 'doctor') throw denied();
    return u;
  };
  const requireAdmin = () => {
    const u = requireUser();
    if (u.role !== 'admin') throw denied();
    return u;
  };
  const publicProfile = ({ password: _pw, ...p }: DemoAccount): Profile => p;
  /** Admins and doctors see everything; visitors (not signed in) get no private fields. */
  const isStaff = () => me()?.role === 'admin' || me()?.role === 'doctor';
  const nowWall = () => nowKey(db.settings.timezone);
  const isUpcoming = (s: Session) => s.status === 'scheduled' && `${s.session_date}T${hhmm(s.start_time)}` > nowWall();

  /** Runs a mutation atomically: on error the database is left untouched. */
  async function tx<T>(fn: () => T): Promise<T> {
    await delay();
    const snapshot = clone(db);
    try {
      const result = clone(fn());
      persist();
      return result;
    } catch (e) {
      db = snapshot;
      throw e;
    }
  }
  const read = async <T,>(fn: () => T): Promise<T> => {
    await delay(60);
    return clone(fn());
  };

  const find = <T extends { id: string }>(list: T[], id: string, what: string) => {
    const item = list.find((x) => x.id === id);
    if (!item) throw new AppError(`${what} not found.`, 'PGRST116');
    return item;
  };

  function assertUniqueMember(m: Partial<MemberInput>, exceptId?: string) {
    if (m.member_code && db.members.some((x) => x.id !== exceptId && x.member_code === m.member_code))
      throw new AppError('A member with this Member ID already exists.', '23505');
    if (m.email && db.members.some((x) => x.id !== exceptId && x.email.toLowerCase() === m.email!.toLowerCase()))
      throw new AppError('A member with this email already exists.', '23505');
  }
  function assertDoctor(doctorId: string | null | undefined) {
    if (doctorId && !db.accounts.some((a) => a.id === doctorId && (a.role === 'doctor' || a.role === 'admin')))
      throw new AppError('Assigned doctor must be a doctor or admin account.', '23514');
  }
  function assertTimes(s: Pick<Session, 'start_time' | 'end_time'>) {
    if (hhmm(s.end_time) <= hhmm(s.start_time)) throw new AppError('End time must be after start time.', '23514');
  }
  function addToUpcoming(memberId: string) {
    for (const s of db.sessions.filter(isUpcoming)) {
      if (!db.attendance.some((a) => a.session_id === s.id && a.team_member_id === memberId)) {
        db.attendance.push(blankRecord(s.id, memberId));
      }
    }
  }
  function blankRecord(sessionId: string, memberId: string): AttendanceRecord {
    const t = now();
    return {
      id: uid(), session_id: sessionId, team_member_id: memberId, status: null, notes: null,
      recorded_by: null, recorded_at: null, created_at: t, updated_at: t,
    };
  }

  const api: Api = {
    mode: 'demo',

    async signIn(email, password, remember) {
      await delay(300);
      const acc = db.accounts.find((a) => a.email.toLowerCase() === email.trim().toLowerCase());
      if (!acc || acc.password !== password) throw new AppError('Incorrect email or password.');
      storage.removeItem(USER_KEY);
      sessionStorage.removeItem(USER_KEY);
      (remember ? storage : sessionStorage).setItem(USER_KEY, acc.id);
      listeners.forEach((l) => l());
      return publicProfile(acc);
    },
    async signOut() {
      storage.removeItem(USER_KEY);
      sessionStorage.removeItem(USER_KEY);
      listeners.forEach((l) => l());
    },
    currentProfile: () => read(() => (me() ? publicProfile(me()!) : null)),
    onAuthChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    changePassword: (password) =>
      tx(() => {
        if (password.length < 8) throw new AppError('Password must be at least 8 characters.');
        requireUser().password = password;
      }),

    getSettings: () => read(() => db.settings),
    updateSettings: (input) =>
      tx(() => {
        requireAdmin();
        db.settings = { ...db.settings, ...input, updated_at: now() };
        return db.settings;
      }),

    listSpecializations: () => read(() => ([...db.specializations].sort((a, b) => a.name.localeCompare(b.name)))),
    createSpecialization: (input) =>
      tx(() => {
        requireAdmin();
        if (db.specializations.some((s) => s.name.trim().toLowerCase() === input.name.trim().toLowerCase()))
          throw new AppError('A specialization with this name already exists.', '23505');
        const s: Specialization = { id: uid(), ...input, created_at: now() };
        db.specializations.push(s);
        return s;
      }),
    updateSpecialization: (id, input) =>
      tx(() => {
        requireAdmin();
        if (db.specializations.some((s) => s.id !== id && s.name.trim().toLowerCase() === input.name.trim().toLowerCase()))
          throw new AppError('A specialization with this name already exists.', '23505');
        const s = find(db.specializations, id, 'Specialization');
        Object.assign(s, input);
        return s;
      }),
    deleteSpecialization: (id) =>
      tx(() => {
        requireAdmin();
        if (db.members.some((m) => m.specialization_id === id))
          throw new AppError('This specialization is assigned to members. Reassign them first.', '23503');
        db.specializations = db.specializations.filter((s) => s.id !== id);
      }),

    listMembers: () =>
      read(() => {
        const list = isStaff() ? db.members : db.members.map((m) => ({ ...m, email: '', phone: null }));
        return [...list].sort((a, b) => a.member_code.localeCompare(b.member_code));
      }),
    createMember: (input) =>
      tx(() => {
        requireAdmin();
        assertUniqueMember(input);
        const t = now();
        const m: TeamMember = { id: uid(), ...input, created_at: t, updated_at: t };
        db.members.push(m);
        if (m.status === 'active') addToUpcoming(m.id);
        return m;
      }),
    updateMember: (id, input) =>
      tx(() => {
        requireAdmin();
        assertUniqueMember(input, id);
        const m = find(db.members, id, 'Member');
        const wasActive = m.status === 'active';
        Object.assign(m, input, { updated_at: now() });
        if (!wasActive && m.status === 'active') addToUpcoming(m.id);
        if (wasActive && m.status === 'inactive') {
          const upcoming = new Set(db.sessions.filter(isUpcoming).map((s) => s.id));
          db.attendance = db.attendance.filter(
            (a) => !(a.team_member_id === id && a.status === null && upcoming.has(a.session_id)),
          );
        }
        return m;
      }),
    deleteMember: (id) =>
      tx(() => {
        requireAdmin();
        find(db.members, id, 'Member');
        if (db.attendance.some((a) => a.team_member_id === id && a.status !== null))
          throw new AppError('This member has attendance history and cannot be deleted. Deactivate them instead.', '23503');
        db.attendance = db.attendance.filter((a) => a.team_member_id !== id);
        db.members = db.members.filter((m) => m.id !== id);
        db.accounts.forEach((a) => a.team_member_id === id && (a.team_member_id = null));
      }),
    async uploadAvatar(file) {
      requireAdmin();
      if (file.size > 2 * 1024 * 1024) throw new AppError('Image must be smaller than 2 MB.');
      // Demo: downscale to a small data URL so it fits in localStorage.
      const bitmap = await createImageBitmap(file);
      const size = 160;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      const scale = Math.max(size / bitmap.width, size / bitmap.height);
      const w = bitmap.width * scale;
      const h = bitmap.height * scale;
      ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
      // data: URLs are only used in demo mode; the DB constraint requires http(s) URLs.
      return canvas.toDataURL('image/jpeg', 0.8);
    },

    listProfiles: () =>
      read(() => {
        const list = isStaff()
          ? db.accounts.map(publicProfile)
          : db.accounts.filter((a) => a.role !== 'member').map((a) => ({ ...publicProfile(a), email: '' }));
        return list.sort((a, b) => a.full_name.localeCompare(b.full_name));
      }),
    updateProfile: (id, patch) =>
      tx(() => {
        const u = requireUser();
        if (u.id !== id && u.role !== 'admin') throw denied();
        const target = find(db.accounts, id, 'Account');
        if (u.role !== 'admin' && ('role' in patch || 'team_member_id' in patch))
          throw new AppError('Only an admin can change roles, emails or member links.', '42501');
        if (target.role === 'admin' && patch.role && patch.role !== 'admin' && db.accounts.filter((a) => a.role === 'admin').length <= 1)
          throw new AppError('The system must keep at least one admin.');
        Object.assign(target, patch);
        if (target.role !== 'member') target.team_member_id = null;
        return publicProfile(target);
      }),

    listSessions: () =>
      read(() => ([...db.sessions].sort((a, b) => `${a.session_date}${a.start_time}`.localeCompare(`${b.session_date}${b.start_time}`)))),
    createSession: (input) =>
      tx(() => {
        const u = requireStaff();
        assertDoctor(input.doctor_id);
        assertTimes(input);
        const t = now();
        const s: Session = { id: uid(), ...input, status: 'scheduled', cancelled_at: null, created_by: u.id, created_at: t, updated_at: t };
        db.sessions.push(s);
        // Every active member automatically appears in every new session.
        for (const m of db.members.filter((m) => m.status === 'active')) db.attendance.push(blankRecord(s.id, m.id));
        return s;
      }),
    updateSession: (id, input) =>
      tx(() => {
        requireStaff();
        const s = find(db.sessions, id, 'Session');
        assertDoctor(input.doctor_id);
        assertTimes({ ...s, ...input });
        Object.assign(s, input, { updated_at: now() });
        return s;
      }),
    setSessionCancelled: (id, cancelled) =>
      tx(() => {
        requireStaff();
        const s = find(db.sessions, id, 'Session');
        s.status = cancelled ? 'cancelled' : 'scheduled';
        s.cancelled_at = cancelled ? now() : null;
        s.updated_at = now();
        return s;
      }),
    deleteSession: (id) =>
      tx(() => {
        requireAdmin();
        find(db.sessions, id, 'Session');
        db.sessions = db.sessions.filter((s) => s.id !== id);
        db.attendance = db.attendance.filter((a) => a.session_id !== id);
      }),

    listAttendance: (filter = {}) =>
      read(() => {
        const list = db.attendance.filter(
          (a) => (!filter.sessionId || a.session_id === filter.sessionId) && (!filter.memberId || a.team_member_id === filter.memberId),
        );
        return isStaff() ? list : list.map((a) => ({ ...a, notes: null, recorded_by: null }));
      }),
    saveAttendance: (sessionId, entries) =>
      tx(() => {
        const u = requireStaff();
        const s = find(db.sessions, sessionId, 'Session');
        const out: AttendanceRecord[] = [];
        for (const e of entries) {
          // Unique (session, member): update the existing record or insert one.
          let rec = db.attendance.find((a) => a.session_id === sessionId && a.team_member_id === e.team_member_id);
          const statusChanged = !rec || rec.status !== e.status || rec.notes !== e.notes;
          if (s.status === 'cancelled' && e.status !== null && (!rec || rec.status !== e.status))
            throw new AppError('Cannot record attendance for a cancelled session.');
          if (!rec) {
            const member = find(db.members, e.team_member_id, 'Member');
            if (member.status === 'inactive') throw new AppError('Inactive members cannot be added to sessions.');
            rec = blankRecord(sessionId, e.team_member_id);
            db.attendance.push(rec);
          }
          if (statusChanged) {
            rec.status = e.status;
            rec.notes = e.notes;
            rec.recorded_by = e.status ? u.id : null;
            rec.recorded_at = e.status ? now() : null;
            rec.updated_at = now();
          }
          out.push(rec);
        }
        return out;
      }),
  };
  return api;
}

export function resetDemoData(storage: Storage = localStorage) {
  storage.removeItem(DB_KEY);
}

export const DEMO_LOGINS = [
  { role: 'admin' as Role, email: 'admin@example.com', password: SEED_PASSWORDS.admin },
  { role: 'doctor' as Role, email: 'doctor@example.com', password: SEED_PASSWORDS.doctor },
];

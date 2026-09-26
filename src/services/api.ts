import type {
  AppSettings, AttendanceEntry, AttendanceRecord, MemberInput, Profile, Session, SessionInput,
  SettingsInput, Specialization, SpecializationInput, TeamMember,
} from '@/types';

/** Error with a user-friendly message. */
export class AppError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = 'AppError';
  }
}

export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : 'Something went wrong. Please try again.';

/**
 * Data access contract used by the whole UI. Implementations:
 *  - supabaseApi: production (Postgres + RLS enforce every rule)
 *  - demoApi:     browser-local sample data that mirrors the same rules
 *
 * Read methods also work without signing in (public visitors). Visitors get
 * no private fields: member email/phone come back empty and attendance notes null.
 * Login accounts are created in the Supabase dashboard, not through this API.
 */
export interface Api {
  readonly mode: 'supabase' | 'demo';

  // auth
  signIn(email: string, password: string, remember: boolean): Promise<Profile>;
  signOut(): Promise<void>;
  currentProfile(): Promise<Profile | null>;
  onAuthChange(cb: () => void): () => void;
  changePassword(password: string): Promise<void>;

  // settings
  getSettings(): Promise<AppSettings>;
  updateSettings(input: SettingsInput): Promise<AppSettings>;

  // specializations
  listSpecializations(): Promise<Specialization[]>;
  createSpecialization(input: SpecializationInput): Promise<Specialization>;
  updateSpecialization(id: string, input: SpecializationInput): Promise<Specialization>;
  deleteSpecialization(id: string): Promise<void>;

  // team members
  listMembers(): Promise<TeamMember[]>;
  createMember(input: MemberInput): Promise<TeamMember>;
  updateMember(id: string, input: Partial<MemberInput>): Promise<TeamMember>;
  deleteMember(id: string): Promise<void>;
  uploadAvatar(file: File): Promise<string>;

  // accounts / profiles
  listProfiles(): Promise<Profile[]>;
  updateProfile(id: string, patch: Partial<Pick<Profile, 'full_name' | 'role' | 'team_member_id'>>): Promise<Profile>;

  // sessions
  listSessions(): Promise<Session[]>;
  createSession(input: SessionInput): Promise<Session>;
  updateSession(id: string, input: Partial<SessionInput>): Promise<Session>;
  setSessionCancelled(id: string, cancelled: boolean): Promise<Session>;
  deleteSession(id: string): Promise<void>;

  // attendance
  listAttendance(filter?: { sessionId?: string; memberId?: string }): Promise<AttendanceRecord[]>;
  /** Upserts one record per member (unique on session + member). */
  saveAttendance(sessionId: string, entries: AttendanceEntry[]): Promise<AttendanceRecord[]>;
}

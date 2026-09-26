export type Role = 'admin' | 'doctor' | 'member';
export type MemberStatus = 'active' | 'inactive';
export type SessionStatus = 'scheduled' | 'cancelled';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
/** Derived from date/time + status; never stored. */
export type SessionPhase = 'upcoming' | 'active' | 'completed' | 'cancelled';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  team_member_id: string | null;
  created_at: string;
}

export interface Specialization {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface TeamMember {
  id: string;
  member_code: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  specialization_id: string | null;
  status: MemberStatus;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  title: string;
  description: string | null;
  /** YYYY-MM-DD */
  session_date: string;
  /** HH:MM or HH:MM:SS */
  start_time: string;
  end_time: string;
  doctor_id: string | null;
  team_group: string;
  location: string | null;
  notes: string | null;
  status: SessionStatus;
  cancelled_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  team_member_id: string;
  /** null = not recorded yet */
  status: AttendanceStatus | null;
  notes: string | null;
  recorded_by: string | null;
  recorded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppSettings {
  organization_name: string;
  timezone: string;
  low_attendance_threshold: number;
  updated_at: string;
}

// ---- Inputs ---------------------------------------------------------------
export type MemberInput = Pick<
  TeamMember,
  'member_code' | 'full_name' | 'email' | 'phone' | 'avatar_url' | 'specialization_id' | 'status'
>;
export type SpecializationInput = Pick<Specialization, 'name' | 'description'>;
export type SessionInput = Pick<
  Session,
  'title' | 'description' | 'session_date' | 'start_time' | 'end_time' | 'doctor_id' | 'team_group' | 'location' | 'notes'
>;
export interface AttendanceEntry {
  team_member_id: string;
  status: AttendanceStatus | null;
  notes: string | null;
}
export type SettingsInput = Pick<AppSettings, 'organization_name' | 'timezone' | 'low_attendance_threshold'>;

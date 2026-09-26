/**
 * Attendance business rules — pure functions, no UI.
 *
 *   Attendance % = (Present + Late) / (Completed sessions − Excused) × 100
 *
 * - Only COMPLETED sessions count (future and active sessions never do).
 * - CANCELLED sessions never count.
 * - EXCUSED marks are removed from the denominator.
 * - Rows that were never recorded (status = null) do not count.
 */
import type { AttendanceRecord, AttendanceStatus, Session, SessionPhase, Specialization, TeamMember } from '@/types';
import { hhmm } from './dates';

export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['present', 'absent', 'late', 'excused'];

export const STATUS_META: Record<AttendanceStatus, { label: string; short: string; emoji: string }> = {
  present: { label: 'Present', short: 'P', emoji: '🟢' },
  absent: { label: 'Absent', short: 'A', emoji: '🔴' },
  late: { label: 'Late', short: 'L', emoji: '🟡' },
  excused: { label: 'Excused', short: 'E', emoji: '🔵' },
};

export function sessionPhase(s: Pick<Session, 'session_date' | 'start_time' | 'end_time' | 'status'>, now: string): SessionPhase {
  if (s.status === 'cancelled') return 'cancelled';
  const start = `${s.session_date}T${hhmm(s.start_time)}`;
  const end = `${s.session_date}T${hhmm(s.end_time)}`;
  if (end <= now) return 'completed';
  if (start <= now) return 'active';
  return 'upcoming';
}

export interface AttendanceCounts {
  present: number;
  absent: number;
  late: number;
  excused: number;
  /** recorded marks in counted sessions (incl. excused) */
  sessions: number;
  /** null when there is nothing to divide by */
  rate: number | null;
}

export function countStatuses(statuses: Iterable<AttendanceStatus | null>): AttendanceCounts {
  const c = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const s of statuses) if (s) c[s]++;
  const denominator = c.present + c.late + c.absent;
  return {
    ...c,
    sessions: denominator + c.excused,
    rate: denominator === 0 ? null : ((c.present + c.late) / denominator) * 100,
  };
}

export const sortSessions = <T extends Pick<Session, 'session_date' | 'start_time'>>(list: T[], dir: 'asc' | 'desc' = 'asc') =>
  [...list].sort((a, b) => {
    const k = `${a.session_date}${a.start_time}`.localeCompare(`${b.session_date}${b.start_time}`);
    return dir === 'asc' ? k : -k;
  });

/** Pre-computed view of the data used by dashboards, profiles and reports. */
export interface AttendanceIndex {
  now: string;
  phase: Map<string, SessionPhase>;
  /** completed, non-cancelled sessions ordered by date */
  countedSessions: Session[];
  /** records with a status that belong to counted sessions */
  countedRecords: AttendanceRecord[];
  byMember: Map<string, AttendanceRecord[]>;
  bySession: Map<string, AttendanceRecord[]>;
}

export function buildIndex(sessions: Session[], records: AttendanceRecord[], now: string): AttendanceIndex {
  const phase = new Map(sessions.map((s) => [s.id, sessionPhase(s, now)]));
  const countedSessions = sortSessions(sessions.filter((s) => phase.get(s.id) === 'completed'));
  const counted = new Set(countedSessions.map((s) => s.id));
  const countedRecords = records.filter((r) => r.status !== null && counted.has(r.session_id));
  const byMember = new Map<string, AttendanceRecord[]>();
  const bySession = new Map<string, AttendanceRecord[]>();
  for (const r of records) {
    (byMember.get(r.team_member_id) ?? byMember.set(r.team_member_id, []).get(r.team_member_id)!).push(r);
    (bySession.get(r.session_id) ?? bySession.set(r.session_id, []).get(r.session_id)!).push(r);
  }
  return { now, phase, countedSessions, countedRecords, byMember, bySession };
}

const counts = (idx: AttendanceIndex, records: AttendanceRecord[] | undefined) =>
  countStatuses((records ?? []).filter((r) => r.status && idx.phase.get(r.session_id) === 'completed').map((r) => r.status));

export const memberStats = (idx: AttendanceIndex, memberId: string) => counts(idx, idx.byMember.get(memberId));

export const sessionStats = (idx: AttendanceIndex, sessionId: string) => counts(idx, idx.bySession.get(sessionId));

/** Summary of a roster regardless of phase (used on the attendance screen). */
export function rosterSummary(statuses: (AttendanceStatus | null)[]) {
  const c = countStatuses(statuses);
  return { ...c, pending: statuses.filter((s) => s === null).length, total: statuses.length };
}

export interface Overview extends AttendanceCounts {
  totalMembers: number;
  activeMembers: number;
  totalSessions: number;
  completedSessions: number;
  upcomingSessions: number;
  cancelledSessions: number;
}

export function overview(idx: AttendanceIndex, members: TeamMember[], sessions: Session[]): Overview {
  const phases = [...idx.phase.values()];
  return {
    ...countStatuses(idx.countedRecords.map((r) => r.status)),
    totalMembers: members.length,
    activeMembers: members.filter((m) => m.status === 'active').length,
    totalSessions: sessions.filter((s) => s.status !== 'cancelled').length,
    completedSessions: idx.countedSessions.length,
    upcomingSessions: phases.filter((p) => p === 'upcoming' || p === 'active').length,
    cancelledSessions: phases.filter((p) => p === 'cancelled').length,
  };
}

/** Attendance % per completed session, oldest first (line chart). */
export function rateOverTime(idx: AttendanceIndex) {
  return idx.countedSessions
    .map((s) => ({ session: s, stats: sessionStats(idx, s.id) }))
    .filter((x) => x.stats.rate !== null);
}

export function rateBySpecialization(idx: AttendanceIndex, members: TeamMember[], specializations: Specialization[]) {
  const specOf = new Map(members.map((m) => [m.id, m.specialization_id]));
  return specializations
    .map((sp) => ({
      specialization: sp,
      members: members.filter((m) => m.specialization_id === sp.id).length,
      stats: countStatuses(idx.countedRecords.filter((r) => specOf.get(r.team_member_id) === sp.id).map((r) => r.status)),
    }))
    .filter((x) => x.stats.sessions > 0);
}

export const formatRate = (rate: number | null, digits = 1) => (rate === null ? '—' : `${rate.toFixed(digits)}%`);

/** Colour band of a rate relative to the configured threshold. */
export function rateTone(rate: number | null, threshold: number): 'good' | 'warn' | 'bad' | 'none' {
  if (rate === null) return 'none';
  if (rate < threshold) return 'bad';
  if (rate < Math.min(100, threshold + 10)) return 'warn';
  return 'good';
}

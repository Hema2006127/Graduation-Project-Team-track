import { describe, expect, it } from 'vitest';
import type { AttendanceRecord, AttendanceStatus, Session } from '@/types';
import { buildIndex, countStatuses, memberStats, overview, rateTone, sessionPhase } from './attendance';
import { nowKey } from './dates';

const session = (id: string, date: string, status: Session['status'] = 'scheduled', start = '19:00', end = '20:00'): Session => ({
  id, title: id, description: null, session_date: date, start_time: start, end_time: end, doctor_id: null, team_group: 'All',
  location: null, notes: null, status, cancelled_at: null, created_by: null, created_at: '', updated_at: '',
});
const rec = (sessionId: string, memberId: string, status: AttendanceStatus | null): AttendanceRecord => ({
  id: `${sessionId}-${memberId}`, session_id: sessionId, team_member_id: memberId, status, notes: null,
  recorded_by: null, recorded_at: null, created_at: '', updated_at: '',
});

describe('sessionPhase', () => {
  const s = session('s', '2026-09-27');
  it('is upcoming before start, active during, completed after end', () => {
    expect(sessionPhase(s, '2026-09-27T18:59')).toBe('upcoming');
    expect(sessionPhase(s, '2026-09-27T19:00')).toBe('active');
    expect(sessionPhase(s, '2026-09-27T19:59')).toBe('active');
    expect(sessionPhase(s, '2026-09-27T20:00')).toBe('completed');
    expect(sessionPhase(s, '2026-09-28T08:00')).toBe('completed');
  });
  it('cancelled wins over time', () => {
    expect(sessionPhase({ ...s, status: 'cancelled' }, '2026-10-01T00:00')).toBe('cancelled');
  });
  it('handles HH:MM:SS from Postgres', () => {
    expect(sessionPhase({ ...s, start_time: '19:00:00', end_time: '20:00:00' }, '2026-09-27T19:30')).toBe('active');
  });
});

describe('countStatuses — (Present + Late) / (Completed − Excused)', () => {
  it('matches the spec example: 17 present, 2 absent, 1 late of 20 → 90%', () => {
    const list: AttendanceStatus[] = [...Array(17).fill('present'), 'absent', 'absent', 'late'];
    const c = countStatuses(list);
    expect(c).toMatchObject({ present: 17, absent: 2, late: 1, excused: 0, sessions: 20 });
    expect(c.rate).toBe(90);
  });
  it('excludes excused from the denominator', () => {
    const c = countStatuses(['present', 'present', 'absent', 'excused']);
    expect(c.rate).toBeCloseTo((2 / 3) * 100);
    expect(c.sessions).toBe(4);
  });
  it('returns null rate when nothing to count (all excused / none)', () => {
    expect(countStatuses(['excused']).rate).toBeNull();
    expect(countStatuses([]).rate).toBeNull();
  });
  it('ignores unrecorded rows', () => {
    expect(countStatuses(['present', null, null]).sessions).toBe(1);
  });
});

describe('buildIndex / memberStats', () => {
  const now = '2026-09-27T21:00';
  const sessions = [
    session('past1', '2026-09-20'),
    session('past2', '2026-09-22'),
    session('cancelled', '2026-09-24', 'cancelled'),
    session('today-done', '2026-09-27', 'scheduled', '14:00', '15:00'),
    session('future', '2026-10-01'),
    session('active', '2026-09-27', 'scheduled', '20:30', '22:00'),
  ];
  const records = [
    rec('past1', 'm1', 'present'),
    rec('past2', 'm1', 'absent'),
    rec('cancelled', 'm1', 'absent'), // should never count (cannot happen in DB, but be defensive)
    rec('today-done', 'm1', 'late'),
    rec('future', 'm1', 'excused'),
    rec('active', 'm1', 'absent'),
    rec('past1', 'm2', 'excused'),
    rec('past2', 'm2', null),
  ];
  const idx = buildIndex(sessions, records, now);

  it('counts only completed, non-cancelled sessions', () => {
    expect(idx.countedSessions.map((s) => s.id)).toEqual(['past1', 'past2', 'today-done']);
  });
  it('member rate ignores cancelled, active and future sessions', () => {
    const s = memberStats(idx, 'm1');
    expect(s).toMatchObject({ present: 1, absent: 1, late: 1, excused: 0, sessions: 3 });
    expect(s.rate).toBeCloseTo((2 / 3) * 100);
  });
  it('member with only excused/unrecorded has no rate', () => {
    expect(memberStats(idx, 'm2').rate).toBeNull();
  });
  it('overview totals', () => {
    const ov = overview(idx, [], sessions);
    expect(ov.totalSessions).toBe(5);
    expect(ov.completedSessions).toBe(3);
    expect(ov.cancelledSessions).toBe(1);
    expect(ov.upcomingSessions).toBe(2);
    expect(ov.present + ov.absent + ov.late + ov.excused).toBe(4);
  });
});

describe('helpers', () => {
  it('rateTone bands', () => {
    expect(rateTone(null, 75)).toBe('none');
    expect(rateTone(70, 75)).toBe('bad');
    expect(rateTone(80, 75)).toBe('warn');
    expect(rateTone(90, 75)).toBe('good');
  });
  it('nowKey renders wall-clock time in a timezone', () => {
    const d = new Date('2026-09-27T17:30:00Z');
    expect(nowKey('UTC', d)).toBe('2026-09-27T17:30');
    expect(nowKey('Africa/Cairo', d)).toBe('2026-09-27T20:30'); // EEST (UTC+3)
  });
});

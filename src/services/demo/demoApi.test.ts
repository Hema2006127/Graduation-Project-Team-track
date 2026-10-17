import { beforeEach, describe, expect, it } from 'vitest';
import type { Api } from '../api';
import { createDemoApi } from './demoApi';
import { SEED_PASSWORDS } from './seedData';

class MemoryStorage implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.get(k) ?? null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, v); }
}
(globalThis as { sessionStorage?: Storage }).sessionStorage = new MemoryStorage();

let api: Api;
const login = (email: string, role: keyof typeof SEED_PASSWORDS) => api.signIn(email, SEED_PASSWORDS[role], true);
const futureDate = () => new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);

beforeEach(() => {
  api = createDemoApi(new MemoryStorage());
});

describe('demo API mirrors database rules', () => {
  it('rejects wrong passwords', async () => {
    await expect(api.signIn('admin@example.com', 'nope', true)).rejects.toThrow(/Incorrect/);
  });

  it('visitors (not signed in) can view data without private fields', async () => {
    const members = await api.listMembers();
    expect(members.length).toBe(13);
    expect(members.every((m) => m.email === '' && m.phone === null)).toBe(true);
    const att = await api.listAttendance();
    expect(att.length).toBeGreaterThan(0);
    expect(att.every((a) => a.notes === null && a.recorded_by === null)).toBe(true);
    const profiles = await api.listProfiles();
    expect(profiles.every((p) => p.role !== 'member' && p.email === '')).toBe(true);
    expect((await api.listSessions()).length).toBe(30);
  });

  it('visitors cannot change anything', async () => {
    const [s] = await api.listSessions();
    const [m] = await api.listMembers();
    await expect(api.saveAttendance(s.id, [{ team_member_id: m.id, status: 'present', notes: null }])).rejects.toThrow(/sign in/);
    await expect(api.createSession({ title: 'X', description: null, session_date: futureDate(), start_time: '10:00', end_time: '11:00', doctor_id: null, team_group: 'All', location: null, notes: null })).rejects.toThrow(/sign in/);
    await expect(api.updateMember(m.id, { full_name: 'Hacked' })).rejects.toThrow(/sign in/);
  });

  it('staff see private fields', async () => {
    await login('doctor@example.com', 'doctor');
    expect((await api.listMembers()).every((m) => m.email.includes('@'))).toBe(true);
  });

  it('doctor creates a session and all active members are added automatically', async () => {
    const doc = await login('doctor@example.com', 'doctor');
    const s = await api.createSession({ title: 'New', description: null, session_date: futureDate(), start_time: '10:00', end_time: '11:00', doctor_id: doc.id, team_group: 'All', location: null, notes: null });
    const roster = await api.listAttendance({ sessionId: s.id });
    const active = (await api.listMembers()).filter((m) => m.status === 'active');
    expect(roster).toHaveLength(active.length);
    expect(roster.every((r) => r.status === null)).toBe(true);
  });

  it('saving attendance twice updates the single record (no duplicates)', async () => {
    const doc = await login('doctor@example.com', 'doctor');
    const s = await api.createSession({ title: 'Dup', description: null, session_date: futureDate(), start_time: '10:00', end_time: '11:00', doctor_id: doc.id, team_group: 'All', location: null, notes: null });
    const [first] = await api.listAttendance({ sessionId: s.id });
    await api.saveAttendance(s.id, [{ team_member_id: first.team_member_id, status: 'present', notes: null }]);
    await api.saveAttendance(s.id, [{ team_member_id: first.team_member_id, status: 'late', notes: 'bus' }]);
    const recs = (await api.listAttendance({ sessionId: s.id })).filter((r) => r.team_member_id === first.team_member_id);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ status: 'late', notes: 'bus', recorded_by: doc.id });
  });

  it('cannot record attendance on a cancelled session', async () => {
    const doc = await login('doctor@example.com', 'doctor');
    const s = await api.createSession({ title: 'C', description: null, session_date: futureDate(), start_time: '10:00', end_time: '11:00', doctor_id: doc.id, team_group: 'All', location: null, notes: null });
    await api.setSessionCancelled(s.id, true);
    const [r] = await api.listAttendance({ sessionId: s.id });
    await expect(api.saveAttendance(s.id, [{ team_member_id: r.team_member_id, status: 'present', notes: null }])).rejects.toThrow(/cancelled/);
  });

  it('doctor cannot manage members, delete sessions, change roles or settings', async () => {
    const doc = await login('doctor@example.com', 'doctor');
    const [s] = await api.listSessions();
    const admin = (await api.listProfiles()).find((p) => p.role === 'admin')!;
    await expect(api.createMember({ member_code: 'TM099', full_name: 'X Y', email: 'x@example.com', phone: null, avatar_url: null, specialization_id: null, status: 'active' })).rejects.toThrow(/permission/);
    await expect(api.deleteSession(s.id)).rejects.toThrow(/permission/);
    await expect(api.updateProfile(admin.id, { full_name: 'Hacked' })).rejects.toThrow(/permission/);
    await expect(api.updateProfile(doc.id, { role: 'admin' })).rejects.toThrow(/Only an admin/);
    await expect(api.updateSettings({ organization_name: 'X', timezone: 'UTC', low_attendance_threshold: 1 })).rejects.toThrow(/permission/);
  });

  it('member lifecycle: deactivate removes from upcoming sessions, history kept, delete blocked', async () => {
    await login('admin@example.com', 'admin');
    const hema = (await api.listMembers()).find((m) => m.email === 'hema@example.com')!;
    const before = await api.listAttendance({ memberId: hema.id });
    const recorded = before.filter((r) => r.status !== null).length;
    await api.updateMember(hema.id, { status: 'inactive' });
    const after = await api.listAttendance({ memberId: hema.id });
    expect(after.filter((r) => r.status !== null)).toHaveLength(recorded);
    expect(after.length).toBeLessThan(before.length);
    await expect(api.deleteMember(hema.id)).rejects.toThrow(/Deactivate them instead/);
    const s = await api.createSession({ title: 'After', description: null, session_date: futureDate(), start_time: '10:00', end_time: '11:00', doctor_id: null, team_group: 'All', location: null, notes: null });
    expect((await api.listAttendance({ sessionId: s.id })).some((r) => r.team_member_id === hema.id)).toBe(false);
  });

  it('validates uniqueness and time order', async () => {
    await login('admin@example.com', 'admin');
    await expect(api.createMember({ member_code: 'TM001', full_name: 'Dup', email: 'dup@example.com', phone: null, avatar_url: null, specialization_id: null, status: 'active' })).rejects.toThrow(/Member ID already exists/);
    await expect(api.createSpecialization({ name: ' backend ', description: null })).rejects.toThrow(/already exists/);
    await expect(api.createSession({ title: 'Bad', description: null, session_date: futureDate(), start_time: '11:00', end_time: '10:00', doctor_id: null, team_group: 'All', location: null, notes: null })).rejects.toThrow(/End time/);
  });

  it('admin can delete a member without history, a session and an unused specialization', async () => {
    await login('admin@example.com', 'admin');
    const m = await api.createMember({ member_code: 'TM090', full_name: 'Temp', email: 'temp@example.com', phone: null, avatar_url: null, specialization_id: null, status: 'active' });
    await expect(api.deleteMember(m.id)).resolves.toBeUndefined();
    expect((await api.listMembers()).some((x) => x.id === m.id)).toBe(false);
    const sp = await api.createSpecialization({ name: 'DevOps', description: null });
    await expect(api.deleteSpecialization(sp.id)).resolves.toBeUndefined();
    const s = await api.createSession({ title: 'Temp', description: null, session_date: futureDate(), start_time: '10:00', end_time: '11:00', doctor_id: null, team_group: 'All', location: null, notes: null });
    await expect(api.deleteSession(s.id)).resolves.toBeUndefined();
    expect(await api.listAttendance({ sessionId: s.id })).toHaveLength(0);
    // survives a reload from storage
    expect((await api.listSessions()).some((x) => x.id === s.id)).toBe(false);
  });

  it('keeps at least one admin', async () => {
    const admin = await login('admin@example.com', 'admin');
    await expect(api.updateProfile(admin.id, { role: 'doctor' })).rejects.toThrow(/at least one admin/);
  });

  it('anyone can list, create, toggle, update, and delete weekly track tasks', async () => {
    // 1. List initial seed tasks
    const initialTasks = await api.listTasks();
    expect(initialTasks.length).toBeGreaterThan(0);

    const [specs, sessions] = await Promise.all([api.listSpecializations(), api.listSessions()]);
    const frontend = specs.find((s) => s.name === 'Frontend')!;
    const targetSession = sessions[0];

    // 2. Filter by track
    const frontendTasks = await api.listTasks({ specializationId: frontend.id });
    expect(frontendTasks.every((t) => t.specialization_id === frontend.id)).toBe(true);

    // Filter by session
    const sessionTasks = await api.listTasks({ sessionId: targetSession.id });
    expect(sessionTasks.every((t) => t.session_id === targetSession.id)).toBe(true);

    // 3. Create a new weekly task linked to a session
    const created = await api.createTask({
      title: 'Implement Dark Mode for Mobile',
      description: 'Support OLED dark theme and system preference',
      specialization_id: frontend.id,
      session_id: targetSession.id,
      week_number: 4,
      priority: 'high',
      due_date: '2026-10-25',
    });
    expect(created.id).toBeDefined();
    expect(created.title).toBe('Implement Dark Mode for Mobile');
    expect(created.session_id).toBe(targetSession.id);
    expect(created.session_title).toBe(targetSession.title);
    expect(created.is_completed).toBe(false);
    expect(created.completed_at).toBeNull();

    // 4. Toggle completion status ("يعلم عليه عملو ولا لا")
    const toggled = await api.toggleTaskCompleted(created.id, true);
    expect(toggled.is_completed).toBe(true);
    expect(toggled.completed_at).not.toBeNull();

    // Toggle back to false
    const untoggled = await api.toggleTaskCompleted(created.id, false);
    expect(untoggled.is_completed).toBe(false);
    expect(untoggled.completed_at).toBeNull();

    // 5. Update task
    const updated = await api.updateTask(created.id, {
      title: 'Implement Dark Mode & Theme Toggle',
      priority: 'low',
    });
    expect(updated.title).toBe('Implement Dark Mode & Theme Toggle');
    expect(updated.priority).toBe('low');

    // 6. Delete task
    await api.deleteTask(created.id);
    const afterDelete = await api.listTasks({ specializationId: frontend.id });
    expect(afterDelete.some((t) => t.id === created.id)).toBe(false);
  });
});


/**
 * Realistic sample data — the single source for both demo mode and the
 * generated `supabase/seed.sql` (see scripts/generate-seed-sql.mjs).
 * Session dates are expressed as day offsets from "today" so the data always
 * contains past, current and upcoming sessions.
 *
 * Keep this file free of runtime imports (type imports only) so Node can load it directly.
 */
import type { AttendanceStatus, Role } from '../../types';

const uuid = (prefix: string, n: number) =>
  `${prefix.padEnd(8, '0')}-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

export const SEED_SPECIALIZATIONS = [
  ['AI / Machine Learning', 'Models, data pipelines and experiments'],
  ['Backend', 'APIs, services and integrations'],
  ['Frontend', 'Web client development'],
  ['Flutter', 'Cross-platform mobile app'],
  ['UI/UX', 'Research, wireframes and visual design'],
  ['Database', 'Schema design and data modelling'],
  ['Cyber Security', 'Threat modelling and security reviews'],
  ['Documentation', 'Reports, manuals and project documentation'],
  ['Testing', 'QA, automated and manual testing'],
].map(([name, description], i) => ({ id: uuid('a1', i + 1), name, description }));

const spec = (name: string) => SEED_SPECIALIZATIONS.find((s) => s.name === name)!.id;

/** reliability = probability of being present on time */
const MEMBER_ROWS: [string, string, string, number][] = [
  ['Ahmed Mohamed', 'ahmed', 'AI / Machine Learning', 0.93],
  ['Hema Mohamed', 'hema', 'Flutter', 0.86],
  ['Sara Ali', 'sara', 'UI/UX', 0.9],
  ['Mohamed Hassan', 'mohamed', 'Backend', 0.74],
  ['Nour El-Din', 'nour', 'Frontend', 0.88],
  ['Mariam Khaled', 'mariam', 'Database', 0.95],
  ['Omar Farouk', 'omar', 'Cyber Security', 0.42],
  ['Yasmin Adel', 'yasmin', 'Documentation', 0.9],
  ['Youssef Ibrahim', 'youssef', 'Testing', 0.8],
  ['Laila Mostafa', 'laila', 'AI / Machine Learning', 0.84],
  ['Karim Samir', 'karim', 'Backend', 0.5],
  ['Salma Tarek', 'salma', 'Frontend', 0.92],
  ['Hassan Nabil', 'hassan', 'Flutter', 0.78], // becomes inactive (left the team)
];

export const SEED_MEMBERS = MEMBER_ROWS.map(([full_name, handle, specName, reliability], i) => ({
  id: uuid('b1', i + 1),
  member_code: `TM${String(i + 1).padStart(3, '0')}`,
  full_name,
  email: `${handle}@example.com`,
  phone: `+20 10${String(1234567 + i * 7919).slice(0, 7)}${i % 10}`,
  specialization_id: spec(specName),
  reliability,
  finalStatus: (i === 12 ? 'inactive' : 'active') as 'active' | 'inactive',
}));

/** Index of the inactive member's last session (they left after it). */
export const INACTIVE_MEMBER_LAST_SESSION = 9;

export const SEED_PASSWORDS: Record<Role, string> = {
  admin: 'Admin@12345',
  doctor: 'Doctor@12345',
  member: 'Member@12345',
};

/**
 * Staff logins for DEMO MODE only. Only admins and doctors sign in; everyone
 * else views the site without an account. The SQL seed creates no accounts —
 * in Supabase you add the admin/doctor users yourself (see README).
 */
export const SEED_ACCOUNTS: { id: string; email: string; full_name: string; role: Role; memberId: string | null }[] = [
  { id: uuid('d1', 1), email: 'admin@example.com', full_name: 'System Admin', role: 'admin', memberId: null },
  { id: uuid('d1', 2), email: 'doctor@example.com', full_name: 'Dr. Mona Ibrahim', role: 'doctor', memberId: null },
  { id: uuid('d1', 3), email: 'khaled.doctor@example.com', full_name: 'Dr. Khaled Mansour', role: 'doctor', memberId: null },
];

const DOCTOR_1 = SEED_ACCOUNTS[1].id;
const DOCTOR_2 = SEED_ACCOUNTS[2].id;

type SessionSeed = {
  id: string;
  title: string;
  description: string;
  dayOffset: number;
  start_time: string;
  end_time: string;
  doctor_id: string;
  team_group: string;
  location: string | null;
  notes: string | null;
  cancelled: boolean;
  /** attendance is not taken yet (lets you try the attendance screen on a finished session) */
  unrecorded: boolean;
};

const TITLES: [string, string, string][] = [
  ['Weekly Team Meeting', 'Progress updates from every sub-team and blockers.', 'Whole Team'],
  ['AI Model Meeting', 'Review model accuracy, datasets and training runs.', 'AI / Machine Learning'],
  ['Backend Architecture Review', 'API contracts, services and deployment plan.', 'Backend'],
  ['Sprint Planning', 'Plan the next sprint and assign tasks.', 'Whole Team'],
  ['UI/UX Design Review', 'Walkthrough of the latest screens and user flows.', 'UI/UX'],
  ['Flutter App Demo', 'Demo of the mobile app build on real devices.', 'Flutter'],
  ['Database Design Session', 'ERD review, indexes and migrations.', 'Database'],
  ['Security Audit Review', 'Findings from the latest security review.', 'Cyber Security'],
  ['Documentation Sync', 'Status of the final report and user manual.', 'Documentation'],
  ['Testing Strategy', 'Test plan, coverage and bug triage.', 'Testing'],
];

// Past sessions: ~2-3 per week over the last 8 weeks; then today and upcoming.
const PAST_OFFSETS = [-56, -54, -51, -49, -47, -44, -42, -40, -37, -35, -33, -30, -28, -26, -23, -21, -19, -16, -14, -12, -9, -7, -5, -2];
const CANCELLED_OFFSET = -33;
const UNRECORDED_OFFSET = -2;
const FUTURE_OFFSETS = [0, 2, 4, 7, 9, 14];

export const SEED_SESSIONS: SessionSeed[] = [...PAST_OFFSETS, ...FUTURE_OFFSETS].map((dayOffset, i) => {
  // Today's session is the "AI Model Meeting" 07:00 PM - 08:00 PM
  const [title, description, team_group] = dayOffset === 0 ? TITLES[1] : TITLES[i % TITLES.length];
  const evening = dayOffset === 0 || i % 3 !== 1;
  return {
    id: uuid('c1', i + 1),
    title,
    description,
    dayOffset,
    start_time: evening ? '19:00' : '14:00',
    end_time: evening ? '20:00' : '15:30',
    doctor_id: i % 4 === 3 ? DOCTOR_2 : DOCTOR_1,
    team_group,
    location: i % 2 === 0 ? 'Lab 204, Faculty of Computers' : 'Online (Google Meet)',
    notes: dayOffset === CANCELLED_OFFSET ? 'Cancelled — public holiday.' : null,
    cancelled: dayOffset === CANCELLED_OFFSET,
    unrecorded: dayOffset === UNRECORDED_OFFSET,
  };
});

/** Deterministic PRNG so demo data and SQL seed are identical. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type SeedAttendance = {
  session_id: string;
  team_member_id: string;
  status: AttendanceStatus;
  notes: string | null;
  recorded_by: string;
};

export const SEED_ATTENDANCE: SeedAttendance[] = (() => {
  const rand = mulberry32(20260927);
  const out: SeedAttendance[] = [];
  SEED_SESSIONS.forEach((s, si) => {
    if (s.dayOffset >= 0 || s.cancelled || s.unrecorded) return;
    SEED_MEMBERS.forEach((m, mi) => {
      if (mi === 12 && si > INACTIVE_MEMBER_LAST_SESSION) return;
      const r = rand();
      let status: AttendanceStatus;
      if (r < m.reliability) status = 'present';
      else if (r < m.reliability + (1 - m.reliability) * 0.35) status = 'late';
      else if (r < m.reliability + (1 - m.reliability) * 0.55) status = 'excused';
      else status = 'absent';
      const notes =
        status === 'excused' ? 'Medical excuse submitted' : status === 'late' ? 'Arrived 15 min late' : null;
      out.push({ session_id: s.id, team_member_id: m.id, status, notes, recorded_by: s.doctor_id });
    });
  });
  return out;
})();

export const SEED_SETTINGS = {
  organization_name: 'Graduation Project Team',
  timezone: 'Africa/Cairo',
  low_attendance_threshold: 75,
};

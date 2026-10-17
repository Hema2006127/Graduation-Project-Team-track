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
const MEMBER_ROWS: [string, string, string[], number][] = [
  ['Ahmed Mohamed', 'ahmed', ['AI / Machine Learning', 'Backend'], 0.93],
  ['Hema Mohamed', 'hema', ['Flutter', 'Frontend'], 0.86],
  ['Sara Ali', 'sara', ['UI/UX', 'Frontend'], 0.9],
  ['Mohamed Hassan', 'mohamed', ['Backend', 'Database'], 0.74],
  ['Nour El-Din', 'nour', ['Frontend', 'UI/UX'], 0.88],
  ['Mariam Khaled', 'mariam', ['Database', 'Backend'], 0.95],
  ['Omar Farouk', 'omar', ['Cyber Security', 'Backend'], 0.42],
  ['Yasmin Adel', 'yasmin', ['Documentation', 'Testing'], 0.9],
  ['Youssef Ibrahim', 'youssef', ['Testing', 'Documentation'], 0.8],
  ['Laila Mostafa', 'laila', ['AI / Machine Learning', 'Testing'], 0.84],
  ['Karim Samir', 'karim', ['Backend', 'Cyber Security'], 0.5],
  ['Salma Tarek', 'salma', ['Frontend', 'Flutter'], 0.92],
  ['Hassan Nabil', 'hassan', ['Flutter'], 0.78], // becomes inactive (left the team)
];

export const SEED_MEMBERS = MEMBER_ROWS.map(([full_name, handle, specNames, reliability], i) => ({
  id: uuid('b1', i + 1),
  member_code: `TM${String(i + 1).padStart(3, '0')}`,
  full_name,
  email: `${handle}@example.com`,
  phone: `+20 10${String(1234567 + i * 7919).slice(0, 7)}${i % 10}`,
  specialization_id: spec(specNames[0]),
  specialization_ids: specNames.map(spec),
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

export interface SeedTask {
  id: string;
  title: string;
  description: string | null;
  specialization_id: string;
  session_id: string | null;
  week_number: number;
  assigned_member_id: string | null;
  is_completed: boolean;
  priority: 'low' | 'medium' | 'high';
  due_date: string | null;
  subtasks?: { id: string; title: string; is_completed: boolean }[];
}

const sess = (titleKeyword: string) =>
  SEED_SESSIONS.find((s) => s.title.toLowerCase().includes(titleKeyword.toLowerCase()))?.id ?? SEED_SESSIONS[0].id;

export const SEED_TASKS: SeedTask[] = [
  // Frontend
  {
    id: uuid('t1', 1),
    title: 'Initialize repository, setup Vite, Tailwind CSS & routing',
    description: 'Set up Vite with React 19, Tailwind CSS v4, and react-router v8.',
    specialization_id: spec('Frontend'),
    session_id: sess('Weekly Team Meeting'),
    week_number: 1,
    assigned_member_id: SEED_MEMBERS.find((m) => m.full_name === 'Nour El-Din')?.id ?? null,
    is_completed: true,
    priority: 'high',
    due_date: '2026-10-04',
    subtasks: [
      { id: 'sub-1', title: 'Initialize Vite React project with TypeScript', is_completed: true },
      { id: 'sub-2', title: 'Configure Tailwind CSS v4 styling & color palette', is_completed: true },
      { id: 'sub-3', title: 'Setup react-router navigation and AppLayout', is_completed: true },
    ],
  },
  {
    id: uuid('t1', 2),
    title: 'Implement responsive team dashboard and analytics charts',
    description: 'Build stat cards, attendance donut chart, and member performance list.',
    specialization_id: spec('Frontend'),
    session_id: sess('Sprint Planning'),
    week_number: 2,
    assigned_member_id: SEED_MEMBERS.find((m) => m.full_name === 'Salma Tarek')?.id ?? null,
    is_completed: true,
    priority: 'high',
    due_date: '2026-10-11',
  },
  {
    id: uuid('t1', 3),
    title: 'Build Weekly Track Tasks & To-Do management interface',
    description: 'Allow members to select track, filter by week, add tasks, and check completion.',
    specialization_id: spec('Frontend'),
    session_id: sess('UI/UX Design Review'),
    week_number: 3,
    assigned_member_id: SEED_MEMBERS.find((m) => m.full_name === 'Nour El-Din')?.id ?? null,
    is_completed: true,
    priority: 'high',
    due_date: '2026-10-18',
    subtasks: [
      { id: 'sub-4', title: 'Design task card component with session badges', is_completed: true },
      { id: 'sub-5', title: 'Implement subtask checklist with instant toggle', is_completed: true },
      { id: 'sub-6', title: 'Auto-detect registered member track & specialization', is_completed: true },
    ],
  },
  {
    id: uuid('t1', 4),
    title: 'Add Excel & PDF report generation for weekly progress',
    description: 'Export attendance and task delivery summaries per track.',
    specialization_id: spec('Frontend'),
    session_id: sess('Sprint Planning'),
    week_number: 4,
    assigned_member_id: SEED_MEMBERS.find((m) => m.full_name === 'Salma Tarek')?.id ?? null,
    is_completed: false,
    priority: 'medium',
    due_date: '2026-10-25',
  },

  // Backend
  {
    id: uuid('t1', 5),
    title: 'Design database schema, tables & entity relationships',
    description: 'Create PostgreSQL tables for members, specializations, sessions, and tasks.',
    specialization_id: spec('Backend'),
    session_id: sess('Database Design Session'),
    week_number: 1,
    assigned_member_id: SEED_MEMBERS.find((m) => m.full_name === 'Mohamed Hassan')?.id ?? null,
    is_completed: true,
    priority: 'high',
    due_date: '2026-10-04',
  },
  {
    id: uuid('t1', 6),
    title: 'Implement authentication & role-based access control (RBAC)',
    description: 'Secure API endpoints for admin and doctor roles.',
    specialization_id: spec('Backend'),
    session_id: sess('Backend Architecture Review'),
    week_number: 2,
    assigned_member_id: SEED_MEMBERS.find((m) => m.full_name === 'Karim Samir')?.id ?? null,
    is_completed: true,
    priority: 'high',
    due_date: '2026-10-11',
  },
  {
    id: uuid('t1', 7),
    title: 'Develop REST endpoints for track tasks & weekly progress',
    description: 'CRUD endpoints with filtering by specialization and week number.',
    specialization_id: spec('Backend'),
    session_id: sess('Backend Architecture Review'),
    week_number: 3,
    assigned_member_id: SEED_MEMBERS.find((m) => m.full_name === 'Mohamed Hassan')?.id ?? null,
    is_completed: true,
    priority: 'medium',
    due_date: '2026-10-18',
  },
  {
    id: uuid('t1', 8),
    title: 'Configure automated database backup and health monitoring',
    description: 'Setup cron backups and query performance logs.',
    specialization_id: spec('Backend'),
    session_id: sess('Backend Architecture Review'),
    week_number: 4,
    assigned_member_id: SEED_MEMBERS.find((m) => m.full_name === 'Karim Samir')?.id ?? null,
    is_completed: false,
    priority: 'low',
    due_date: '2026-10-25',
  },

  // Flutter
  {
    id: uuid('t1', 9),
    title: 'Setup Flutter project structure with Clean Architecture',
    description: 'Organize presentation, domain, and data layers with BLoC state management.',
    specialization_id: spec('Flutter'),
    session_id: sess('Weekly Team Meeting'),
    week_number: 1,
    assigned_member_id: SEED_MEMBERS.find((m) => m.full_name === 'Hema Mohamed')?.id ?? null,
    is_completed: true,
    priority: 'high',
    due_date: '2026-10-04',
  },
  {
    id: uuid('t1', 10),
    title: 'Build QR code scanner screen for session attendance',
    description: 'Integrate camera package and scanner overlay animation.',
    specialization_id: spec('Flutter'),
    session_id: sess('Flutter App Demo'),
    week_number: 2,
    assigned_member_id: SEED_MEMBERS.find((m) => m.full_name === 'Hema Mohamed')?.id ?? null,
    is_completed: true,
    priority: 'high',
    due_date: '2026-10-11',
    subtasks: [
      { id: 'sub-7', title: 'إعداد حزم الكاميرا وتصريح الوصول في Android & iOS', is_completed: true },
      { id: 'sub-8', title: 'تصميم واجهة الماسح والأنيميشن التفاعلي', is_completed: true },
      { id: 'sub-9', title: 'فك تشفير كود الحضور والتحقق من الجلسة', is_completed: true },
    ],
  },
  {
    id: uuid('t1', 11),
    title: 'Connect Mobile app to REST API with offline caching',
    description: 'Cache weekly tasks and attendance records locally using Hive.',
    specialization_id: spec('Flutter'),
    session_id: sess('Flutter App Demo'),
    week_number: 3,
    assigned_member_id: SEED_MEMBERS.find((m) => m.full_name === 'Hema Mohamed')?.id ?? null,
    is_completed: false,
    priority: 'high',
    due_date: '2026-10-18',
    subtasks: [
      { id: 'sub-10', title: 'إعداد Hive local storage للتخزين المؤقت', is_completed: true },
      { id: 'sub-11', title: 'ربط مزامنة التاسكات مع الـ REST API', is_completed: false },
      { id: 'sub-12', title: 'معالجة حالة انقطاع الاتصال بالإنترنت (Offline Mode)', is_completed: false },
    ],
  },

  // AI / Machine Learning
  {
    id: uuid('t1', 12),
    title: 'Dataset collection and data exploratory analysis (EDA)',
    description: 'Collect raw dataset, handle missing values, and normalize features.',
    specialization_id: spec('AI / Machine Learning'),
    session_id: sess('AI Model Meeting'),
    week_number: 1,
    assigned_member_id: SEED_MEMBERS.find((m) => m.full_name === 'Ahmed Mohamed')?.id ?? null,
    is_completed: true,
    priority: 'high',
    due_date: '2026-10-04',
  },
  {
    id: uuid('t1', 13),
    title: 'Train baseline machine learning model and measure metrics',
    description: 'Evaluate Accuracy, Precision, Recall, and Confusion Matrix.',
    specialization_id: spec('AI / Machine Learning'),
    session_id: sess('AI Model Meeting'),
    week_number: 2,
    assigned_member_id: SEED_MEMBERS.find((m) => m.full_name === 'Ahmed Mohamed')?.id ?? null,
    is_completed: true,
    priority: 'high',
    due_date: '2026-10-11',
    subtasks: [
      { id: 'sub-13', title: 'تجهيز مجموعة بيانات التدريب والاختبار (Train/Test Split)', is_completed: true },
      { id: 'sub-14', title: 'تدريب النموذج الأساسي وحساب Accuracy & Loss', is_completed: true },
      { id: 'sub-15', title: 'رسم مصفوفة الارتباك (Confusion Matrix) وتقييم النتائج', is_completed: true },
    ],
  },
  {
    id: uuid('t1', 14),
    title: 'Hyperparameter tuning & deep learning model training',
    description: 'Grid search for optimal learning rate, batch size, and dropout.',
    specialization_id: spec('AI / Machine Learning'),
    session_id: sess('AI Model Meeting'),
    week_number: 3,
    assigned_member_id: SEED_MEMBERS.find((m) => m.full_name === 'Ahmed Mohamed')?.id ?? null,
    is_completed: false,
    priority: 'high',
    due_date: '2026-10-18',
  },

  // UI/UX
  {
    id: uuid('t1', 15),
    title: 'User research, interviews & persona development',
    description: 'Map user journeys for doctors, admins, and students.',
    specialization_id: spec('UI/UX'),
    session_id: sess('UI/UX Design Review'),
    week_number: 1,
    assigned_member_id: SEED_MEMBERS.find((m) => m.full_name === 'Sara Ali')?.id ?? null,
    is_completed: true,
    priority: 'high',
    due_date: '2026-10-04',
  },
  {
    id: uuid('t1', 16),
    title: 'Design Figma UI component library and wireframes',
    description: 'Consistent color tokens, typography scales, buttons, and cards.',
    specialization_id: spec('UI/UX'),
    session_id: sess('UI/UX Design Review'),
    week_number: 2,
    assigned_member_id: SEED_MEMBERS.find((m) => m.full_name === 'Sara Ali')?.id ?? null,
    is_completed: true,
    priority: 'high',
    due_date: '2026-10-11',
  },
  {
    id: uuid('t1', 17),
    title: 'Create interactive prototype for weekly tasks flow',
    description: 'Test task addition and status toggling micro-interactions.',
    specialization_id: spec('UI/UX'),
    session_id: sess('UI/UX Design Review'),
    week_number: 3,
    assigned_member_id: SEED_MEMBERS.find((m) => m.full_name === 'Sara Ali')?.id ?? null,
    is_completed: true,
    priority: 'medium',
    due_date: '2026-10-18',
  },

  // Cyber Security
  {
    id: uuid('t1', 18),
    title: 'Security threat modeling & vulnerability analysis',
    description: 'Perform static code analysis and review API auth mechanisms.',
    specialization_id: spec('Cyber Security'),
    session_id: sess('Security Audit Review'),
    week_number: 2,
    assigned_member_id: SEED_MEMBERS.find((m) => m.full_name === 'Omar Farouk')?.id ?? null,
    is_completed: true,
    priority: 'high',
    due_date: '2026-10-11',
  },
  {
    id: uuid('t1', 19),
    title: 'Audit SQL injection risks and enforce RLS policies',
    description: 'Verify row-level security policies across all tables.',
    specialization_id: spec('Cyber Security'),
    session_id: sess('Security Audit Review'),
    week_number: 3,
    assigned_member_id: SEED_MEMBERS.find((m) => m.full_name === 'Omar Farouk')?.id ?? null,
    is_completed: false,
    priority: 'high',
    due_date: '2026-10-18',
  },

  // Documentation
  {
    id: uuid('t1', 20),
    title: 'Draft Chapter 1 & Chapter 2 of graduation documentation',
    description: 'Introduction, problem statement, and literature review.',
    specialization_id: spec('Documentation'),
    session_id: sess('Documentation Sync'),
    week_number: 2,
    assigned_member_id: SEED_MEMBERS.find((m) => m.full_name === 'Yasmin Adel')?.id ?? null,
    is_completed: true,
    priority: 'high',
    due_date: '2026-10-11',
  },
  {
    id: uuid('t1', 21),
    title: 'Document system architecture and database schema specifications',
    description: 'Class diagrams, sequence diagrams, and schema documentation.',
    specialization_id: spec('Documentation'),
    session_id: sess('Documentation Sync'),
    week_number: 3,
    assigned_member_id: SEED_MEMBERS.find((m) => m.full_name === 'Yasmin Adel')?.id ?? null,
    is_completed: false,
    priority: 'medium',
    due_date: '2026-10-18',
  },

  // Testing
  {
    id: uuid('t1', 22),
    title: 'Setup Vitest suite and write unit tests for business logic',
    description: 'Test attendance calculations, rates, and date helpers.',
    specialization_id: spec('Testing'),
    session_id: sess('Testing Strategy'),
    week_number: 2,
    assigned_member_id: SEED_MEMBERS.find((m) => m.full_name === 'Youssef Ibrahim')?.id ?? null,
    is_completed: true,
    priority: 'high',
    due_date: '2026-10-11',
  },
  {
    id: uuid('t1', 23),
    title: 'Write end-to-end test scenarios for Weekly Task workflows',
    description: 'Validate task creation, track selection, and completion toggling.',
    specialization_id: spec('Testing'),
    session_id: sess('Testing Strategy'),
    week_number: 3,
    assigned_member_id: SEED_MEMBERS.find((m) => m.full_name === 'Youssef Ibrahim')?.id ?? null,
    is_completed: false,
    priority: 'high',
    due_date: '2026-10-18',
  },
];



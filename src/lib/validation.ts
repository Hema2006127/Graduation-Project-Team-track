/** Form validation schemas (mirror the database CHECK constraints). */
import { z } from 'zod';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

const email = z.string().trim().toLowerCase().regex(EMAIL_RE, 'Enter a valid email address');

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
  remember: z.boolean(),
});

export const memberSchema = z.object({
  member_code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,20}$/, 'Use 2-20 letters, digits or dashes (e.g. TM014)'),
  full_name: z.string().trim().min(2, 'Full name is required').max(100),
  email,
  phone: optionalText(20).refine((v) => v === null || /^[+0-9 ()-]{6,20}$/.test(v), 'Enter a valid phone number'),
  // data: URLs are only produced by demo-mode uploads; the database accepts http(s) URLs.
  avatar_url: optionalText(200000).refine((v) => v === null || /^(https?:\/\/|data:image\/)/i.test(v), 'Must be an image URL'),
  specialization_id: z.string().min(1, 'Choose a specialization'),
  specialization_ids: z.array(z.string()).optional(),
  status: z.enum(['active', 'inactive']),
});

export const specializationSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(60),
  description: optionalText(300),
});

export const sessionSchema = z
  .object({
    title: z.string().trim().min(2, 'Title is required').max(120),
    description: optionalText(2000),
    session_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date'),
    start_time: z.string().regex(TIME_RE, 'Choose a start time'),
    end_time: z.string().regex(TIME_RE, 'Choose an end time'),
    doctor_id: z.string().min(1, 'Choose a doctor'),
    team_group: z.string().trim().min(1, 'Team/group is required').max(80),
    location: optionalText(120),
    notes: optionalText(2000),
  })
  .refine((s) => s.end_time.slice(0, 5) > s.start_time.slice(0, 5), {
    path: ['end_time'],
    message: 'End time must be after start time',
  });

export const settingsSchema = z.object({
  organization_name: z.string().trim().min(2).max(80),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'Unknown timezone'),
  low_attendance_threshold: z.coerce.number().min(0).max(100),
});

export const trackTaskSchema = z.object({
  title: z.string().trim().min(2, 'Task title must be at least 2 characters').max(200),
  description: optionalText(1000),
  specialization_id: z.string().min(1, 'Please select a track'),
  session_id: optionalText(100),
  session_title: optionalText(200),
  week_number: z.coerce.number().int().min(1, 'Week must be at least 1').max(52, 'Week must be at most 52').default(1),
  assigned_member_id: optionalText(100),
  assigned_member_name: optionalText(100),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  due_date: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null)
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Enter a valid date (YYYY-MM-DD)'),
  subtasks: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().trim().min(1, 'Subtask title cannot be empty'),
        is_completed: z.boolean().default(false),
        completed_at: z.string().nullable().optional(),
      }),
    )
    .optional()
    .default([]),
});


export type FieldErrors = Record<string, string>;


/** Validates and returns either parsed data or a flat field → message map. */
export function validate<T extends z.ZodType>(
  schema: T,
  input: unknown,
): { data: z.output<T>; errors: null } | { data: null; errors: FieldErrors } {
  const r = schema.safeParse(input);
  if (r.success) return { data: r.data, errors: null };
  const errors: FieldErrors = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join('.') || '_';
    errors[key] ??= issue.message;
  }
  return { data: null, errors };
}

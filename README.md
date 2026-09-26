# Team Attendance & Session Tracking System

A web app where the Admin and the supervising Doctor manage team members, schedule sessions, take attendance, see statistics and export Excel reports.

**Who signs in:** only the **Admin** and the **Doctor**. You create those two accounts yourself in Supabase. **Everyone else** opens the site without an account and can only **view** the dashboard, the sessions and each member's attendance. Visitors never see emails, phone numbers or attendance notes, and they can't change anything.

**Stack:** React 19 + TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, RLS, Storage) · TanStack Query · Recharts · SheetJS (`xlsx-js-style`) · Lucide · Zod.

---

## 1. Quick start

```bash
npm install
npm run dev          # uses .env (your Supabase project)
npm run dev:demo     # demo mode: local sample data, never touches Supabase
```

If `.env` has no `VITE_SUPABASE_URL`, or you run `dev:demo`, the app runs in **demo mode**. That uses a local backend that keeps sample data in your browser's localStorage and follows the same permission rules as the database. You can reset it in **Settings → Reset demo data**. The demo staff logins are:

| Role   | Email              | Password       |
|--------|--------------------|----------------|
| Admin  | admin@example.com  | `Admin@12345`  |
| Doctor | doctor@example.com | `Doctor@12345` |

## 2. Production setup with Supabase

1. **Database.** Run these files in order in the SQL editor:
   - `supabase/migrations/20260927000001_schema.sql`: tables, constraints, triggers, RLS
   - `supabase/migrations/20260927000002_storage.sql`: the `avatars` bucket and its policies
   - `supabase/migrations/20260927000003_public_read.sql`: **read-only access for visitors** (without private fields)
   - `supabase/seed.sql`: optional sample members, sessions and attendance. It creates **no** login accounts.
   - `supabase/cleanup_demo_accounts.sql`: only if you ran the *old* seed. It removes the sample `@example.com` logins.
2. **Create your two accounts.** In Supabase, go to **Authentication → Users → Add user → Create new user**, enter the email and password, and tick *Auto Confirm User*. Do this once for you and once for the doctor.
3. **Give them their roles.** New users start without access. In the SQL editor, run:
   ```sql
   update public.profiles set role = 'admin'  where email = 'your-email@…';
   update public.profiles set role = 'doctor' where email = 'doctor-email@…';
   ```
   You can also edit the `role` column in **Table Editor → profiles**. Afterwards, the admin can change roles from **Settings → Staff accounts**. Setting a role to *No access* blocks that account from signing in.
4. **Auth settings.** Turn off *Allow new users to sign up* (Authentication → Sign In / Providers).
5. **Environment.** `.env` holds `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the publishable key).
6. Run `npm run build`, then deploy `dist/` to any static host (Vercel, Netlify, Cloudflare Pages). The host must be set up as an SPA, rewriting every route to `/index.html`.

> **Windows note:** this folder's name contains `&`, which breaks npm's `.cmd` shims. To work around it, every npm script calls `node` directly.

## 3. Scripts & tests

| Command | What it does |
|---|---|
| `npm run dev` / `dev:demo` / `build` / `preview` | Start the dev server (Supabase or demo mode), make a production build, preview the build |
| `npm run typecheck` | Run TypeScript in strict mode |
| `npm test` | Run 34 unit tests: attendance formula, Excel workbooks, demo-API permission rules (including visitors) |
| `npm run test:db` | Run 71 database tests: the **real migrations and seed** in PGlite (Postgres compiled to WASM). They check RLS per role, the columns visitors may read, triggers, duplicate prevention, cancelled sessions and inactive members. |
| `npm run test:e2e` | Run 34 browser tests (needs Chrome or Edge). They always build and test a **demo-mode** bundle (`dist-e2e`), and they abort if the page is connected to a real backend, so they never change your data. |
| `npm run seed:sql` | Regenerate `supabase/seed.sql` from `src/services/demo/seedData.ts` |

## 4. Architecture

```
supabase/
  migrations/           schema, RLS, triggers, public read access (the source of truth for permissions)
  seed.sql              generated sample data (no accounts)
src/
  types/                domain types
  lib/                  business logic with no UI code
    attendance.ts         session phases, statistics, attendance % formula
    excel.ts              3 Excel report builders
    validation.ts         Zod schemas (they mirror the DB CHECK constraints)
    permissions.ts        UI permission map, roles that may sign in
    dates.ts              timezone-aware date/time helpers
  services/             data access behind a single `Api` interface
    supabaseApi.ts        production implementation (visitors query public columns only)
    demo/                 localStorage implementation + seed data
  hooks/queries.ts      React Query hooks, mutations with toasts
  context/AuthContext   session, profile, viewer (staff role or guest)
  components/ui|layout|charts|attendance
  pages/admin|staff
```

**Routes:**
- `/` is the public site (Dashboard, Sessions, Team Members, member profiles) and is read-only.
- `/admin/*` and `/doctor/*` are for signed-in staff. After signing in, staff land on their own dashboard.
- Visitors who open a staff page are sent to the sign-in page. Staff who open the public site are sent to their own area.

## 5. Business rules and where they are enforced

| Rule | Enforced by |
|---|---|
| Only the Admin and the Doctor can sign in | UI sign-in check; non-staff accounts get no data from RLS |
| Visitors can view but never change anything, and never see emails, phones, attendance notes or who recorded a mark | `public_read` migration: `SELECT` grants on specific columns only, no write privileges |
| Only the Admin and the Doctor can create or edit sessions; only the Admin can delete them | RLS on `sessions` |
| The Doctor cannot manage members, roles or settings, and cannot touch the Admin account | RLS plus the `profiles_guard` trigger |
| Nobody can `TRUNCATE` or delete the database through the API | Revoked privileges; no delete policies for the doctor |
| One record per member per session | `unique (session_id, team_member_id)`; saves use upsert |
| Every active member is added to every new session | `sessions_roster` trigger |
| New or reactivated members join upcoming sessions; deactivated members leave upcoming sessions but keep their history | `team_members_roster` trigger |
| A member with recorded attendance cannot be deleted (deactivate instead) | FK `on delete restrict` |
| No attendance can be recorded on cancelled sessions | `attendance_validate` trigger |
| Who recorded each mark, and when, is stored | `attendance_validate` trigger (`recorded_by`, `recorded_at`) |
| At least one admin always exists | `profiles_guard` trigger |
| Users can never give themselves a role | `profiles_guard` trigger (only an admin, or you in the Supabase dashboard, can change roles) |

**Attendance % = (Present + Late) ÷ (completed sessions − Excused) × 100.** Only **completed** sessions count. Cancelled, upcoming and still-running sessions never count, and neither do rows that were never recorded. Session phases (Upcoming, Active, Completed, Cancelled) are calculated from the date and time in the team timezone, which you set in Settings.

## 6. Doctor's attendance flow

1. Go to **Take Attendance**, or open any session from **Sessions**.
2. Everyone starts as **Present** (you can also use **Mark all present**). Tap Absent, Late or Excused only for the exceptions. On desktop, you can focus a row and press `P`, `A`, `L` or `E`.
3. Optionally add a note per member, then click **Save attendance**. A confirmation shows the summary (Present / Absent / Late / Excused and the %), and you can export that session to Excel.
4. Attendance for a completed session is **locked** until someone clicks **Edit attendance**. If you try to leave with unsaved changes, the app asks you first.

## 7. Excel exports

- **Export attendance** (Reports): gives `Team_Attendance_Report_September_2026.xlsx`. It has a matrix of members × sessions (P/A/L/E) with totals and an Attendance % column, plus **Summary** and **Sessions** sheets.
- **Export records** (Reports): gives the filtered record list.
- **Export** on a session: gives `Member ID | Name | Specialization | Attendance Status | Notes`, with a session summary header.

All workbooks have styled headers, set column widths, auto-filters, real Excel dates (`dd/mm/yyyy`) and `0.0%` percentage formats.

// Database integration tests: runs the real migration + seed inside PGlite
// (Postgres compiled to WASM) with a minimal stub of Supabase's `auth` schema,
// then exercises RLS policies and business-rule triggers per role.
//
//   npm run test:db
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

const db = await PGlite.create({ extensions: { pgcrypto } });

// ---- Supabase platform stub ------------------------------------------------
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create schema extensions;
  create extension pgcrypto with schema extensions;
  create schema auth;
  create table auth.users (
    instance_id uuid, id uuid primary key, aud text, role text, email text unique,
    encrypted_password text, email_confirmed_at timestamptz,
    raw_app_meta_data jsonb, raw_user_meta_data jsonb,
    created_at timestamptz, updated_at timestamptz,
    confirmation_token text, email_change text, email_change_token_new text, recovery_token text
  );
  create table auth.identities (
    id uuid primary key, user_id uuid references auth.users(id) on delete cascade, provider_id text,
    identity_data jsonb, provider text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz
  );
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth, extensions to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`);

await db.exec(read('supabase/migrations/20260927000001_schema.sql'));
await db.exec(read('supabase/migrations/20260927000003_public_read.sql'));
await db.exec(read('supabase/seed.sql'));

// ---- Accounts, created like "Authentication -> Add user" in the Supabase dashboard
// (no app_metadata role), then promoted with SQL as described in the README.
const seed = await import('../src/services/demo/seedData.ts');
const ACCOUNTS = [
  ['admin@team.test', 'admin'], ['doctor@team.test', 'doctor'], ['doctor2@team.test', 'doctor'],
  ['hema@example.com', null], ['sara@example.com', null], ['stranger@team.test', null],
];
const ids = {};
for (const [i, [email]] of ACCOUNTS.entries()) {
  ids[email] = `e1000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;
  await db.query(`insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, extensions.crypt('Passw0rd!', extensions.gen_salt('bf')), now(), '{"provider":"email"}', '{}', now(), now())`, [ids[email], email]);
}
const defaultRoles = (await db.query(`select role from public.profiles`)).rows.map((r) => r.role);
for (const [email, role] of ACCOUNTS) if (role) await db.query('update public.profiles set role = $1 where email = $2', [role, email]);
await db.query(`update public.sessions set doctor_id = $1 where doctor_id is null`, [ids['doctor@team.test']]);

// ---- Helpers ----------------------------------------------------------------
const memberId = (email) => seed.SEED_MEMBERS.find((m) => m.email === email).id;
const ADMIN = ids['admin@team.test'];
const DOCTOR = ids['doctor@team.test'];
const HEMA = { id: ids['hema@example.com'], memberId: memberId('hema@example.com') };
const SARA = { id: ids['sara@example.com'], memberId: memberId('sara@example.com') };
const STRANGER = ids['stranger@team.test'];
const INACTIVE = seed.SEED_MEMBERS.find((m) => m.finalStatus === 'inactive');

let passed = 0;
let failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.log(`  ✘ ${name} ${extra}`); }
}

async function as(userId, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${userId ?? ''}', false);`);
  await db.exec(userId ? 'set role authenticated' : 'set role anon');
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const count = async (sql, params) => Number((await rows(sql, params))[0].n);
async function fails(sql, params, pattern) {
  try { await db.query(sql, params); return false; }
  catch (e) { return pattern ? pattern.test(e.message) : true; }
}
async function affected(sql, params) { return (await db.query(sql, params)).affectedRows ?? 0; }

// ---- Tests -----------------------------------------------------------------
console.log('\nSeed & structure');
ok(await count('select count(*) n from auth.users') === 6, 'seed creates no login accounts (only the test users exist)');
ok(defaultRoles.length === 6 && defaultRoles.every((r) => r === 'member'), 'manually added users start without staff privileges');
ok(await count(`select count(*) n from public.profiles where role = 'admin'`) === 1 && await count(`select count(*) n from public.profiles where role = 'doctor'`) === 2, 'roles can be set from the SQL editor / table editor');
ok(await count(`select count(*) n from public.profiles where team_member_id is not null`) === 2, 'accounts matching a member email are linked automatically');
ok(await count(`select count(*) n from public.team_members where status = 'active'`) === 12, '12 active members, 1 inactive');
ok(await count(`select count(*) n from public.attendance where team_member_id = $1 and status is not null`, [INACTIVE.id]) === 10, 'inactive member keeps attendance history');
ok(await count(`select count(*) n from public.attendance a join public.sessions s on s.id = a.session_id where a.team_member_id = $1 and s.session_date >= current_date`, [INACTIVE.id]) === 0, 'inactive member not in upcoming sessions');

console.log('\nAnonymous access');
await as(null, async () => {
  ok(await count('select count(*) n from public.sessions') === 30, 'visitor can view sessions');
  ok(await count('select count(*) n from public.team_members where full_name is not null') === 13, 'visitor can view member names');
  ok(await count('select count(*) n from public.attendance where status is not null') === 274, 'visitor can view attendance statuses');
  ok(await count('select count(*) n from public.profiles') === 3, 'visitor sees only staff profiles (doctor names)');
  ok(await fails('select email from public.team_members', [], /permission denied/), 'visitor cannot see member emails');
  ok(await fails('select phone from public.team_members', [], /permission denied/), 'visitor cannot see member phones');
  ok(await fails('select notes from public.attendance', [], /permission denied/), 'visitor cannot see attendance notes');
  ok(await fails('select email from public.profiles', [], /permission denied/), 'visitor cannot see staff emails');
  ok(await fails(`update public.attendance set status = 'present'`, [], /permission denied/), 'visitor cannot change attendance');
  ok(await fails(`insert into public.sessions (title, session_date, start_time, end_time) values ('X', current_date, '10:00', '11:00')`, [], /permission denied/), 'visitor cannot create sessions');
  ok(await fails('delete from public.team_members', [], /permission denied/), 'visitor cannot delete members');
  ok(await fails(`update public.app_settings set timezone = 'UTC'`, [], /permission denied/), 'visitor cannot change settings');
});
await as(STRANGER, async () => {
  ok(await count('select count(*) n from public.attendance') === 0, 'signed-in non-staff account gets no attendance data');
  ok(await affected(`update public.sessions set title = 'X'`) === 0, 'signed-in non-staff account cannot modify sessions');
});

console.log('\nTeam member permissions');
await as(HEMA.id, async () => {
  ok(await count('select count(*) n from public.team_members') === 1, 'member sees only own team_member row');
  const own = await count('select count(*) n from public.attendance where team_member_id = $1', [HEMA.memberId]);
  const all = await count('select count(*) n from public.attendance');
  ok(own > 0 && own === all, 'member sees only own attendance');
  ok(await count('select count(*) n from public.attendance where team_member_id = $1', [SARA.memberId]) === 0, "member cannot read another member's attendance");
  ok(await count('select count(*) n from public.sessions') === 30, 'member can view sessions');
  ok(await affected(`update public.attendance set status = 'present' where team_member_id = $1`, [HEMA.memberId]) === 0, 'member cannot modify own attendance');
  ok(await fails(`insert into public.sessions (title, session_date, start_time, end_time) values ('Hack', current_date, '10:00', '11:00')`, [], /row-level security/), 'member cannot create sessions');
  ok(await affected(`update public.sessions set start_time = '08:00'`) === 0, 'member cannot modify session times');
  ok(await affected(`update public.team_members set full_name = 'X'`) === 0, 'member cannot edit members');
  ok(await fails(`update public.profiles set role = 'admin' where id = $1`, [HEMA.id], /Only an admin/), 'member cannot escalate own role');
  ok(await affected(`update public.profiles set full_name = 'Hema M.' where id = $1`, [HEMA.id]) === 1, 'member can update own display name');
});

console.log('\nDoctor permissions');
let newSessionId;
await as(DOCTOR, async () => {
  const r = await rows(`insert into public.sessions (title, session_date, start_time, end_time, doctor_id)
                         values ('Doctor Session', current_date + 3, '10:00', '11:00', $1) returning id, created_by`, [DOCTOR]);
  newSessionId = r[0].id;
  ok(r[0].created_by === DOCTOR, 'doctor can create a session (created_by recorded)');
  ok(await count('select count(*) n from public.attendance where session_id = $1', [newSessionId]) === 12, 'all 12 active members auto-added to new session');
  ok(await count('select count(*) n from public.attendance where session_id = $1 and team_member_id = $2', [newSessionId, INACTIVE.id]) === 0, 'inactive member excluded from new session');
  ok(await affected(`update public.sessions set start_time = '10:30' where id = $1`, [newSessionId]) === 1, 'doctor can change session time');
  ok(await fails(`update public.sessions set end_time = '09:00' where id = $1`, [newSessionId], /sessions_time_order/), 'end time must be after start time');
  const n = await affected(`update public.attendance set status = 'late', notes = 'traffic' where session_id = $1 and team_member_id = $2`, [newSessionId, HEMA.memberId]);
  ok(n === 1, 'doctor can record attendance');
  const rec = await rows('select recorded_by, recorded_at from public.attendance where session_id = $1 and team_member_id = $2', [newSessionId, HEMA.memberId]);
  ok(rec[0].recorded_by === DOCTOR && rec[0].recorded_at, 'recorded_by / recorded_at audited automatically');
  ok(await fails(`insert into public.attendance (session_id, team_member_id, status) values ($1, $2, 'present')`, [newSessionId, HEMA.memberId], /attendance_session_member_key/), 'duplicate attendance rejected (unique constraint)');
  const up = await rows(`insert into public.attendance (session_id, team_member_id, status) values ($1, $2, 'absent')
                          on conflict (session_id, team_member_id) do update set status = excluded.status returning status`, [newSessionId, HEMA.memberId]);
  ok(up[0].status === 'absent', 'upsert updates the single existing record');
  ok(await affected(`update public.profiles set full_name = 'Hacked' where id = $1`, [ADMIN]) === 0, 'doctor cannot modify admin account');
  ok(await fails(`update public.profiles set role = 'admin' where id = $1`, [DOCTOR], /Only an admin/), 'doctor cannot change permissions (own role)');
  ok(await affected(`delete from public.profiles where id = $1`, [ADMIN]) === 0, 'doctor cannot delete admin');
  ok(await affected('delete from public.sessions') === 0, 'doctor cannot delete sessions');
  ok(await affected('delete from public.attendance') === 0, 'doctor cannot delete attendance records');
  ok(await fails('truncate public.attendance', [], /permission denied/), 'doctor cannot truncate tables');
  ok(await fails(`insert into public.team_members (member_code, full_name, email) values ('TM099', 'Nope', 'nope@example.com')`, [], /row-level security/), 'doctor cannot add team members');
  ok(await fails(`insert into public.specializations (name) values ('Nope')`, [], /row-level security/), 'doctor cannot manage specializations');
  ok(await fails(`update public.sessions set doctor_id = $2 where id = $1`, [newSessionId, HEMA.id], /must be a doctor/), 'session doctor must be a doctor/admin account');
  ok(await affected(`update public.sessions set status = 'cancelled' where id = $1`, [newSessionId]) === 1, 'doctor can cancel a session');
  ok(await fails(`update public.attendance set status = 'present' where session_id = $1 and team_member_id = $2`, [newSessionId, SARA.memberId], /cancelled session/), 'cannot record attendance on a cancelled session');
  ok(await affected(`update public.app_settings set timezone = 'UTC'`) === 0, 'doctor cannot change system settings');
});

console.log('\nAdmin permissions & member lifecycle');
await as(ADMIN, async () => {
  ok(await count('select count(*) n from public.team_members') === 13, 'admin sees all members incl. inactive');
  const m = await rows(`insert into public.team_members (member_code, full_name, email, specialization_id)
                         values ('TM050', 'New Person', 'new.person@example.com', $1) returning id`, [seed.SEED_SPECIALIZATIONS[0].id]);
  const newId = m[0].id;
  const upcoming = await count(`select count(*) n from public.sessions where status = 'scheduled' and (session_date + start_time) > (now() at time zone public.app_timezone())::timestamp`);
  ok(await count('select count(*) n from public.attendance where team_member_id = $1', [newId]) === upcoming, 'new active member added to all upcoming sessions');
  ok(await fails(`insert into public.team_members (member_code, full_name, email) values ('TM051', 'Dup', 'NEW.person@example.com')`, [], /team_members_email_key/), 'duplicate member email rejected (case-insensitive)');
  ok(await fails(`insert into public.team_members (member_code, full_name, email) values ('TM050', 'Dup', 'dup@example.com')`, [], /member_code_key/), 'duplicate member ID rejected');
  ok(await fails(`insert into public.team_members (member_code, full_name, email) values ('TM052', 'Bad', 'not-an-email')`, [], /check/), 'invalid email rejected');
  await db.query(`update public.team_members set status = 'inactive' where id = $1`, [newId]);
  ok(await count('select count(*) n from public.attendance where team_member_id = $1', [newId]) === 0, 'deactivated member removed from upcoming sessions');
  ok(await fails(`insert into public.attendance (session_id, team_member_id) values ($1, $2)`, [seed.SEED_SESSIONS.at(-1).id, newId], /Inactive members/), 'inactive member cannot be added to a session');
  ok(await affected('delete from public.team_members where id = $1', [newId]) === 1, 'member without history can be deleted');
  ok(await fails('delete from public.team_members where id = $1', [HEMA.memberId], /foreign key/), 'member with attendance history cannot be deleted (deactivate instead)');
  ok(await affected(`update public.attendance set status = 'excused' where session_id = $1 and team_member_id = $2`, [seed.SEED_SESSIONS[0].id, HEMA.memberId]) === 1, 'admin can correct a past attendance record');
  ok(await affected(`update public.profiles set role = 'doctor' where id = $1`, [DOCTOR]) === 1, 'admin can change roles');
  ok(await fails(`update public.profiles set role = 'doctor' where id = $1`, [ADMIN], /at least one admin/), 'last admin cannot be demoted');
  ok(await affected('delete from public.sessions where id = $1', [newSessionId]) === 1, 'admin can delete a session (attendance cascades)');
  ok(await count('select count(*) n from public.attendance where session_id = $1', [newSessionId]) === 0, 'session attendance removed with session');
  ok(await affected(`update public.app_settings set low_attendance_threshold = 80`) === 1, 'admin can update settings');
  ok(await fails(`insert into public.specializations (name) values ('  backend ')`, [], /specializations_name_key/), 'duplicate specialization name rejected (case/space-insensitive)');
  ok(await fails(`delete from public.specializations where id = $1`, [seed.SEED_SPECIALIZATIONS[0].id], /foreign key/), 'specialization in use cannot be deleted');
});

console.log('\nAttendance calculation (SQL cross-check)');
const stats = await rows(`
  select m.member_code,
    count(*) filter (where a.status in ('present','late')) as attended,
    count(*) filter (where a.status in ('present','late','absent')) as denom
  from public.attendance a
  join public.sessions s on s.id = a.session_id
  join public.team_members m on m.id = a.team_member_id
  where s.status = 'scheduled' and a.status is not null
    and public.session_phase(s.session_date, s.start_time, s.end_time, s.status) = 'completed'
  group by m.member_code order by m.member_code`);
ok(stats.length === 13 && stats.every((r) => Number(r.denom) > 0), 'every member has completed-session stats');
ok(await count(`select count(*) n from public.sessions where public.session_phase(session_date, start_time, end_time, status) = 'cancelled'`) === 1, 'cancelled session reported as cancelled phase');

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);

-- =============================================================================
-- Delete the sample data created by seed.sql (sessions, attendance, members).
-- Only rows with the seed's fixed IDs are removed, so anything you added
-- yourself is kept. Specializations and settings are kept as well.
-- Run once in the Supabase SQL editor.
-- =============================================================================
begin;

-- Attendance of sample members (also in sessions you created yourself).
delete from public.attendance
where team_member_id::text like 'b1000000-0000-4000-8000-%';

-- Sample sessions (their remaining attendance rows are deleted with them).
delete from public.sessions
where id::text like 'c1000000-0000-4000-8000-%';

-- Sample team members.
delete from public.team_members
where id::text like 'b1000000-0000-4000-8000-%';

commit;

-- Check: all three should be 0 unless you added your own data.
select
  (select count(*) from public.sessions)     as sessions,
  (select count(*) from public.attendance)   as attendance,
  (select count(*) from public.team_members) as team_members;

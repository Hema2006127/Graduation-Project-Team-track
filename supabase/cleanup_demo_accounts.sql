-- =============================================================================
-- One-time cleanup: remove the sample login accounts created by the OLD seed
-- (all @example.com users). Members, sessions and attendance are kept; the
-- sessions' doctor and "recorded by" fields become empty.
-- Run in the Supabase SQL editor, then create your own admin/doctor users.
-- =============================================================================
delete from auth.users where email like '%@example.com';

-- -----------------------------------------------------------------------------
-- After adding your users in Authentication -> Users -> Add user, give them
-- their role (new users start as 'member', which cannot sign in):
--
--   update public.profiles set role = 'admin'  where email = 'your-email@...';
--   update public.profiles set role = 'doctor' where email = 'doctor-email@...';
--
-- Optionally assign the doctor to the sample sessions:
--
--   update public.sessions set doctor_id = (select id from public.profiles where email = 'doctor-email@...')
--   where doctor_id is null;
-- -----------------------------------------------------------------------------

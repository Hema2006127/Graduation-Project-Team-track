-- =============================================================================
-- Public read-only access.
-- Only admin and doctor accounts sign in; everyone else opens the site without
-- an account and can only VIEW. Anonymous visitors never see emails, phone
-- numbers, attendance notes or who recorded a mark (column-level privileges),
-- and they have no insert/update/delete privileges at all.
-- =============================================================================

grant usage on schema public to anon;

grant select on public.app_settings, public.specializations, public.sessions to anon;
grant select (id, member_code, full_name, avatar_url, specialization_id, status, created_at, updated_at)
  on public.team_members to anon;
grant select (id, full_name, role) on public.profiles to anon;
grant select (id, session_id, team_member_id, status, recorded_at, created_at, updated_at)
  on public.attendance to anon;

create policy "settings: public read" on public.app_settings for select to anon using (true);
create policy "specializations: public read" on public.specializations for select to anon using (true);
create policy "sessions: public read" on public.sessions for select to anon using (true);
create policy "members: public read" on public.team_members for select to anon using (true);
create policy "attendance: public read" on public.attendance for select to anon using (true);
-- Only staff names (session doctor) are public.
create policy "profiles: public read staff" on public.profiles for select to anon
  using (role in ('admin', 'doctor'));

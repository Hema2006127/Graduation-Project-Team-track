-- =============================================================================
-- Team Attendance & Session Tracking System — core schema
-- Tables, constraints, indexes, business-rule triggers and Row Level Security.
-- Every permission rule is enforced here; the frontend checks are UX only.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role          as enum ('admin', 'doctor', 'member');
create type public.member_status     as enum ('active', 'inactive');
create type public.session_status    as enum ('scheduled', 'cancelled');
create type public.attendance_status as enum ('present', 'absent', 'late', 'excused');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.app_settings (
  id                       smallint primary key default 1 check (id = 1),
  organization_name        text not null default 'Project Team'
                             check (char_length(btrim(organization_name)) between 2 and 80),
  timezone                 text not null default 'Africa/Cairo',
  low_attendance_threshold numeric(5,2) not null default 75
                             check (low_attendance_threshold between 0 and 100),
  updated_at               timestamptz not null default now()
);
insert into public.app_settings default values;

create table public.specializations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 2 and 60),
  description text check (char_length(description) <= 300),
  created_at  timestamptz not null default now()
);
create unique index specializations_name_key on public.specializations (lower(btrim(name)));

create table public.team_members (
  id                uuid primary key default gen_random_uuid(),
  member_code       text not null check (member_code ~ '^[A-Z0-9-]{2,20}$'),
  full_name         text not null check (char_length(btrim(full_name)) between 2 and 100),
  email             text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone             text check (phone ~ '^[+0-9 ()-]{6,20}$'),
  avatar_url        text check (avatar_url ~* '^https?://'),
  specialization_id uuid references public.specializations (id) on delete restrict,
  status            public.member_status not null default 'active',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint team_members_member_code_key unique (member_code)
);
create unique index team_members_email_key on public.team_members (lower(email));
create index team_members_specialization_idx on public.team_members (specialization_id);
create index team_members_status_idx on public.team_members (status);

-- "users" of the system: one row per auth account.
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  full_name      text not null check (char_length(btrim(full_name)) between 1 and 100),
  email          text not null,
  role           public.app_role not null default 'member',
  team_member_id uuid unique references public.team_members (id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint profiles_member_link check (role = 'member' or team_member_id is null)
);
create unique index profiles_email_key on public.profiles (lower(email));
create index profiles_role_idx on public.profiles (role);

create table public.sessions (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(btrim(title)) between 2 and 120),
  description  text check (char_length(description) <= 2000),
  session_date date not null,
  start_time   time not null,
  end_time     time not null,
  doctor_id    uuid references public.profiles (id) on delete set null,
  team_group   text not null default 'Whole Team' check (char_length(btrim(team_group)) between 1 and 80),
  location     text check (char_length(location) <= 120),
  notes        text check (char_length(notes) <= 2000),
  status       public.session_status not null default 'scheduled',
  cancelled_at timestamptz,
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint sessions_time_order check (end_time > start_time)
);
create index sessions_date_idx   on public.sessions (session_date);
create index sessions_doctor_idx on public.sessions (doctor_id);
create index sessions_status_idx on public.sessions (status);

create table public.attendance (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.sessions (id) on delete cascade,
  team_member_id uuid not null references public.team_members (id) on delete restrict,
  status         public.attendance_status,          -- NULL = not recorded yet
  notes          text check (char_length(notes) <= 500),
  recorded_by    uuid references public.profiles (id) on delete set null,
  recorded_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- One member can have at most one record per session.
  constraint attendance_session_member_key unique (session_id, team_member_id)
);
create index attendance_member_idx on public.attendance (team_member_id);
create index attendance_session_status_idx on public.attendance (session_id, status);

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so RLS policies can call them without
-- recursion; search_path pinned to avoid hijacking)
-- ---------------------------------------------------------------------------
create or replace function public.current_app_role()
returns public.app_role language sql stable security definer set search_path = ''
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false) $$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce((select role in ('admin', 'doctor') from public.profiles where id = auth.uid()), false) $$;

create or replace function public.current_team_member_id()
returns uuid language sql stable security definer set search_path = ''
as $$ select team_member_id from public.profiles where id = auth.uid() $$;

create or replace function public.app_timezone()
returns text language sql stable security definer set search_path = ''
as $$ select coalesce((select timezone from public.app_settings where id = 1), 'UTC') $$;

-- Display phase of a session: upcoming | active | completed | cancelled.
create or replace function public.session_phase(
  p_date date, p_start time, p_end time, p_status public.session_status
) returns text language sql stable set search_path = ''
as $$
  select case
    when p_status = 'cancelled' then 'cancelled'
    when (p_date + p_end)   <= (now() at time zone public.app_timezone())::timestamp then 'completed'
    when (p_date + p_start) <= (now() at time zone public.app_timezone())::timestamp then 'active'
    else 'upcoming'
  end
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); return new; end $$;

create trigger team_members_updated_at before update on public.team_members
  for each row execute function public.tg_set_updated_at();
create trigger sessions_updated_at before update on public.sessions
  for each row execute function public.tg_set_updated_at();
create trigger attendance_updated_at before update on public.attendance
  for each row execute function public.tg_set_updated_at();
create trigger app_settings_updated_at before update on public.app_settings
  for each row execute function public.tg_set_updated_at();

-- New auth account -> profile. A team member is linked by email; the admin /
-- doctor role can only come from app_metadata, which only the service role
-- can set, so users cannot self-assign privileges.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_member public.team_members%rowtype;
  v_role   public.app_role := 'member';
begin
  select * into v_member from public.team_members where lower(email) = lower(new.email);

  if coalesce(new.raw_app_meta_data ->> 'role', '') in ('admin', 'doctor') then
    v_role := (new.raw_app_meta_data ->> 'role')::public.app_role;
  end if;

  insert into public.profiles (id, full_name, email, role, team_member_id)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), v_member.full_name, split_part(new.email, '@', 1)),
    new.email,
    v_role,
    case when v_role = 'member' then v_member.id end
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only admins may change role / member link / email, and the last admin can
-- never be demoted. (auth.uid() is NULL for service-role / SQL editor calls.)
create or replace function public.tg_guard_profile()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_admin() and (
       new.role is distinct from old.role
    or new.team_member_id is distinct from old.team_member_id
    or new.email is distinct from old.email
  ) then
    raise exception 'Only an admin can change roles, emails or member links'
      using errcode = '42501';
  end if;

  if old.role = 'admin' and new.role <> 'admin'
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'The system must keep at least one admin' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.tg_guard_profile();

-- Sessions: the assigned doctor must be a doctor/admin; creator is immutable.
create or replace function public.tg_validate_session()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.doctor_id is not null and not exists (
    select 1 from public.profiles where id = new.doctor_id and role in ('admin', 'doctor')
  ) then
    raise exception 'Assigned doctor must be a doctor or admin account' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;

  if new.status = 'cancelled' and (tg_op = 'INSERT' or old.status <> 'cancelled') then
    new.cancelled_at := now();
  elsif new.status <> 'cancelled' then
    new.cancelled_at := null;
  end if;
  return new;
end $$;

create trigger sessions_validate before insert or update on public.sessions
  for each row execute function public.tg_validate_session();

-- Every active member automatically appears in every new session.
create or replace function public.tg_session_roster()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.attendance (session_id, team_member_id)
  select new.id, m.id from public.team_members m where m.status = 'active'
  on conflict (session_id, team_member_id) do nothing;
  return new;
end $$;

create trigger sessions_roster after insert on public.sessions
  for each row execute function public.tg_session_roster();

-- Member activated -> joins upcoming sessions. Member deactivated -> removed
-- from upcoming sessions (only unrecorded rows; history is always kept).
create or replace function public.tg_member_roster()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_now timestamp := (now() at time zone public.app_timezone())::timestamp;
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status <> 'active') then
    insert into public.attendance (session_id, team_member_id)
    select s.id, new.id from public.sessions s
    where s.status = 'scheduled' and (s.session_date + s.start_time) > v_now
    on conflict (session_id, team_member_id) do nothing;
  elsif tg_op = 'UPDATE' and new.status = 'inactive' and old.status = 'active' then
    delete from public.attendance a
    using public.sessions s
    where a.session_id = s.id and a.team_member_id = new.id
      and a.status is null and (s.session_date + s.start_time) > v_now;
  end if;
  return new;
end $$;

create trigger team_members_roster after insert or update of status on public.team_members
  for each row execute function public.tg_member_roster();

-- Deleting a member drops unrecorded rows; recorded history blocks deletion
-- through the FK (ON DELETE RESTRICT) so the admin must deactivate instead.
create or replace function public.tg_member_before_delete()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.attendance where team_member_id = old.id and status is null;
  return old;
end $$;

create trigger team_members_before_delete before delete on public.team_members
  for each row execute function public.tg_member_before_delete();

-- Attendance integrity: no marks on cancelled sessions, keys immutable,
-- audit who recorded the mark.
create or replace function public.tg_validate_attendance()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_session_status public.session_status;
  v_member_status  public.member_status;
begin
  if tg_op = 'UPDATE' and (new.session_id <> old.session_id or new.team_member_id <> old.team_member_id) then
    raise exception 'Attendance session/member cannot be changed' using errcode = '42501';
  end if;

  select status into v_session_status from public.sessions where id = new.session_id;
  if v_session_status = 'cancelled' and new.status is not null
     and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    raise exception 'Cannot record attendance for a cancelled session' using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' then
    select status into v_member_status from public.team_members where id = new.team_member_id;
    if v_member_status = 'inactive' then
      raise exception 'Inactive members cannot be added to sessions' using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'INSERT' or new.status is distinct from old.status or new.notes is distinct from old.notes then
    if new.status is null then
      new.recorded_by := null;
      new.recorded_at := null;
    else
      new.recorded_by := coalesce(auth.uid(), new.recorded_by);
      new.recorded_at := now();
    end if;
  end if;
  return new;
end $$;

create trigger attendance_validate before insert or update on public.attendance
  for each row execute function public.tg_validate_attendance();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.app_settings    enable row level security;
alter table public.specializations enable row level security;
alter table public.team_members    enable row level security;
alter table public.profiles        enable row level security;
alter table public.sessions        enable row level security;
alter table public.attendance      enable row level security;

-- app_settings
create policy "settings: read" on public.app_settings for select to authenticated using (true);
create policy "settings: admin update" on public.app_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- specializations
create policy "specializations: read" on public.specializations for select to authenticated using (true);
create policy "specializations: admin insert" on public.specializations for insert to authenticated
  with check (public.is_admin());
create policy "specializations: admin update" on public.specializations for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "specializations: admin delete" on public.specializations for delete to authenticated
  using (public.is_admin());

-- team_members: staff see everyone, a member sees only their own record
create policy "members: read" on public.team_members for select to authenticated
  using (public.is_staff() or id = public.current_team_member_id());
create policy "members: admin insert" on public.team_members for insert to authenticated
  with check (public.is_admin());
create policy "members: admin update" on public.team_members for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "members: admin delete" on public.team_members for delete to authenticated
  using (public.is_admin());

-- profiles: own profile, staff see all, everyone can see staff names (session doctor)
create policy "profiles: read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff() or role in ('admin', 'doctor'));
create policy "profiles: update self or admin" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
-- No insert/delete policies: accounts are created/removed via auth (trigger / Edge Function).

-- sessions
create policy "sessions: read" on public.sessions for select to authenticated using (true);
create policy "sessions: staff insert" on public.sessions for insert to authenticated
  with check (public.is_staff());
create policy "sessions: staff update" on public.sessions for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "sessions: admin delete" on public.sessions for delete to authenticated
  using (public.is_admin());

-- attendance
create policy "attendance: read" on public.attendance for select to authenticated
  using (public.is_staff() or team_member_id = public.current_team_member_id());
create policy "attendance: staff insert" on public.attendance for insert to authenticated
  with check (public.is_staff());
create policy "attendance: staff update" on public.attendance for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "attendance: admin delete" on public.attendance for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Privileges: nothing for anonymous users, no TRUNCATE for anyone via the API
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

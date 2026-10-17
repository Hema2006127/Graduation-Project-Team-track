-- =============================================================================
-- Migration: Track Tasks / Weekly To-Do
-- Adds track_tasks table for team tracks to assign and manage weekly tasks
-- =============================================================================

create table if not exists public.track_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 2 and 200),
  description text,
  specialization_id uuid not null references public.specializations(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete cascade,
  week_number integer not null default 1 check (week_number between 1 and 52),
  assigned_member_id uuid references public.team_members(id) on delete set null,
  assigned_member_name text,
  is_completed boolean not null default false,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  due_date date,
  completed_at timestamptz,
  subtasks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ensure subtasks column exists if table was created in an earlier migration
alter table public.track_tasks add column if not exists subtasks jsonb not null default '[]'::jsonb;

-- Indexes for fast query and filtering
create index if not exists idx_track_tasks_specialization on public.track_tasks (specialization_id);
create index if not exists idx_track_tasks_session on public.track_tasks (session_id);
create index if not exists idx_track_tasks_week on public.track_tasks (week_number);
create index if not exists idx_track_tasks_completed on public.track_tasks (is_completed);


-- Enable RLS
alter table public.track_tasks enable row level security;

-- Policies:
-- Anyone (anon + authenticated) can view tasks
create policy "tasks: public read" on public.track_tasks for select to anon, authenticated using (true);

-- Anyone (or authenticated) can insert, update, delete tasks
create policy "tasks: public insert" on public.track_tasks for insert to anon, authenticated with check (true);
create policy "tasks: public update" on public.track_tasks for update to anon, authenticated using (true) with check (true);
create policy "tasks: public delete" on public.track_tasks for delete to anon, authenticated using (true);

-- Grant privileges
grant select, insert, update, delete on public.track_tasks to anon, authenticated;

-- =============================================================================
-- Migration: Add multiple tracks support to team members
-- Allows each team member to belong to one or more tracks/specializations.
-- =============================================================================

alter table public.team_members
  add column if not exists specialization_ids text[] default '{}'::text[];

-- Backfill from primary specialization_id
update public.team_members
set specialization_ids = array[specialization_id::text]
where specialization_ids is null or cardinality(specialization_ids) = 0;

-- Grant select on the new column to anon for public views
grant select (specialization_ids) on public.team_members to anon;

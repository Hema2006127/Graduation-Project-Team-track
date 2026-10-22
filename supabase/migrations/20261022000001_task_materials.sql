-- =============================================================================
-- Migration: Task materials
-- Adds a materials list (title + URL, e.g. Google Drive links) to track tasks.
-- =============================================================================

alter table public.track_tasks add column if not exists materials jsonb not null default '[]'::jsonb;

-- Refresh PostgREST so the new column is visible immediately.
notify pgrst, 'reload schema';

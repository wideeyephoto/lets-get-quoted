-- Migration for G5: add 'published' column to platform_incidents and allow anonymous reading of published incidents.
alter table platform_incidents add column if not exists published boolean not null default false;

-- The table already has RLS enabled (from 2026-08-06-platform-incidents.sql).
-- Create an anonymous read policy for published incidents.
create policy "Anon can read published incidents" on platform_incidents for select using (published = true);

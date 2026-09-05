-- Compact normalized room geometry; ownership, retention, and deletion
-- follow the existing jobs/leads rows and their RLS policies.
alter table public.jobs add column if not exists room_spatial_scan jsonb
  check (room_spatial_scan is null or (jsonb_typeof(room_spatial_scan) = 'object'
    and octet_length(room_spatial_scan::text) <= 1048576));
alter table public.leads add column if not exists room_spatial_scan jsonb
  check (room_spatial_scan is null or (jsonb_typeof(room_spatial_scan) = 'object'
    and octet_length(room_spatial_scan::text) <= 1048576));

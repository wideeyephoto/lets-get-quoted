-- ============================================================================
-- Seed Marketing Capabilities in office_capabilities
-- ============================================================================

insert into public.office_capabilities (capability, band, grants) values
  ('marketing.read', 'work', 'Campaign history, attribution, marketing performance and the seasonal calendar.'),
  ('marketing.write', 'work', 'Compose and send email and text campaigns, write blog posts, and configure ad campaigns.')
on conflict (capability) do update
  set band = excluded.band, grants = excluded.grants;

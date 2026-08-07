-- Staff-authored log of releases and incidents, shown on the admin Command
-- Center ("recent releases and active incidents"). There is no automated
-- deploy-tracking or incident-management system anywhere in this codebase, so
-- rather than build one, this is a small manually-curated table staff write
-- to directly — a release note or an incident is logged the same way an
-- admin action is taken, by hand, from the console.
create table if not exists platform_incidents (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('release','incident')),
  title         text not null,
  description   text,
  severity      text not null default 'info' check (severity in ('info','warning','critical')),
  started_at    timestamptz not null default now(),
  -- Null while an incident is ongoing. Releases are a point-in-time note and
  -- never carry a resolution.
  resolved_at   timestamptz,
  created_by    text not null,
  created_at    timestamptz not null default now()
);
create index if not exists platform_incidents_created_idx on platform_incidents (created_at desc);
create index if not exists platform_incidents_active_idx on platform_incidents (started_at desc) where kind = 'incident' and resolved_at is null;
-- RLS on with NO policy: unreachable via the anon/authed keys. Only the
-- service-role client (used inside requireAdmin's context) can read/write it.
alter table platform_incidents enable row level security;

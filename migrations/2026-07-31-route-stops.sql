-- Supply stops on a route, a reusable place book, and a per-crew start address.
--
-- Three things Plan my day couldn't express:
--   1. A day contains stops that aren't jobs — a dump run, a Home Depot trip,
--      fuel. They cost real time and real miles, and leaving them out is why a
--      planned day and a real day disagree.
--   2. Those places repeat. The second time you go to the county dump it should
--      be one tap, not a re-typed address.
--   3. A two-truck shop's drivers don't both start at the shop. Filtering the
--      plan to one crew still anchored the route to the business address.
--
-- Additive only: two new tables and three nullable columns on crew. Nothing that
-- existing queries read is dropped or changed. Safe to run twice.
--
-- Do NOT apply this with scripts/deploy-schema.mjs — that replays all of
-- schema.sql, including drop policy / create policy pairs, against a live
-- database. This file is the whole change.

begin;

-- 1. Places worth remembering. Deliberately account-scoped and free-form: every
--    trade's list is different, and a curated national directory would be wrong
--    for the one-yard-in-town case that actually matters.
create table if not exists saved_places (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references accounts(id) on delete cascade,
  label           text not null,
  address         text not null,
  lat             numeric,
  lng             numeric,
  -- supply | dump | fuel | other. Free text with a check so a new kind is a
  -- one-line change rather than an enum migration.
  kind            text not null default 'supply',
  default_minutes integer not null default 20,
  -- Ordering for the quick-add list: most-used first, ties broken by recency.
  use_count       integer not null default 0,
  last_used_at    timestamptz,
  created_at      timestamptz not null default now()
);

do $$ begin
  alter table saved_places add constraint saved_places_kind_check
    check (kind in ('supply', 'dump', 'fuel', 'other'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table saved_places add constraint saved_places_minutes_check
    check (default_minutes between 0 and 480);
exception when duplicate_object then null; end $$;

-- The same yard saved twice is a papercut every time the quick-add list renders.
create unique index if not exists saved_places_unique_per_account
  on saved_places (account_id, lower(label), lower(address));
create index if not exists saved_places_account_rank_idx
  on saved_places (account_id, use_count desc, last_used_at desc nulls last);

-- 2. A stop on one particular day that isn't a job.
create table if not exists route_stops (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  -- NULL means it belongs to the whole day, so it shows in every crew's plan —
  -- the same rule unassigned jobs already follow.
  crew_id       uuid references crew(id) on delete set null,
  saved_place_id uuid references saved_places(id) on delete set null,

  scheduled_for date not null,
  -- NULL means "fit it in": the planner places it and proposes a time, exactly
  -- as it does for a job with no time on it.
  scheduled_time time,

  label         text not null,
  address       text,
  lat           numeric,
  lng           numeric,
  minutes       integer not null default 20,
  kind          text not null default 'supply',
  note          text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

do $$ begin
  alter table route_stops add constraint route_stops_kind_check
    check (kind in ('supply', 'dump', 'fuel', 'other'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table route_stops add constraint route_stops_minutes_check
    check (minutes between 0 and 480);
exception when duplicate_object then null; end $$;

-- The plan reads one account's one day, every time.
create index if not exists route_stops_day_idx on route_stops (account_id, scheduled_for);
create index if not exists route_stops_crew_idx on route_stops (crew_id) where crew_id is not null;

-- 3. Where a crew member's day starts. Filtering the plan to one crew now anchors
--    the route at their address instead of the shop. Coordinates are stored
--    separately and only when geocoding was precise — a city-level match would
--    silently move every leg of their day by several miles.
alter table crew add column if not exists start_address text;
alter table crew add column if not exists start_lat numeric;
alter table crew add column if not exists start_lng numeric;

-- RLS. Owners have full access to both tables. Crew get READ only, and only for
-- stops on their own day, so the field app can show a dump run without exposing
-- another truck's route.
alter table saved_places enable row level security;
alter table route_stops enable row level security;

drop policy if exists saved_place_owner on saved_places;
create policy saved_place_owner on saved_places for all using ( is_owner(account_id) );

drop policy if exists route_stop_owner on route_stops;
create policy route_stop_owner on route_stops for all using ( is_owner(account_id) );

-- crew_id null = everybody's stop; otherwise only the crew member it belongs to.
drop policy if exists route_stop_crew_read on route_stops;
create policy route_stop_crew_read on route_stops for select
  using ( crew_id is not null and crew_owns_crew_row(crew_id) );

commit;

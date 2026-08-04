-- Priority zones for Quick Stops: areas worth a longer drive.
--
-- Run this against the production database (Supabase SQL editor) BEFORE the
-- feature will appear. Until it runs, the loader catches the missing table and
-- returns no zones, so the map draws the plain detour limit and nothing throws.
--
-- Additive only: one new table. Safe to run twice.
--
-- Do NOT apply this with scripts/deploy-schema.mjs — that replays all of
-- schema.sql, including drop policy / create policy pairs, against a live
-- database. This file is the whole change.

begin;

-- WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT.
--
-- A contractor draws these themselves, anywhere, for their own reasons — the
-- subdivision with the big lots, the street they already own, the neighbourhood
-- they are trying to grow into. Inside one, they are willing to drive further
-- than their usual limit.
--
-- There is NO income, demographic or "wealth" data behind it, and there should
-- never be. Shipping a dataset that widened service availability in richer
-- neighbourhoods would make this product the thing deciding who gets same-day
-- service by area income — which in the US tracks race closely enough to be a
-- real problem, not a theoretical one. The contractor's own judgement about
-- their own patch carries none of that, and is better product anyway: it works
-- for the owner whose best area is not the richest one.
create table if not exists quick_stop_priority_zones (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references accounts(id) on delete cascade,

  -- The owner's own name for it. Shown on the map and in the request card's
  -- explanation, so a longer drive is always attributed to a place they named.
  label             text not null,

  -- A circle, not a polygon. It matches the mental model already in use (the
  -- detour limit is a radius), it is one tap to place, and a point-in-circle
  -- test is exact arithmetic rather than a winding-number routine that has to
  -- agree between the browser and the server.
  center_lat        numeric not null,
  center_lng        numeric not null,
  radius_miles      numeric not null check (radius_miles > 0 and radius_miles <= 100),

  -- The detour limit that applies INSIDE this zone, in miles from the nearest
  -- scheduled stop. Absolute rather than a delta on the account setting: a delta
  -- silently changes meaning whenever the base moves, and this is a number the
  -- owner should be able to read back without doing arithmetic.
  max_detour_miles  numeric not null check (max_detour_miles > 0 and max_detour_miles <= 500),

  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists quick_stop_priority_zones_account_idx
  on quick_stop_priority_zones (account_id) where active;

alter table quick_stop_priority_zones enable row level security;

-- Ordinary owner-scoped access: unlike the QuickBooks tokens, there is nothing
-- secret here — it is the owner's own map drawing, read and written by their own
-- session.
drop policy if exists quick_stop_priority_zone_owner on quick_stop_priority_zones;
create policy quick_stop_priority_zone_owner on quick_stop_priority_zones
  for all
  using (account_id in (select account_id from memberships where user_id = auth.uid() and role = 'owner'))
  with check (account_id in (select account_id from memberships where user_id = auth.uid() and role = 'owner'));

commit;

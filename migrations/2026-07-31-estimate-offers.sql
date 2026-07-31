-- Offering a nearby lead an estimate slot in today's gap.
--
-- The contractor has a hole in their route and a lead five minutes off it. This
-- table is the record of asking that lead whether they want the slot: what was
-- sent, what window was promised, how long the slot is held while we wait, and
-- what they said back.
--
-- Three things the schema itself enforces, because they are the ones that hurt:
--
--   1. ONE OFFER PER LEAD, EVER. A unique index, not a code check. Getting
--      texted twice by a contractor you never replied to is how a warm lead
--      becomes a complaint, and "never texts a lead twice" is not a promise
--      worth keeping in application logic alone.
--   2. THE HOLD HAS AN END. hold_expires_at is not null, so no offer can sit
--      reserving a slot forever because a reply never came.
--   3. THE SENT TEXT IS KEPT VERBATIM. body is what the homeowner actually
--      received, not a template id — when someone asks "what did you tell them",
--      a template that has since been edited is not an answer.
--
-- Additive only: one new table, two nullable columns on route_stops, and one
-- widened check constraint. Safe to run twice.
--
-- Do NOT apply this with scripts/deploy-schema.mjs — that replays all of
-- schema.sql, including drop policy / create policy pairs, against a live
-- database. This file is the whole change.

begin;

create table if not exists estimate_offers (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references accounts(id) on delete cascade,
  lead_id         uuid not null references leads(id) on delete cascade,
  -- Which truck the gap belonged to. NULL = the whole-shop plan.
  crew_id         uuid references crew(id) on delete set null,

  status          text not null default 'held',

  -- The day and the window the homeowner was promised. A window, never a single
  -- time: see arrivalWindow() for why one slow job makes a promised time a lie.
  offer_date      date not null,
  window_start    time not null,
  window_end      time not null,
  -- What the route was actually planned around, inside that window.
  arrival_time    time not null,
  visit_minutes   integer not null default 30,

  -- What saying yes costs the day, measured against the route as it stood.
  detour_miles    numeric,
  detour_minutes  integer,
  -- Planner id of the stop this was slotted in behind, for the audit trail.
  after_stop_id   text,

  -- Exactly what was sent, to exactly this number.
  phone           text not null,
  body            text not null,

  -- The slot is reserved from the moment we ask. Not forever.
  hold_minutes    integer not null default 45,
  hold_expires_at timestamptz not null,

  sent_at         timestamptz not null default now(),
  -- Set when they said yes or no. A reply that is neither leaves this null and
  -- the offer holding — an unclear answer is not an answer.
  replied_at      timestamptz,
  reply_body      text,
  -- Set the first time we forward a free-text reply on to the contractor, so a
  -- chatty homeowner gets one acknowledgement rather than one per message.
  forwarded_at    timestamptz,

  -- The stop their yes created.
  route_stop_id   uuid references route_stops(id) on delete set null,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

do $$ begin
  alter table estimate_offers add constraint estimate_offers_status_check
    check (status in ('held', 'accepted', 'accepted_late', 'declined', 'expired', 'canceled'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table estimate_offers add constraint estimate_offers_window_check
    check (window_end > window_start and arrival_time >= window_start and arrival_time <= window_end);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table estimate_offers add constraint estimate_offers_hold_check
    check (hold_minutes between 15 and 120);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table estimate_offers add constraint estimate_offers_visit_check
    check (visit_minutes between 10 and 240);
exception when duplicate_object then null; end $$;

-- The guardrail that matters most, in the one place it cannot be forgotten.
create unique index if not exists estimate_offers_one_per_lead on estimate_offers (lead_id);

-- The plan page reads one account's one day.
create index if not exists estimate_offers_day_idx on estimate_offers (account_id, offer_date);
-- The inbound webhook has a phone number and nothing else, and only ever cares
-- about offers still waiting on an answer.
create index if not exists estimate_offers_pending_idx
  on estimate_offers (phone, sent_at desc) where status = 'held';

-- A stop created by a lead saying yes. Nullable and additive: every existing
-- route stop keeps meaning exactly what it meant.
alter table route_stops add column if not exists lead_id uuid references leads(id) on delete set null;
create index if not exists route_stops_lead_idx on route_stops (lead_id) where lead_id is not null;

-- 'estimate' joins the kinds a stop can be. It is deliberately NOT offered in
-- the add-a-stop form — an estimate visit is somebody's appointment, so it is
-- only ever created by a homeowner accepting an offer.
do $$ begin
  alter table route_stops drop constraint if exists route_stops_kind_check;
  alter table route_stops add constraint route_stops_kind_check
    check (kind in ('supply', 'dump', 'fuel', 'other', 'estimate'));
end $$;

alter table estimate_offers enable row level security;

-- Owners see and manage their own offers. Writes from the inbound webhook come
-- through the service-role client, which bypasses RLS.
drop policy if exists estimate_offer_owner on estimate_offers;
create policy estimate_offer_owner on estimate_offers for all using ( is_owner(account_id) );

commit;

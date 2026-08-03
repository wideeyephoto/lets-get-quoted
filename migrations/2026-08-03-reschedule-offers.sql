-- Asking a customer to move day, and paying them to say yes.
--
-- The mirror image of estimate_offers. That one FILLS a gap in the route with a
-- nearby lead; this one REMOVES a stop that is costing the day more driving than
-- it is worth, by offering the customer a discount to take a day the truck is
-- already going to be near them.
--
-- Four things the schema enforces itself, because they are the ones that hurt:
--
--   1. ONE LIVE OFFER PER JOB. A partial unique index on the open statuses. A
--      customer who gets asked twice reads it as chaos, and worse, two accepted
--      offers on one job would stack two discounts on the same invoice.
--   2. THE DISCOUNT HAS A CEILING. A check constraint, not a UI cap. This number
--      comes off real money and the form that sets it is one typo away from 90.
--   3. THE SENT TEXT IS KEPT VERBATIM. Not a template id — when the customer
--      says "you offered me fifteen percent", a template that has since been
--      edited is not an answer.
--   4. THE DISCOUNT LANDS ON THE JOB, NOT THE OFFER. jobs.reschedule_discount_*
--      is what the invoice reads, so an offer row that is later deleted cannot
--      quietly un-promise money somebody already agreed to.
--
-- Additive only: one new table and three nullable columns on jobs. Safe to run
-- twice.
--
-- Do NOT apply this with scripts/deploy-schema.mjs — that replays all of
-- schema.sql, including drop policy / create policy pairs, against a live
-- database. This file is the whole change.

begin;

create table if not exists reschedule_offers (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references accounts(id) on delete cascade,
  job_id          uuid not null references jobs(id) on delete cascade,
  crew_id         uuid references crew(id) on delete set null,

  status          text not null default 'sent',

  -- Where it is now, and where we are asking them to go.
  from_date       date not null,
  to_date         date not null,
  -- The arrival window promised on the new day. A window, never a single time,
  -- for the same reason estimate offers use one.
  window_start    time not null,
  window_end      time not null,
  arrival_time    time not null,

  -- What they are being paid to move. Percent, because that is what
  -- invoices.discount_percent already is — one representation, no conversion,
  -- no rounding argument at the bottom of a bill.
  discount_percent numeric not null,

  -- Why this day was suggested: how close the truck already comes on to_date,
  -- and what dropping this stop gives back to from_date. Kept for the audit
  -- trail — "we said we'd be nearby" needs to have been true.
  near_miles      numeric,
  saved_miles     numeric,
  saved_minutes   integer,

  -- Exactly what was sent, to exactly this number.
  phone           text not null,
  body            text not null,

  sent_at         timestamptz not null default now(),
  replied_at      timestamptz,
  reply_body      text,
  -- One acknowledgement per offer for a free-text reply, not one per message.
  forwarded_at    timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

do $$ begin
  alter table reschedule_offers add constraint reschedule_offers_status_check
    check (status in ('sent', 'accepted', 'declined', 'canceled'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table reschedule_offers add constraint reschedule_offers_window_check
    check (window_end > window_start and arrival_time >= window_start and arrival_time <= window_end);
exception when duplicate_object then null; end $$;

-- The ceiling. 40% is already generous for moving a day; anything past it is a
-- fat finger, and this is the last place that can catch one before it reaches
-- an invoice.
do $$ begin
  alter table reschedule_offers add constraint reschedule_offers_discount_check
    check (discount_percent > 0 and discount_percent <= 40);
exception when duplicate_object then null; end $$;

-- Moving a job to the day it already sits on is not an offer.
do $$ begin
  alter table reschedule_offers add constraint reschedule_offers_dates_check
    check (to_date <> from_date);
exception when duplicate_object then null; end $$;

-- One live ask per job. Partial, so a declined or canceled offer doesn't lock
-- the job out of ever being asked again — the customer said no to THAT day, not
-- to the idea.
create unique index if not exists reschedule_offers_one_live_per_job
  on reschedule_offers (job_id) where status = 'sent';

-- The plan page reads one account's one day.
create index if not exists reschedule_offers_day_idx on reschedule_offers (account_id, from_date);

-- The inbound webhook has a phone number and nothing else, and only ever cares
-- about offers still waiting on an answer.
create index if not exists reschedule_offers_pending_idx
  on reschedule_offers (phone, sent_at desc) where status = 'sent';

-- What the invoice actually reads. On the JOB, not the offer: the promise has to
-- outlive the row that made it.
alter table jobs add column if not exists reschedule_discount_percent numeric;
alter table jobs add column if not exists reschedule_discount_note text;
alter table jobs add column if not exists reschedule_discount_agreed_at timestamptz;

do $$ begin
  alter table jobs add constraint jobs_reschedule_discount_check
    check (reschedule_discount_percent is null or (reschedule_discount_percent > 0 and reschedule_discount_percent <= 40));
exception when duplicate_object then null; end $$;

alter table reschedule_offers enable row level security;

-- Owners see and manage their own offers. Writes from the inbound webhook come
-- through the service-role client, which bypasses RLS.
drop policy if exists reschedule_offer_owner on reschedule_offers;
create policy reschedule_offer_owner on reschedule_offers for all using ( is_owner(account_id) );

commit;

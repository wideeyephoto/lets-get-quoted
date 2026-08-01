-- ============================================================================
-- Every Extra Stop request that was ASKED FOR, including the ones we refused.
--
-- Until now a refusal left no trace at all: the booking action returned an
-- error and no row was written anywhere. So an owner looking at an empty queue
-- couldn't tell the difference between "nobody asked" and "eleven people asked
-- and we turned all of them away" — which are opposite problems with opposite
-- fixes. One means market it; the other means your visit limit is too tight, or
-- your trade throws off work this was never going to fit.
--
-- Deliberately NOT the same table as extra_stop_requests. A refusal is not a
-- request in a terminal state: it never had a customer, a slot, a hold or a
-- price, and putting it there would pollute the daily-limit counts, the
-- duplicate guard and the queue the owner actually works from.
--
-- PRIVACY. This records what was asked for and why it was answered that way,
-- and nothing about who asked. No name, no phone, no email, no address — a
-- refused enquiry is not a lead, and keeping contact details for somebody we
-- declined to serve would be collecting data we have no use for.
-- ============================================================================

create table if not exists extra_stop_screenings (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,

  -- 'accepted' is logged too, so the panel can state a rate rather than a
  -- count. A refusal number with no denominator says nothing.
  outcome       text not null check (outcome in ('accepted', 'not_a_fit', 'unsafe')),

  -- The human labels from the same screener the dashboard panel uses, so the
  -- reason a customer saw and the reason the owner reads are the same words.
  exclusions    text[] not null default '{}',
  reason        text,

  -- What they said was wrong, truncated. The one free-text field, and the only
  -- reason it's here is that "3 turned away" teaches nothing while "3 turned
  -- away, all of them water heater replacements" teaches the whole thing.
  issue         text,

  -- What the AI thought it would take, when it got that far.
  visit_minutes int,

  created_at    timestamptz not null default now()
);

-- Only ever read as "this account, last N days".
create index if not exists extra_stop_screenings_account_idx
  on extra_stop_screenings (account_id, created_at desc);

alter table extra_stop_screenings enable row level security;
-- Read-only to the owner. Writes come from the public booking flow through the
-- admin client, which bypasses RLS — so there is deliberately no insert policy:
-- nothing holding a user session should be able to add to this.
drop policy if exists extra_stop_screenings_read on extra_stop_screenings;
create policy extra_stop_screenings_read on extra_stop_screenings
  for select using ( is_owner(account_id) );

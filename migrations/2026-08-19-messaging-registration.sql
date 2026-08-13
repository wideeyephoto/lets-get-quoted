-- Where a contractor's customer-texting registration actually stands.
--
-- Run this against the production database (Supabase SQL editor) BEFORE the
-- feature will appear. Every read is written to tolerate the table being
-- absent — and to say "Unavailable" rather than inventing a status when it is —
-- so until this runs, the Messages setup strip reports that it cannot tell.
--
-- Additive only: one new table, its policies and one index. Safe to run twice.
--
-- Do NOT apply this with scripts/deploy-schema.mjs — that replays all of
-- schema.sql, including drop policy / create policy pairs, against a live
-- database. This file is the whole change.

begin;

-- WHY THIS IS A TABLE AND NOT A BOOLEAN ON accounts.
--
-- Registration state was being inferred, in two places, from things that are
-- not it. The marketing banner reads an environment variable
-- (NEXT_PUBLIC_LAUNCH_BANNER) — one global answer for every contractor, which
-- is right today only because the answer is "nobody" and will be wrong the
-- moment it stops being. And the obvious dashboard shortcut is to look at
-- accounts.sms_number and call a number "approved", which is backwards: the
-- number is a CONSEQUENCE of approval, it is assigned after the fact, and
-- schema.sql says in as many words that nothing writes it yet. An account with
-- no number could be not-started, under review, or rejected, and those are
-- three different things to say to somebody.
--
-- So the status is stored, explicitly, and the number is stored beside it
-- rather than standing in for it.
create table if not exists messaging_registrations (
  -- One registration per account. The primary key IS the account, because a
  -- second row would mean two answers to "can this contractor text customers".
  account_id uuid primary key references accounts(id) on delete cascade,

  -- The lifecycle, and every state it can honestly be in. `not_started` is the
  -- only one anybody is in today: the downstream-business registration process
  -- has not been confirmed by the provider, so there is nothing for a
  -- contractor to submit and the UI says "Coming soon" rather than offering a
  -- button that would fail.
  --
  -- NOTE the absent state: there is no 'unavailable' here on purpose. That is
  -- not something an account IS, it is something the reader could not find out,
  -- and encoding a read failure as a stored value is how "we could not check"
  -- becomes "we checked and it is fine".
  status text not null default 'not_started'
    check (status in ('not_started', 'submitted', 'in_review', 'approved', 'action_required', 'rejected')),

  -- Which provider the registration sits with, and their identifier for it.
  -- Nullable because until something is submitted there is nothing to point at.
  provider text,
  provider_reference text,

  -- What the contractor has to DO, when the status says they have to do
  -- something. An `action_required` with no reason is a dead end.
  status_detail text,

  -- The two-way number, once one has been assigned. Kept here and not read
  -- from accounts.sms_number: that column is inbound ROUTING, and conflating
  -- "we route this number to you" with "you are approved to text customers" is
  -- the exact inference this table exists to stop.
  assigned_number text,

  submitted_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One number, one account. Same reasoning as accounts_sms_number_idx: two
-- accounts holding the same assigned number is a routing bug that would look
-- like a working feature. Partial, because null is the normal case today and
-- stays that way until numbers are actually assigned.
create unique index if not exists messaging_registrations_number_idx
  on messaging_registrations (assigned_number)
  where assigned_number is not null;

alter table messaging_registrations enable row level security;

-- SELECT ONLY, which is the one place this differs from every other
-- account-scoped table in the schema. They are all `for all using
-- (is_owner(account_id))`, because they hold things the owner creates. This
-- holds a provider's decision about them: every transition is applied by staff
-- through the service role, and an owner who could write their own row could
-- set it to 'approved' and start texting customers on the strength of it.
drop policy if exists messaging_registration_read on messaging_registrations;
create policy messaging_registration_read on messaging_registrations
  for select using ( is_owner(account_id) );

commit;

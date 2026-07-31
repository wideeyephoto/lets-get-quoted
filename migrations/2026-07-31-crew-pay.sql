-- ============================================================================
-- Crew pay: approval and payment tracking on the Hours & pay tab.
--
-- Until now Hours & pay was a pure rollup — it read labor costs and totalled
-- them. Nothing recorded that an owner had LOOKED at those hours, agreed them,
-- or paid them, so "did I pay Danny for that week?" had no answer anywhere in
-- the product and the same week could quietly be paid twice.
--
-- Three tables, and the split matters:
--
--   crew_pay_periods  one row per account per pay period, created lazily the
--                     first time someone acts on that period. Its key is
--                     derived from the period itself ('weekly:2026-07-26'), so
--                     the same range always resolves to the same row no matter
--                     who opens it or when.
--
--   crew_pay_entries  one row per crew member per period — the unit of payment.
--                     Payment is NEVER recorded against a person globally: a
--                     worker is paid FOR A PERIOD, and this table is the only
--                     place that fact exists.
--
--   crew_pay_events   append-only audit. Who approved, who paid, who undid it,
--                     and why. Owners can read it and can add to it; nothing in
--                     the product can edit or delete a line of it.
--
-- WHAT "PAID" MEANS HERE. It means the contractor told us they paid. This
-- product does not move money to a crew member, does not calculate or withhold
-- tax and does not talk to a payroll provider — so 'paid' is a record, not a
-- transfer, and every surface says so. 'sent' is the separate, weaker claim
-- that the hours left here as an export.
--
-- SNAPSHOTS, NOT LIVE MATH. Hours live in `costs` and can change after the
-- fact. approved_amount and paid_amount freeze what was agreed and what was
-- paid at the moment each happened, so editing hours afterwards produces a
-- visible difference rather than silently rewriting history.
-- ============================================================================

create table if not exists crew_pay_periods (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  -- Deterministic from mode + start date, e.g. 'weekly:2026-07-26'. Two owners
  -- opening the same week must land on the same row, so this is never random.
  period_key    text not null,
  mode          text not null,
  starts_on     date not null,
  ends_on       date not null,          -- INCLUSIVE, unlike the query bounds
  closed_at     timestamptz,
  closed_by     text,
  reopened_at   timestamptz,
  reopen_reason text,
  created_at    timestamptz not null default now(),
  constraint crew_pay_periods_mode_check check (mode in ('weekly', 'biweekly', 'monthly', 'custom')),
  constraint crew_pay_periods_range_check check (ends_on >= starts_on)
);
create unique index if not exists crew_pay_periods_key_idx on crew_pay_periods (account_id, period_key);
-- Overlap detection: a month contains the weeks inside it, so paying a week and
-- then paying the month would pay it twice. The page warns using this index.
create index if not exists crew_pay_periods_span_idx on crew_pay_periods (account_id, starts_on, ends_on);

create table if not exists crew_pay_entries (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references accounts(id) on delete cascade,
  period_id         uuid not null references crew_pay_periods(id) on delete cascade,
  -- NOT NULL on purpose. Labor logged without a crew member has nobody to pay,
  -- so it can't have a payment record — the page shows it as ineligible with
  -- the reason, rather than inventing a payee.
  -- ON DELETE RESTRICT: a payment record outlives the roster entry. Archiving a
  -- crew member is the supported way to remove them; hard-deleting someone who
  -- has been paid is refused in the app with that explanation.
  crew_id           uuid not null references crew(id) on delete restrict,
  -- Name at the time, so a historical period still reads correctly after a rename.
  crew_name         text not null default '',
  status            text not null default 'draft',
  regular_hours     numeric(10, 2) not null default 0,
  overtime_hours    numeric(10, 2) not null default 0,
  -- What the hours came to when they were approved. Compared against live hours
  -- to detect an edit made after the fact.
  approved_amount   numeric(12, 2) not null default 0,
  approved_at       timestamptz,
  approved_by       text,
  sent_at           timestamptz,
  sent_by           text,
  -- What was actually paid. Null until paid; frozen afterwards.
  paid_amount       numeric(12, 2),
  paid_at           timestamptz,
  paid_by           text,
  payment_date      date,
  payment_method    text,
  payment_reference text,
  payment_note      text,
  -- Paid entries lock by default so a stray edit can't move money that's gone.
  locked            boolean not null default false,
  currency          text not null default 'USD',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint crew_pay_entries_status_check check (status in ('draft', 'needs_review', 'approved', 'sent', 'paid')),
  -- A payment record without a date is a claim with no time on it.
  constraint crew_pay_entries_paid_check check (status <> 'paid' or (paid_at is not null and payment_date is not null))
);
create unique index if not exists crew_pay_entries_unique_idx on crew_pay_entries (period_id, crew_id);
create index if not exists crew_pay_entries_account_idx on crew_pay_entries (account_id, period_id);
create index if not exists crew_pay_entries_crew_idx on crew_pay_entries (account_id, crew_id, paid_at desc);

create table if not exists crew_pay_events (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  period_id   uuid references crew_pay_periods(id) on delete cascade,
  entry_id    uuid references crew_pay_entries(id) on delete set null,
  crew_id     uuid,
  crew_name   text,
  action      text not null,            -- 'hours_approved' | 'marked_paid' | 'paid_undone' | ...
  summary     text not null,            -- human-readable, shown as-is
  actor_email text,
  reason      text,                     -- required by the app for undo / reopen
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists crew_pay_events_period_idx on crew_pay_events (account_id, period_id, created_at desc);
create index if not exists crew_pay_events_account_idx on crew_pay_events (account_id, created_at desc);

-- --- RLS ---------------------------------------------------------------------
-- Pay is owner-only. Crew members reach the field app, never these tables — a
-- crew member must not be able to read a coworker's rate or the payroll total.

alter table crew_pay_periods enable row level security;
drop policy if exists crew_pay_period_owner on crew_pay_periods;
create policy crew_pay_period_owner on crew_pay_periods for all using ( is_owner(account_id) ) with check ( is_owner(account_id) );

alter table crew_pay_entries enable row level security;
drop policy if exists crew_pay_entry_owner on crew_pay_entries;
create policy crew_pay_entry_owner on crew_pay_entries for all using ( is_owner(account_id) ) with check ( is_owner(account_id) );

-- Append-only for real: owners may read and insert, and there is deliberately
-- no update or delete policy, so a history line can't be rewritten by anyone
-- holding an owner session — including us.
alter table crew_pay_events enable row level security;
drop policy if exists crew_pay_event_owner_read on crew_pay_events;
drop policy if exists crew_pay_event_owner_insert on crew_pay_events;
create policy crew_pay_event_owner_read   on crew_pay_events for select using ( is_owner(account_id) );
create policy crew_pay_event_owner_insert on crew_pay_events for insert with check ( is_owner(account_id) );

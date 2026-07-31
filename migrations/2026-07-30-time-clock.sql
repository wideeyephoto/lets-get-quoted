-- Clock in / clock out for crew hours.
--
-- Run this against the production database (Supabase SQL editor) BEFORE the
-- feature will appear. Until it runs, getTimeClockMode() catches the missing
-- column and reports 'off', so the app behaves exactly as it did — crew type
-- their hours, no clock UI anywhere, nothing throws.
--
-- Additive only: one new table, one new column, four new policies. It creates
-- nothing that existing queries read and drops nothing. Safe to run twice.
--
-- Do NOT apply this with scripts/deploy-schema.mjs — that replays all of
-- schema.sql, including drop policy / create policy pairs, against a live
-- database. This file is the whole change.

begin;

-- 1. The shift table. An open shift is not a cost (no hours, no amount yet), so
--    it lives here until clock-out, then becomes a normal labor cost row.
create table if not exists time_entries (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  crew_id       uuid not null references crew(id) on delete cascade,
  job_id        uuid not null references jobs(id) on delete cascade,

  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  rate          numeric(10,2) not null default 0,
  note          text,

  cost_id       uuid references costs(id) on delete set null,
  closed_by_owner boolean not null default false,

  created_at    timestamptz not null default now()
);

-- One open shift per crew member, account-wide. Without this, a double tap on
-- Clock in — or clocking in on a second job while still on the first — starts
-- two shifts and bills the same minutes twice.
create unique index if not exists time_entries_one_open_per_crew
  on time_entries (crew_id) where ended_at is null;
create index if not exists time_entries_account_started_idx
  on time_entries (account_id, started_at desc);
create index if not exists time_entries_cost_idx on time_entries (cost_id);

-- 2. Per-account mode. 'off' is the existing behaviour and the default, so
--    running this migration changes nothing until the owner opts in.
alter table accounts add column if not exists time_clock_mode text not null default 'off';
do $$ begin
  alter table accounts add constraint accounts_time_clock_mode_check
    check (time_clock_mode in ('off', 'optional', 'required'));
exception when duplicate_object then null; end $$;

-- 3. Row-level security, mirroring the costs policies exactly.
alter table time_entries enable row level security;

drop policy if exists time_entry_owner on time_entries;
drop policy if exists time_entry_crew_read on time_entries;
drop policy if exists time_entry_crew_insert on time_entries;
drop policy if exists time_entry_crew_update on time_entries;

create policy time_entry_owner on time_entries
  for all using ( is_owner(account_id) );

-- Crew read only their OWN shifts — never a coworker's.
create policy time_entry_crew_read on time_entries
  for select using ( crew_owns_crew_row(crew_id) );

-- Opening a shift requires being assigned to the job AND being the crew member
-- named on the row. account_id is pinned to the job's real account so a crew
-- session can't write a row carrying a foreign account_id.
create policy time_entry_crew_insert on time_entries
  for insert with check (
    crew_on_job(job_id)
    and crew_owns_crew_row(crew_id)
    and account_id = job_account_id(job_id)
  );

-- Closing a shift is an update, and only on your own row.
create policy time_entry_crew_update on time_entries
  for update using ( crew_owns_crew_row(crew_id) )
  with check ( crew_owns_crew_row(crew_id) );

commit;

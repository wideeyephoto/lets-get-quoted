-- Choice reminders, promoted from a stamp on a row to a real schedule.
--
-- Run this against the production database (Supabase SQL editor) BEFORE the
-- feature will appear. Every read tolerates the columns and the table being
-- absent, so until it runs the board behaves exactly as it does today.
--
-- Additive only: four columns on accounts, one new table. Safe to run twice.
--
-- Do NOT apply this with scripts/deploy-schema.mjs — that replays all of
-- schema.sql, including drop policy / create policy pairs, against a live
-- database. This file is the whole change.
--
-- PREREQUISITES, and they are not in schema.sql. The selection board lives
-- entirely in migrations: 2026-08-03-selections.sql creates job_selections and
-- selection_options, and 2026-08-04-selection-chasing.sql adds
-- accounts.selection_reminders_enabled. Both must have been applied — the table
-- below carries a foreign key to job_selections, and the settings columns hang
-- off the switch that migration added.

begin;

-- ----------------------------------------------------------------------------
-- SETTINGS
--
-- selection_reminders_enabled already exists (2026-08-04-selection-chasing).
-- It stays the one enablement control; everything below is what it does when on.
-- ----------------------------------------------------------------------------

-- WHEN, as day offsets from the needed-by date. {0,2} is "on the day, then
-- again two days later" — the first is the deadline itself, the second is the
-- one that catches a homeowner who saw the first and meant to get to it.
--
-- Offsets, not the old two boolean stamps. chase_sent_at fired the moment a
-- selection came within DECISION_CHASE_DAYS (seven) of its date, so the "first"
-- reminder for a date three weeks out went a fortnight early and the deadline
-- itself passed in silence. The array is what the settings panel renders and
-- what the sweep sends on, so the sentence a contractor reads cannot describe a
-- cadence the cron does not run.
alter table accounts add column if not exists selection_reminder_offsets integer[] not null default '{0,2}';

-- The hour, in the ACCOUNT'S OWN timezone. The sweep was a daily 17:00 UTC cron,
-- which is 1pm in New York, 10am in Los Angeles and 7am in Honolulu — the send
-- time was a side effect of the cron expression and appeared nowhere in the UI.
-- Bounded 6am-8pm by the settings panel for the same reason appointment
-- reminders are: these are texts to somebody's personal phone, and an hour
-- inside that range is never the hour US clocks skip in spring or repeat in
-- autumn.
alter table accounts add column if not exists selection_reminder_hour integer not null default 9;

-- The words, with {client} {job} {choice_count} {choices} {due} {link} filled
-- in at send time. NULL means "the default", which is not the same as an empty
-- string — a contractor who clears the box has not asked for a blank text.
--
-- The "Reply STOP to opt out." line is deliberately NOT stored here. It is
-- appended by the renderer so that no edit, however well meant, can remove the
-- opt-out that makes the message legal to send.
alter table accounts add column if not exists selection_reminder_template text;

-- One message per job, or one per choice. 'job' is the default and the only
-- value the settings panel writes today: a kitchen with six choices due the
-- same day is one text, and six reads as a malfunction that gets the whole
-- thread muted. Stored rather than hardcoded because the sweep reads its
-- grouping from configuration, and because 'per_choice' is a real, tested code
-- path for the accounts that ask for it.
alter table accounts add column if not exists selection_reminder_grouping text not null default 'job';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'accounts_selection_reminder_grouping_check'
  ) then
    alter table accounts add constraint accounts_selection_reminder_grouping_check
      check (selection_reminder_grouping in ('job', 'per_choice'));
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- THE LEDGER
--
-- One row per reminder that is owed, from the moment it is owed. Not a stamp on
-- the selection — job_selections.chase_sent_at could say "we sent something"
-- and nothing else: not which stage, not through which channel, not whether it
-- actually arrived, and not why it did not. A failed send and a send that was
-- never attempted were the same absence of a timestamp.
-- ----------------------------------------------------------------------------
create table if not exists selection_reminders (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,

  -- Set only when grouping is 'per_choice'. Null is the normal case and means
  -- "every eligible choice on this job sharing this needed-by date".
  selection_id uuid references job_selections(id) on delete cascade,

  -- The needed-by date this reminder is ABOUT, copied from the choice. Part of
  -- the key rather than derived, so moving a date leaves the old row plainly
  -- orphaned instead of silently re-pointing a sent reminder at a new deadline.
  needed_by date not null,
  -- Which reminder in the schedule: 0 is the first, 1 the second.
  stage smallint not null,
  -- needed_by + offsets[stage]. The local date this is due to go out.
  due_on date not null,

  -- When the row was created, which is when the sweep first claimed this send.
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  channel text check (channel in ('sms', 'email')),
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'skipped', 'cancelled')),
  -- Why it did not go: 'opted_out', 'no_contact', 'no_choices', or the provider's
  -- own words. Read by nobody automatically, which is the point — it is there for
  -- the person asking why one specific customer never heard from us.
  failure_reason text,
  attempts smallint not null default 0,
  -- Exactly which choices this message covered, frozen at send time.
  selection_ids uuid[] not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- THE DUPLICATE GUARD, and it is the whole idempotency story.
--
-- The sweep claims a send by INSERTING this row and treats a unique violation
-- as "somebody already has this one" — so two overlapping cron invocations, or
-- one retried after a timeout, produce one text and not two. Partial indexes
-- rather than one index over a coalesced key: the two grouping modes have
-- genuinely different identities, and a sentinel UUID standing in for "no
-- selection" is the kind of clever that breaks at 2am.
create unique index if not exists selection_reminders_job_stage_idx
  on selection_reminders (account_id, job_id, needed_by, stage)
  where selection_id is null;

create unique index if not exists selection_reminders_choice_stage_idx
  on selection_reminders (account_id, selection_id, needed_by, stage)
  where selection_id is not null;

-- The sweep's own read: what is owed today, oldest first.
create index if not exists selection_reminders_due_idx
  on selection_reminders (account_id, due_on)
  where status = 'pending';

-- Resync's read: the pending rows for one job, when a needed-by date moves.
create index if not exists selection_reminders_job_idx
  on selection_reminders (account_id, job_id, status);

alter table selection_reminders enable row level security;
drop policy if exists selection_reminders_owner on selection_reminders;
create policy selection_reminders_owner on selection_reminders
  for all using (is_owner(account_id)) with check (is_owner(account_id));

commit;

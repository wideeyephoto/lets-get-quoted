-- The field app, promoted from "works on my laptop" to "works on a roof".
--
-- APPLY THIS BEFORE the deploy that reads it. Every change here is additive or a
-- tightening, and the application code carries a fallback for the un-migrated
-- case, but the fallbacks exist so a half-deployed database degrades quietly —
-- not so this file can be skipped.
--
-- Six things, all of them holes the field app fell through:
--
--   1. Crew invite lifecycle columns. The roster could say "linked" or "has an
--      email" and nothing else — not invited, not expired, not revoked.
--   2. crew_set_job_status(): a NARROW status write. The field app's "Start
--      work" wrote status AND started_at while the guard trigger allowed crew
--      status only, so the first press failed on any database with the trigger.
--   3. The broad crew UPDATE policy on jobs is DROPPED. The RPC above is now
--      the only way a crew session changes a job at all.
--   4. Crew time-entry writes are column-scoped and the rate is PINNED to the
--      one the owner set. The policy allowed a crew member to update every
--      column of their own shift, including what they are paid for it.
--   5. Crew labor costs must carry the rate on file. Same hole, other table.
--   6. Crew can read the day's unassigned route stops, so the field app can
--      show the dump run and the supply stop that are already in the data.
--
-- Safe to run twice.
--
-- Do NOT apply this with scripts/deploy-schema.mjs — that replays all of
-- schema.sql, including drop policy / create policy pairs, against a live
-- database. This file is the whole change.

begin;

-- ---------------------------------------------------------------------------
-- 1. INVITE LIFECYCLE
--
-- The roster derived a crew member's field-app state from two facts: is user_id
-- set, and is there an email. That collapses five genuinely different states —
-- never invited, invited and waiting, invited and the link has expired, signed
-- in, and access taken away — into two, and the owner cannot tell which of them
-- they are looking at. These five columns are what separates them.
--
-- Nullable, no backfill. A crew member who signed in before this migration has
-- a user_id and no last_signed_in_at, which reads as "signed in, date unknown"
-- rather than as a fabricated timestamp.
-- ---------------------------------------------------------------------------
alter table crew add column if not exists invited_at timestamptz;
alter table crew add column if not exists invite_expires_at timestamptz;
alter table crew add column if not exists invite_count integer not null default 0;
alter table crew add column if not exists last_signed_in_at timestamptz;
-- Set when an owner takes the field app away from somebody who is still on the
-- roster. Distinct from `active = false` (archived, gone from the crew) and from
-- deleted_at (gone entirely): this person still works here, they just don't get
-- the app. Clearing user_id alone would not do it — the next magic link would
-- silently re-link them.
alter table crew add column if not exists access_revoked_at timestamptz;

comment on column crew.access_revoked_at is
  'Field-app access withdrawn at this time. requireCrewContext refuses the session and linkCrewUserByEmail skips the row, so a fresh magic link cannot re-link them until an owner restores access.';

-- ---------------------------------------------------------------------------
-- 2 + 3. JOB STATUS: one narrow operation, and nothing else
--
-- WHAT WAS BROKEN. job_crew_update let a crew member UPDATE any column of an
-- assigned job (RLS cannot restrict columns), so crew_jobs_update_guard was
-- added to constrain them to `status`. The field app's Start work writes
-- status AND started_at — every owner-facing surface reads started_at to tell
-- "on the calendar" from "underway" — so on a database carrying that trigger,
-- the crew's first press raised 'crew may only change job status' and the job
-- never started.
--
-- Widening the trigger to allow started_at would have fixed the symptom and
-- kept the shape that caused it: a broad table grant, narrowed by a deny-list
-- that has to be re-reasoned every time a column is added. This goes the other
-- way. Crew lose UPDATE on jobs entirely and get ONE function that performs the
-- two transitions the field app actually offers.
-- ---------------------------------------------------------------------------

-- The trigger has to let its own sanctioned write through. The flag is set
-- transaction-locally by crew_set_job_status() and by nothing else: it is not a
-- column, not a claim, and there is no PostgREST route to set_config(), so a
-- crew session cannot raise it on its own behalf.
create or replace function crew_jobs_update_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.crew_job_write', true), '') = 'on' then
    return new;
  end if;
  if is_crew(old.account_id)
     and (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'crew may only change job status';
  end if;
  return new;
end;
$$;
drop trigger if exists crew_jobs_update_guard on jobs;
create trigger crew_jobs_update_guard before update on jobs
  for each row execute function crew_jobs_update_guard();

-- The whole of what a crew member may do to a job.
--
-- Assignment is checked here rather than trusted from the caller, so this is
-- safe to expose to PostgREST directly: an authenticated user who is not on the
-- job gets an exception, not a row. The transitions are a whitelist for the same
-- reason — 'archived' and 'new_lead' are the owner's to set, and a job that is
-- already complete or archived is not something a phone should reopen.
--
-- started_at is stamped on the way in and NEVER re-dated: it records a thing
-- that happened, and a second press must not move it.
create or replace function crew_set_job_status(j uuid, new_status text)
returns table (id uuid, status text, started_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare current_status text;
begin
  if new_status not in ('in_progress', 'complete') then
    raise exception 'unsupported status %', new_status using errcode = 'check_violation';
  end if;
  if not crew_on_job(j) then
    raise exception 'you are not assigned to this job' using errcode = 'insufficient_privilege';
  end if;

  select jobs.status into current_status from jobs where jobs.id = j;
  if current_status is null then
    raise exception 'job not found' using errcode = 'no_data_found';
  end if;
  if current_status = 'archived' then
    raise exception 'that job has been archived' using errcode = 'check_violation';
  end if;

  perform set_config('app.crew_job_write', 'on', true);

  return query
    update jobs
       set status = new_status,
           started_at = coalesce(jobs.started_at, now())
     where jobs.id = j
    returning jobs.id, jobs.status, jobs.started_at;
end;
$$;

revoke all on function crew_set_job_status(uuid, text) from public;
grant execute on function crew_set_job_status(uuid, text) to authenticated;

-- And the broad grant goes. Crew keep SELECT on their assigned jobs; the only
-- write left to them is the function above.
drop policy if exists job_crew_update on jobs;

-- ---------------------------------------------------------------------------
-- 4. TIME ENTRIES: the crew member owns the shift, not the rate
--
-- time_entry_crew_update was `using (crew_owns_crew_row(crew_id))` with a
-- matching check — which is "you may rewrite every column of your own shift".
-- That includes `rate` (what the hour is worth), `started_at` (backdating a
-- shift to this morning), `job_id` (moving the hours onto someone else's job)
-- and `closed_by_owner` (laundering a guessed end time into a clocked one).
--
-- The UI offers exactly one of those: clocking out, which writes ended_at,
-- cost_id and a note. So that is what the database permits.
-- ---------------------------------------------------------------------------
create or replace function crew_time_entries_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare pinned numeric;
begin
  -- Owners and the service-role client pass through untouched: closing a
  -- forgotten shift at a corrected time is exactly their job.
  if not is_crew(new.account_id) then return new; end if;

  if tg_op = 'INSERT' then
    select c.hourly_rate into pinned from crew c where c.id = new.crew_id;
    -- The rate is the owner's number. A hand-posted insert carrying its own is
    -- a pay rise nobody approved, and it would flow straight into a labor cost.
    new.rate := coalesce(pinned, 0);
    -- A shift opens open. Inserting one already closed would skip the cost row
    -- that makes the hours visible to anybody.
    new.ended_at := null;
    new.cost_id := null;
    new.closed_by_owner := false;
    return new;
  end if;

  if old.ended_at is not null then
    raise exception 'that shift is already closed';
  end if;
  if (to_jsonb(new) - 'ended_at' - 'cost_id' - 'note')
     is distinct from (to_jsonb(old) - 'ended_at' - 'cost_id' - 'note') then
    raise exception 'crew may only close their own shift';
  end if;
  return new;
end;
$$;
drop trigger if exists crew_time_entries_guard on time_entries;
create trigger crew_time_entries_guard before insert or update on time_entries
  for each row execute function crew_time_entries_guard();

-- ---------------------------------------------------------------------------
-- 5. LABOR COSTS: hours are theirs to report, the rate is not
--
-- cost_crew_insert pins the account and the crew member but says nothing about
-- money, so a crafted insert could log one hour at any rate it liked. The field
-- app's manual time form used to hand the rate over on purpose (an editable
-- "Rate ($/hr)" box); it no longer does, and this is what makes removing the
-- box mean something.
--
-- The rate must be the one on the roster — OR one this crew member has actually
-- clocked on this job, because clockIn snapshots the rate at the start of the
-- shift and an owner who changes it mid-afternoon must not make clocking out
-- fail. time_entries.rate is itself pinned above, so that chain is closed.
-- ---------------------------------------------------------------------------
create or replace function crew_costs_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare pinned numeric;
begin
  if not is_crew(new.account_id) then return new; end if;
  if new.type <> 'labor' then return new; end if;

  select c.hourly_rate into pinned from crew c where c.id = new.crew_id;
  if pinned is null then
    raise exception 'labor has to be attributed to a crew member on this account';
  end if;

  if new.rate is distinct from pinned
     and not exists (
       select 1 from time_entries t
        where t.crew_id = new.crew_id and t.job_id = new.job_id and t.rate = new.rate
     ) then
    raise exception 'crew may not set their own pay rate';
  end if;

  -- And the amount has to be the arithmetic, not a number of its own. A cent of
  -- tolerance because the app rounds in JavaScript and this rounds in Postgres.
  if new.hours is null or new.hours <= 0
     or abs(coalesce(new.amount, 0) - round(new.hours * new.rate, 2)) > 0.01 then
    raise exception 'labor amount must be hours x the rate on file';
  end if;
  return new;
end;
$$;
drop trigger if exists crew_costs_guard on costs;
create trigger crew_costs_guard before insert or update on costs
  for each row execute function crew_costs_guard();

-- ---------------------------------------------------------------------------
-- 6. ROUTE STOPS: the day includes the stops that aren't jobs
--
-- The old policy required crew_id to be set, with the note that an unassigned
-- stop was "the owner's planning surface only until the field app has somewhere
-- to put it". It does now. Unassigned stops belong to whoever is out that day —
-- the same rule the owner's planner already applies — so they resolve to every
-- crew member's route rather than to nobody's.
-- ---------------------------------------------------------------------------
drop policy if exists route_stop_crew_read on route_stops;
create policy route_stop_crew_read on route_stops for select
  using ( is_crew(account_id) and (crew_id is null or crew_owns_crew_row(crew_id)) );

-- ---------------------------------------------------------------------------
-- 7. OFFLINE SUBMISSIONS: the ledger that makes replay safe
--
-- The service worker holds a clock-out, a note or a material in IndexedDB when
-- the network drops and sends it when signal returns. It cannot know whether
-- the request it never got an answer to actually arrived — a reply lost on the
-- way back looks exactly like a request lost on the way out — so it retries,
-- and without this table a retry would be a second labor cost on somebody's job.
--
-- The unique index IS the lock: the insert either succeeds (first time we've
-- seen this submission) or raises 23505 (we have), and there is no window
-- between checking and acting for a second attempt to slip through.
--
-- Written only by the admin client on the queue endpoint. The owner policy is
-- there so an owner can see what came in from a phone that had been offline.
-- ---------------------------------------------------------------------------
create table if not exists field_submissions (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  crew_id     uuid not null references crew(id) on delete cascade,
  -- Generated on the phone, before the first send attempt. Same key for every
  -- replay of the same tap.
  key         text not null,
  kind        text not null,
  created_at  timestamptz not null default now()
);
create unique index if not exists field_submissions_key_unique on field_submissions (crew_id, key);
create index if not exists field_submissions_account_idx on field_submissions (account_id, created_at desc);

alter table field_submissions enable row level security;
drop policy if exists field_submission_owner on field_submissions;
create policy field_submission_owner on field_submissions for all using ( is_owner(account_id) );

commit;

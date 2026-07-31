-- ============================================================================
-- Day plan preferences — the decisions a contractor makes about a day that
-- aren't yet times on the calendar.
--
-- Today there is exactly one: which stop they mean to end on. It lived in
-- browser state, which meant planning tomorrow's route tonight and finding it
-- gone in the morning — the one moment the feature exists for.
--
-- A property of the DAY, not of the stop. "Which stop am I ending Tuesday on"
-- can't live on a job, because the answer changes when the day is rearranged
-- and the job may not even be on Tuesday any more.
--
-- Note what is NOT here: the running order. That still only reaches the
-- calendar when Save schedule is pressed, deliberately — rearranging the list
-- must never move a customer's appointment behind their back.
-- ============================================================================

create table if not exists day_plan_prefs (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references accounts(id) on delete cascade,
  plan_date    date not null,
  -- Null means the whole business. A day filtered to one crew gets its own
  -- answer: two crews on the same date end at different places.
  crew_id      uuid references crew(id) on delete cascade,
  -- A job's uuid, or 'rs:<uuid>' for a supply stop — the same id the planner
  -- uses throughout, so it needs no translation on the way in or out. Text
  -- rather than a foreign key precisely because it points at either table;
  -- a stop that no longer exists is filtered out on read, not enforced here.
  preferred_last_id text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One answer per day per crew. coalesce, because in Postgres two NULL crew_ids
-- are distinct and a plain unique index would happily store the business-wide
-- preference twice.
create unique index if not exists day_plan_prefs_unique_idx
  on day_plan_prefs (account_id, plan_date, coalesce(crew_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists day_plan_prefs_day_idx on day_plan_prefs (account_id, plan_date);

alter table day_plan_prefs enable row level security;
drop policy if exists day_plan_pref_owner on day_plan_prefs;
create policy day_plan_pref_owner on day_plan_prefs for all using ( is_owner(account_id) ) with check ( is_owner(account_id) );

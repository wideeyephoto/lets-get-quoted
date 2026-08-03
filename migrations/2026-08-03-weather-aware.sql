-- Weather-aware scheduling.
--
-- The system flags and suggests. It NEVER moves a job. A calendar that
-- reschedules itself on a forecast will eventually move work on a day that turns
-- out fine, and the customer who took the morning off stops believing any date
-- you give them after that.

-- Which jobs care. Null means "use the account's trade default", which is why
-- it's nullable — false is a real and different answer for indoor work booked
-- by an outdoor trade.
alter table jobs
  add column if not exists weather_sensitive boolean;

-- Per-account switch and the profile to judge against. The profile keys live in
-- src/lib/weather.ts (roofing / painting / concrete / exterior / landscaping);
-- kept as free text rather than an enum so adding one is a code change, not a
-- migration with a deploy ordering problem.
alter table accounts
  add column if not exists weather_alerts_enabled boolean not null default false;
alter table accounts
  add column if not exists weather_profile text;

-- Forecasts, cached by rounded coordinate.
--
-- api.weather.gov is free and asks only that we don't hammer it. Two requests
-- per point per lookup would otherwise mean two per JOB — and a contractor with
-- eight jobs on one street would fetch the same grid cell eight times.
create table if not exists weather_cache (
  -- "42.49,-83.14" — 2dp is ~1.1km, inside a single NWS ~2.5km grid cell.
  cache_key text primary key,
  forecasts jsonb not null,
  fetched_at timestamptz not null default now()
);

-- Deliberately NOT row-level-secured and not scoped to an account: a public
-- weather forecast for a grid square is not anybody's private data, and keying
-- it per account would multiply the requests we're trying to avoid. It holds
-- coordinates rounded to a kilometre and nothing else.

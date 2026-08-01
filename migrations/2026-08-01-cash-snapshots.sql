-- ============================================================================
-- What the forecast SAID, so it can be held to it.
--
-- The cash-flow page could draw a curve and nag when the balance went stale,
-- and it could never answer the only question that decides whether anyone
-- should trust it: last time, was it right? A forecast nobody can check is a
-- forecast nobody should act on, and a page nobody acts on is a page nobody
-- opens.
--
-- One row per day the owner tells us what's in the bank. `projected` is the
-- curve exactly as it was drawn that day, so the comparison is against what
-- they actually saw — not against a re-derivation from data that has since
-- changed underneath it. That distinction is the whole point: re-running
-- today's inputs through today's code would always look accurate.
--
-- Unique on (account, day) so opening the page twice doesn't create a second
-- version of the same morning.
-- ============================================================================

create table if not exists cash_snapshots (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,

  taken_on      date not null,
  -- What they said was in the bank, and the floor they were holding to.
  balance       numeric(12,2) not null,
  buffer        numeric(12,2) not null default 0,
  horizon_days  int not null default 30,

  -- The drawn curve: [{ "d": "2026-08-14", "p": 19400.25 }, …]. Compact keys
  -- because this is ~90 entries a row and nothing reads it as prose.
  projected     jsonb not null default '[]'::jsonb,

  created_at    timestamptz not null default now()
);

create unique index if not exists cash_snapshots_day_idx on cash_snapshots (account_id, taken_on);
-- Only ever read as "the most recent one before today".
create index if not exists cash_snapshots_recent_idx on cash_snapshots (account_id, taken_on desc);

alter table cash_snapshots enable row level security;
drop policy if exists cash_snapshots_owner on cash_snapshots;
create policy cash_snapshots_owner on cash_snapshots
  for all using ( is_owner(account_id) ) with check ( is_owner(account_id) );

-- Make four range checks on `accounts` mean what they say.
--
--   node scripts/run-migration.mjs 2026-08-06-validate-account-range-checks.sql
--
-- Do NOT apply this with scripts/deploy-schema.mjs — that replays the whole of
-- schema.sql, including its drop policy / create policy pairs, against a live
-- database. This file is the whole change.
--
-- WHAT IS ACTUALLY WRONG. These four constraints were added NOT VALID:
--
--   accounts_booking_window_minutes_range    30 .. 600
--   accounts_default_burden_pct_range         0 .. 200
--   accounts_default_warranty_months_range    0 .. 600
--   accounts_min_margin_pct_range             0 .. 100
--
-- NOT VALID means Postgres enforces the rule on every INSERT and UPDATE from the
-- moment it is created, but skips the one-time scan that proves the rows already
-- in the table obey it. That is the right way to add a constraint to a table you
-- cannot afford to lock — the scan takes ACCESS EXCLUSIVE, VALIDATE takes only
-- SHARE UPDATE EXCLUSIVE, so the expensive half can happen later without
-- blocking reads or writes.
--
-- Later is now. Until a constraint is validated the planner will not use it, and
-- more importantly nobody reading the schema can tell whether the range is a
-- guarantee or an aspiration. An unvalidated constraint is a comment that
-- happens to be enforced going forward.
--
-- IDEMPOTENT. VALIDATE CONSTRAINT on an already-valid constraint is a documented
-- no-op, so running this file twice is harmless.

begin;

-- Refuse rather than fail halfway. VALIDATE's own error — 'check constraint
-- "..." of relation "accounts" is violated by some row' — names the constraint
-- and then leaves you guessing which row and by how much. Count first, and say
-- so in a message an operator can act on.
--
-- NULL is not a violation: a CHECK passes unless it evaluates to false, so a
-- column that was never set is fine and stays fine. Only real out-of-range
-- values can stop this.
do $$
declare
  bad_booking   integer;
  bad_burden    integer;
  bad_warranty  integer;
  bad_margin    integer;
begin
  select count(*) into bad_booking  from accounts
   where booking_window_minutes is not null
     and (booking_window_minutes < 30 or booking_window_minutes > 600);

  select count(*) into bad_burden   from accounts
   where default_burden_pct is not null
     and (default_burden_pct < 0 or default_burden_pct > 200);

  select count(*) into bad_warranty from accounts
   where default_warranty_months is not null
     and (default_warranty_months < 0 or default_warranty_months > 600);

  select count(*) into bad_margin   from accounts
   where min_margin_pct is not null
     and (min_margin_pct < 0 or min_margin_pct > 100);

  if bad_booking + bad_burden + bad_warranty + bad_margin > 0 then
    raise exception
      'Cannot validate: % account(s) outside booking_window_minutes 30..600, % outside default_burden_pct 0..200, % outside default_warranty_months 0..600, % outside min_margin_pct 0..100. Correct those rows first.',
      bad_booking, bad_burden, bad_warranty, bad_margin;
  end if;

  raise notice 'No violating rows. Validating four constraints.';
end $$;

alter table accounts validate constraint accounts_booking_window_minutes_range;
alter table accounts validate constraint accounts_default_burden_pct_range;
alter table accounts validate constraint accounts_default_warranty_months_range;
alter table accounts validate constraint accounts_min_margin_pct_range;

commit;

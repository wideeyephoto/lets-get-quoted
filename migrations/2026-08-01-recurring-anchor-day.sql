-- ============================================================================
-- The day of the month a monthly plan is actually anchored to.
--
-- Monthly rollover clamps into short months — the 31st becomes the 28th — and
-- until now that clamp was PERMANENT, because each step could only see the day
-- it had just landed on. A plan set up on the 31st ran 01-31, 02-28, and then
-- 03-28: one February and the customer is on the 28th forever, having agreed to
-- the last day of the month.
--
-- Storing the agreed day fixes it in one column: February borrows the 28th and
-- March gives the 31st straight back.
--
-- Backfilled from next_run_date, which is the best evidence we have of the day
-- these plans were meant to run on. Plans that have ALREADY drifted keep their
-- drifted day — inventing an original date for them would move real customers'
-- billing to a day nobody agreed to. They stop drifting further, which is the
-- part that matters.
-- ============================================================================

alter table recurring_plans add column if not exists anchor_day int
  check (anchor_day is null or (anchor_day >= 1 and anchor_day <= 31));

update recurring_plans
set anchor_day = extract(day from next_run_date)::int
where anchor_day is null;

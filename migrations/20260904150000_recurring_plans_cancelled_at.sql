begin;

-- Add cancelled_at column to recurring_plans so deactivations are recorded explicitly
-- and subsequent metadata/price edits do not re-trigger churn in later periods.
alter table public.recurring_plans add column if not exists cancelled_at timestamptz;

-- Populate existing inactive rows from updated_at if not already set
update public.recurring_plans
set cancelled_at = updated_at
where active = false and cancelled_at is null;

commit;

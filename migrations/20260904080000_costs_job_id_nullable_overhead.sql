-- Allow nullable costs.job_id for general business overhead expenses (rent, insurance, fuel, truck note),
-- and configure RLS on costs so office users with reports.read / jobs.read can select,
-- and office users with jobs.write can insert, update and delete.

begin;

-- 1. Drop NOT NULL on costs.job_id to accommodate non-job operating overhead expenses
alter table public.costs alter column job_id drop not null;

-- 2. Update RLS policies on costs
drop policy if exists cost_owner on public.costs;
drop policy if exists cost_select on public.costs;
drop policy if exists cost_modify on public.costs;

create policy cost_select on public.costs
  for select using (
    public.office_can(account_id, 'reports.read')
    or public.office_can(account_id, 'jobs.read')
  );

create policy cost_modify on public.costs
  for all using (
    public.office_can(account_id, 'jobs.write')
  ) with check (
    public.office_can(account_id, 'jobs.write')
  );

commit;

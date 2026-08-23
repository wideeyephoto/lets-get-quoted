-- Update RLS policies for recurring_plans table so office staff with jobs and clients capabilities can manage recurring maintenance plans.

begin;

alter table if exists recurring_plans enable row level security;
drop policy if exists recurring_plans_owner on recurring_plans;
drop policy if exists recurring_plans_select on recurring_plans;
drop policy if exists recurring_plans_modify on recurring_plans;

create policy recurring_plans_select on recurring_plans
  for select using (
    public.office_can(account_id, 'jobs.read')
    and public.office_can(account_id, 'clients.read')
  );

create policy recurring_plans_modify on recurring_plans
  for all using (
    public.office_can(account_id, 'jobs.write')
    and public.office_can(account_id, 'clients.write')
  ) with check (
    public.office_can(account_id, 'jobs.write')
    and public.office_can(account_id, 'clients.write')
  );

commit;

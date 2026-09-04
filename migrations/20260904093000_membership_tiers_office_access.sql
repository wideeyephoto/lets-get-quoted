-- Allow office staff to read and write membership tiers

begin;

drop policy if exists membership_tiers_owner on public.membership_tiers;
drop policy if exists membership_tiers_select on public.membership_tiers;
drop policy if exists membership_tiers_modify on public.membership_tiers;

create policy membership_tiers_select on public.membership_tiers
  for select using (
    public.office_can(account_id, 'jobs.read')
  );

create policy membership_tiers_modify on public.membership_tiers
  for all using (
    public.office_can(account_id, 'jobs.write')
  ) with check (
    public.office_can(account_id, 'jobs.write')
  );

commit;

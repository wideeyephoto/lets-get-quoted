-- Update RLS policies for review_invites table so office staff with jobs or clients capabilities can manage reviews and feedback.

begin;

alter table if exists review_invites enable row level security;
drop policy if exists review_invites_owner on review_invites;
drop policy if exists review_invites_select on review_invites;
drop policy if exists review_invites_modify on review_invites;

create policy review_invites_select on review_invites
  for select using (
    public.office_can(account_id, 'jobs.read')
    or public.office_can(account_id, 'clients.read')
  );

create policy review_invites_modify on review_invites
  for all using (
    public.office_can(account_id, 'jobs.write')
    or public.office_can(account_id, 'clients.write')
  ) with check (
    public.office_can(account_id, 'jobs.write')
    and public.office_can(account_id, 'clients.write')
  );

commit;

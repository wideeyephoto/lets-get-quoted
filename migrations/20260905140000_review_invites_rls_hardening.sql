-- Align review_invites_modify WITH CHECK policy with USING (OR instead of AND)
-- so office users holding jobs.write can manage review invites without failing check constraints.
-- Also revoke anon INSERT, UPDATE, DELETE permissions on review_invites.

begin;

alter table if exists public.review_invites enable row level security;

drop policy if exists review_invites_modify on public.review_invites;

create policy review_invites_modify on public.review_invites
  for all using (
    public.office_can(account_id, 'jobs.write')
    or public.office_can(account_id, 'clients.write')
  ) with check (
    public.office_can(account_id, 'jobs.write')
    or public.office_can(account_id, 'clients.write')
  );

-- The revoke is the security: revoke unauthenticated write grants on review_invites
revoke insert, update, delete on table public.review_invites from anon;

commit;

-- Introduce compatibility view public.account_memberships for RLS functions
-- and security checks that verify tenant membership via active flag.

begin;

create or replace view public.account_memberships as
  select 
    id,
    account_id,
    user_id,
    role,
    created_at,
    deactivated_at,
    (deactivated_at is null) as active
  from public.memberships;

grant select on public.account_memberships to anon, authenticated, service_role;

commit;

-- Replace an office member's grants as one transaction, retaining owner-only RLS.
create or replace function public.replace_office_member_capabilities(
  p_account_id uuid,
  p_user_id uuid,
  p_capabilities text[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_owner(p_account_id) then
    raise exception 'office_permissions_owner_required' using errcode = '42501';
  end if;

  -- Serialize replacement with other saves and membership changes.
  perform 1 from public.memberships
    where account_id = p_account_id and user_id = p_user_id and role = 'office'
    for update;
  if not found then
    raise exception 'office_permissions_target_invalid' using errcode = '22023';
  end if;

  if p_capabilities is null or exists (
    select 1 from pg_catalog.unnest(p_capabilities) as requested(capability)
    where requested.capability is null or not exists (
      select 1 from public.office_capabilities catalog
      where catalog.capability = requested.capability
    )
  ) then
    raise exception 'office_permissions_capability_invalid' using errcode = '22023';
  end if;

  delete from public.office_member_capabilities
    where account_id = p_account_id and user_id = p_user_id;
  insert into public.office_member_capabilities (account_id, user_id, capability, granted_by)
    select p_account_id, p_user_id, capability, auth.uid()
    from (select distinct pg_catalog.unnest(p_capabilities) as capability) requested;
end;
$$;

revoke all on function public.replace_office_member_capabilities(uuid, uuid, text[]) from public, anon;
grant execute on function public.replace_office_member_capabilities(uuid, uuid, text[]) to authenticated;

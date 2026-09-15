-- Taking office access away.
--
-- Blocker 3 in docs/office-seat-activation.md: "removal, suspension, and any
-- reactivation lifecycle". This does removal and deliberately not the other two.
--
-- WHY NOT SUSPENSION. A suspended state needs a reason to exist, and the only
-- one anybody has offered is "they might come back" -- which re-inviting already
-- covers, at the cost of one email. Adding a third membership state would make
-- every seat count, every policy and every screen ask "and what about
-- suspended?", and the answer would be "same as removed" everywhere. A state
-- that behaves identically to another is not a state; it is a note.
--
-- WHAT THIS REFUSES TO DO. It removes `office` memberships only. Removing an
-- OWNER is a different act with different consequences -- the last-owner trigger
-- from 20260819090100 already stops the catastrophic version of it, and the
-- merely-serious version (one of two owners removing the other) is not something
-- a team screen should do casually while its label says "remove office access".
--
-- THE SEAT IS FREED IMMEDIATELY, because seat counting reads memberships
-- directly. There is no separate ledger to keep in step, which is the one good
-- consequence of the counted set being the membership table itself.

begin;

create or replace function public.remove_office_user(
  p_account_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $remove$
declare
  v_actor uuid := auth.uid();
  v_role text;
begin
  if v_actor is null or not exists (
    select 1 from public.memberships m
    where m.account_id = p_account_id and m.user_id = v_actor and m.role = 'owner'
  ) then
    raise exception 'office_seat_forbidden' using errcode = 'P0001';
  end if;

  select m.role::text into v_role
  from public.memberships m
  where m.account_id = p_account_id and m.user_id = p_user_id
  for update;

  -- Nobody to remove. Reported as false rather than raised: a second click on a
  -- row somebody already removed is not an error worth showing anyone.
  if not found then
    return false;
  end if;

  -- An owner is not removed here. The guard exists because the button that
  -- calls this says "remove office access", and quietly accepting an owner id
  -- would make that label a lie in the one direction that ends a business's
  -- access to its own workspace.
  if v_role <> 'office' then
    raise exception 'office_removal_wrong_role'
      using errcode = 'P0001',
            detail = pg_catalog.jsonb_build_object(
              'code', 'office_removal_wrong_role', 'role', v_role
            )::text;
  end if;

  delete from public.memberships m
  where m.account_id = p_account_id and m.user_id = p_user_id and m.role = 'office';

  return true;
end;
$remove$;

revoke all on function public.remove_office_user(uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_office_user(uuid, uuid) to authenticated;

do $post$
declare
  v_grantees text;
begin
  if not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'remove_office_user'
  ) then
    raise exception 'remove_office_user was not created';
  end if;

  -- anon must not hold it. `authenticated` does, because the function verifies
  -- for itself that the caller owns the workspace -- which is the same shape
  -- create_office_invitation uses, and the reason neither needs the service role.
  select pg_catalog.string_agg(distinct pg_catalog.pg_get_userbyid(x.grantee), ', ')
    into v_grantees
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  cross join lateral pg_catalog.aclexplode(coalesce(p.proacl, '{}'::aclitem[])) x
  where n.nspname = 'public' and p.proname = 'remove_office_user'
    and x.privilege_type = 'EXECUTE'
    and pg_catalog.pg_get_userbyid(x.grantee) = 'anon';

  if v_grantees is not null then
    raise exception 'remove_office_user is reachable by anon';
  end if;

  -- The last-owner trigger must still be there. This function refuses owners
  -- itself, but that refusal is a label being honest -- the trigger is what
  -- actually stops a workspace being left with nobody who owns it.
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgname = 'guard_last_owner_trigger' and not tgisinternal
  ) then
    raise exception 'guard_last_owner_trigger is missing; removal must not ship without it';
  end if;
end $post$;

commit;

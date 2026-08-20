-- Make a purchased office seat actually be a seat.
--
-- THE GAP. 20260818220000 taught the CREW seat limit to add purchased capacity,
-- and 20260819000000 did the same for storage. Nothing ever did it for office
-- users. So `office_user` -- a recurring $15/month SKU whose grant path works
-- (20260819010000) and whose lapse path works (the capacity lifecycle sweep) --
-- would take the money, write a `workspace_purchased_capacity` row, keep that row
-- faithfully in step with Stripe, and never raise the limit by one.
--
-- That is word for word the failure `crew_user` is withheld to avoid:
-- "selling it would charge $5 a month and grant no seat". It was fixed for crew
-- and missed for office, and the withheld reason for office was rewritten today
-- for unrelated progress without anybody noticing this half was still open.
--
-- TWO READERS, BOTH WIDENED. The limit is computed in two places and they must
-- not disagree -- one refusing an invitation the other would have allowed is a
-- contractor being told they are full while their own screen says otherwise:
--
--   * office_seat_usage(uuid), which the invitation path uses;
--   * create_office_user_membership_with_seat_entitlement(uuid, uuid), the
--     original counted-entry RPC.
--
-- PAST_DUE STILL COUNTS, because workspace_purchased_capacity_units says so and
-- this must not invent a second opinion. A card that failed this morning should
-- not lock somebody out of their job while Stripe is still retrying.
--
-- This does not make the SKU sellable. It removes one reason; a live recurring
-- Stripe Price is still required, and TOP_UPS_WITHHELD still carries it.

begin;

-- ---------------------------------------------------------------------------
-- 1. The invitation path
-- ---------------------------------------------------------------------------
create or replace function public.office_seat_usage(p_account_id uuid)
returns table (office_limit bigint, active_count bigint)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $seats$
declare
  v_limits jsonb;
  v_state text;
  v_limit_json jsonb;
  v_numeric numeric;
begin
  select e.feature_limits, e.entitlement_state
    into v_limits, v_state
  from public.workspace_entitlements e
  where e.account_id = p_account_id
  for update;

  if not found or v_state = 'archived' then
    raise exception 'office_seat_entitlement_unavailable' using errcode = 'P0001';
  end if;

  v_limit_json := v_limits -> 'office_users';
  if pg_catalog.jsonb_typeof(v_limit_json) <> 'number' then
    raise exception 'office_seat_entitlement_unavailable' using errcode = 'P0001';
  end if;

  v_numeric := (v_limit_json #>> '{}')::numeric;
  if v_numeric < 0 or pg_catalog.trunc(v_numeric) <> v_numeric then
    raise exception 'office_seat_entitlement_unavailable' using errcode = 'P0001';
  end if;

  return query
  select
    -- The plan's allowance PLUS what the workspace bought. Same shape as the
    -- crew seat gate and the storage cap, and deliberately the same helper, so
    -- the three cannot drift on what "counted" means.
    v_numeric::bigint
      + public.workspace_purchased_capacity_units(p_account_id, 'office_users'),
    (select pg_catalog.count(*)
       from public.memberships m
      where m.account_id = p_account_id
        and m.role in ('owner', 'office'))::bigint;
end;
$seats$;

-- ---------------------------------------------------------------------------
-- 2. The original counted-entry RPC
-- ---------------------------------------------------------------------------
-- Patched from its own live source rather than retyped, the same way
-- 20260818220000 extended the crew gate. The anchor is asserted to appear
-- exactly once first, so a drifted body fails this migration instead of being
-- silently rewritten into something nobody reviewed.
do $patch$
declare
  v_def text;
  v_anchor text := '  v_limit := v_limit_numeric::bigint;';
  v_replacement text :=
    '  v_limit := v_limit_numeric::bigint'
    || pg_catalog.chr(10)
    || '    + public.workspace_purchased_capacity_units(p_account_id, ''office_users'');';
  v_hits integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.create_office_user_membership_with_seat_entitlement(uuid,uuid)'::regprocedure
  ) into v_def;

  if v_def is null then
    raise exception 'the office seat RPC is missing; this migration has nothing to patch';
  end if;

  -- Already patched. Idempotent rather than raising, so a re-run is a no-op.
  if pg_catalog.strpos(v_def, 'workspace_purchased_capacity_units') > 0 then
    return;
  end if;

  v_hits := (pg_catalog.length(v_def) - pg_catalog.length(
    pg_catalog.replace(v_def, v_anchor, '')
  )) / pg_catalog.length(v_anchor);

  if v_hits <> 1 then
    raise exception 'the seat-limit anchor appears % times, expected exactly 1', v_hits;
  end if;

  execute pg_catalog.replace(v_def, v_anchor, v_replacement);
end;
$patch$;

do $post$
declare
  v_def text;
begin
  -- BOTH readers, or they disagree about who is full. One refusing an
  -- invitation the other would have allowed is the worst version of this.
  select pg_catalog.pg_get_functiondef('public.office_seat_usage(uuid)'::regprocedure) into v_def;
  if pg_catalog.strpos(v_def, 'workspace_purchased_capacity_units') = 0 then
    raise exception 'office_seat_usage does not count purchased capacity';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.create_office_user_membership_with_seat_entitlement(uuid,uuid)'::regprocedure
  ) into v_def;
  if pg_catalog.strpos(v_def, 'workspace_purchased_capacity_units') = 0 then
    raise exception 'the office seat RPC does not count purchased capacity';
  end if;

  -- And the RPC must still be reachable by nobody. Patching its body must not
  -- have re-granted it: `create or replace` preserves an ACL, but `execute` of
  -- a lifted definition is a fresh CREATE if the signature ever shifts.
  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    cross join lateral pg_catalog.aclexplode(coalesce(p.proacl, '{}'::aclitem[])) x
    where n.nspname = 'public'
      and p.proname = 'create_office_user_membership_with_seat_entitlement'
      and x.privilege_type = 'EXECUTE'
      and x.grantee <> p.proowner
  ) then
    raise exception 'the office seat RPC became reachable while being patched';
  end if;
end $post$;

commit;

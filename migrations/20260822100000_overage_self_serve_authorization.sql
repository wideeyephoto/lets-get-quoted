-- Let a contractor switch extra usage on, choose the ceiling, and switch it off.
--
-- 20260819080000 built the whole overage rail and left it unreachable. The
-- tables are owner-READABLE and service-role-WRITABLE, deliberately: "an owner
-- who could write their own settings row could raise their own cap without
-- leaving evidence, which is the one thing this table exists to prevent." That
-- reasoning is right, and it is why this is an RPC rather than a policy. The
-- function is the only way in, it writes the evidence and the state together,
-- and it decides what the evidence SAYS rather than letting the caller assert it.
--
-- WHY THE ACTION IS DERIVED, NOT PASSED. workspace_overage_authorizations.action
-- is the audit trail of a money-affecting switch. A caller that could send
-- 'cap_changed' while actually turning overage on for the first time could write
-- false history through a correctly-behaving function. The caller says what it
-- WANTS (on/off, and a ceiling); the function reads the current row and records
-- what actually happened.
--
-- WHY THE FOREIGN KEY GOES. workspace_overage_authorizations.account_id
-- referenced accounts ON DELETE RESTRICT. Nothing has ever written to that table
-- outside a test harness, so it has never bitten -- but the moment this function
-- ships, any workspace that touches this switch becomes UNDELETABLE:
-- deleteAccountAction ends in `from('accounts').delete()` and raises on error.
-- Blocking deletion is not how you protect evidence, it is how you trap somebody
-- in an account they asked to leave, and the deletion path says so itself:
-- "a leaked subscription is recoverable by an operator where a blocked deletion
-- is not."
--
-- The table already refuses an FK to auth.users for precisely this reason --
-- "deleting an identity must not erase evidence of who authorized a charge" --
-- and the same argument applies to the workspace. The column stays; the
-- constraint goes; the evidence outlives the account rather than preventing its
-- deletion. `workspace_overage_settings` keeps its ON DELETE CASCADE, because
-- current state SHOULD die with the workspace. Only the history survives.
--
-- WHAT THIS STILL CANNOT DO. It cannot charge anybody. Accruals sit in
-- workspace_overage_accruals until something turns them into a Stripe line, and
-- that needs live metered Prices which do not exist. Turning the switch on
-- authorizes an accrual, not a payment.

begin;

-- ---------------------------------------------------------------------------
-- Evidence must outlive the workspace, not prevent it being deleted
-- ---------------------------------------------------------------------------
alter table public.workspace_overage_authorizations
  drop constraint if exists workspace_overage_authorizations_account_id_fkey;

comment on column public.workspace_overage_authorizations.account_id is
  'Deliberately NOT a foreign key. An authorization is evidence that somebody '
  'approved a charge, and it has to survive the workspace being deleted -- the '
  'same reason authorized_by has no FK to auth.users. ON DELETE RESTRICT here '
  'would instead make an account that used this switch impossible to delete.';

-- ---------------------------------------------------------------------------
-- The only way in
-- ---------------------------------------------------------------------------
create or replace function public.set_workspace_overage_authorization(
  p_account_id uuid,
  p_enabled boolean,
  p_cap_cents bigint,
  p_terms_version text,
  p_terms_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $overage$
declare
  v_actor uuid := auth.uid();
  v_current public.workspace_overage_settings%rowtype;
  v_action text;
  v_auth_id uuid;
  v_cap bigint := p_cap_cents;
begin
  -- OWNER ONLY, and never an office user. Office capabilities cover work, not
  -- the workspace's exposure to a bill. Checked here rather than left to RLS,
  -- because a security definer function runs past RLS by construction.
  if v_actor is null or not exists (
    select 1 from public.memberships m
    where m.account_id = p_account_id and m.user_id = v_actor and m.role = 'owner'
  ) then
    raise exception 'overage_forbidden' using errcode = 'P0001';
  end if;

  if p_enabled is null then
    raise exception 'overage_intent_required' using errcode = '22023';
  end if;

  -- The digest is what makes "they agreed to THESE words" provable, so a blank
  -- or malformed one is refused rather than stored as an empty promise.
  if p_terms_version is null or pg_catalog.length(pg_catalog.btrim(p_terms_version)) = 0 then
    raise exception 'overage_terms_missing' using errcode = '22023';
  end if;
  if p_terms_sha256 is null or p_terms_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'overage_terms_digest_invalid' using errcode = '22023';
  end if;

  if not p_enabled then
    -- The table's CHECK forbids a cap on a disabled row. Nulled here so that
    -- switching off never fails on a stale number the caller happened to send.
    v_cap := null;
  else
    if v_cap is null or v_cap <= 0 then
      raise exception 'overage_cap_required' using errcode = '22023';
    end if;
    -- A CEILING ON THE CEILING. This is not a policy limit, it is a units guard:
    -- the parameter is CENTS and a caller that sends dollars-as-cents is off by
    -- a hundred in the expensive direction. It does not catch every unit bug --
    -- $50 sent as 500000 still lands under it -- so the unit is also pinned by
    -- test. Raising this is a one-line migration.
    if v_cap > 1000000 then
      raise exception 'overage_cap_too_large'
        using errcode = '22023',
              detail = pg_catalog.jsonb_build_object(
                'code', 'overage_cap_too_large',
                'cap_cents', v_cap,
                'max_cap_cents', 1000000
              )::text;
    end if;
  end if;

  -- Serialises two changes to one workspace. The settings row may not exist
  -- yet, so FOR UPDATE on it would lock nothing on the first call and let a
  -- double-click write two 'enabled' rows into an append-only audit trail. Same
  -- idiom as the credit-lot grant in 20260815213142.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_account_id::text || ':overage_settings', 0)
  );

  select s.* into v_current
    from public.workspace_overage_settings s
   where s.account_id = p_account_id;

  -- ALREADY TRUE IS NOT A CHANGE. Writing evidence for a no-op would put a row
  -- in the audit trail saying somebody authorized something on a day they only
  -- re-saved a form, which is exactly the sort of history you do not want to
  -- have to explain. Same posture as an already-scheduled cancellation.
  if coalesce(v_current.enabled, false) = p_enabled
     and v_current.cap_cents is not distinct from v_cap then
    return pg_catalog.jsonb_build_object(
      'enabled', coalesce(v_current.enabled, false),
      'cap_cents', v_current.cap_cents,
      'authorization_id', v_current.authorization_id,
      'changed', false
    );
  end if;

  v_action := case
    when not p_enabled then 'disabled'
    when coalesce(v_current.enabled, false) then 'cap_changed'
    else 'enabled'
  end;

  -- Written BEFORE the state it justifies, so a crash between the two leaves an
  -- authorization with no matching switch rather than a switch nobody approved.
  insert into public.workspace_overage_authorizations
    (account_id, action, cap_cents, terms_version, terms_sha256, authorized_by, authorized_at)
  values (
    p_account_id, v_action, v_cap,
    pg_catalog.btrim(p_terms_version), p_terms_sha256,
    v_actor, pg_catalog.now()
  )
  returning id into v_auth_id;

  insert into public.workspace_overage_settings
    (account_id, enabled, cap_cents, authorization_id, updated_at)
  values (p_account_id, p_enabled, v_cap, v_auth_id, pg_catalog.now())
  on conflict (account_id) do update
     set enabled = excluded.enabled,
         cap_cents = excluded.cap_cents,
         authorization_id = excluded.authorization_id,
         updated_at = excluded.updated_at;

  -- NOTE ON LOWERING A CAP BELOW WHAT IS ALREADY SPENT. Deliberately allowed.
  -- Accruals already recorded stand -- you cannot un-spend -- and the meters
  -- simply refuse from here on. Refusing the change would trap somebody who has
  -- just realised they are spending too much in the cap that alarmed them.
  return pg_catalog.jsonb_build_object(
    'enabled', p_enabled,
    'cap_cents', v_cap,
    'authorization_id', v_auth_id,
    'changed', true
  );
end;
$overage$;

revoke all on function public.set_workspace_overage_authorization(uuid, boolean, bigint, text, text)
  from public, anon;
grant execute on function public.set_workspace_overage_authorization(uuid, boolean, bigint, text, text)
  to authenticated;

commit;

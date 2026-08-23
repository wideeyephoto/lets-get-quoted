-- Persist a scheduled base-plan change.
--
-- `billing_subscriptions.pending_plan_code`, `pending_billing_interval` and
-- `pending_effective_at` have existed since 20260815213142 with an
-- all-or-nothing CHECK, and until now nothing wrote them. `decidePlanTransition`
-- routes downgrades and every billing-cycle change to `schedule_at_renewal`,
-- and this is where that decision becomes durable.
--
-- WHY AN RPC AND NOT A DIRECT UPDATE. The table is service_role-only, and the
-- caller is a server action reachable by any signed-in owner. Routing through a
-- definer function means the account scope is enforced in one place that a
-- caller cannot skip, and the all-or-nothing rule is checked before the CHECK
-- constraint turns it into a 500.
--
-- No Stripe call belongs here. A scheduled change is a local intent until the
-- renewal applies it; sending the price change to Stripe now would take effect
-- immediately, which is exactly what schedule_at_renewal exists to prevent.

create or replace function public.set_billing_subscription_pending_plan(
  p_account_id uuid,
  p_provider_subscription_id text,
  p_pending_plan_code text,
  p_pending_billing_interval text,
  p_pending_effective_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_all_null boolean;
  v_all_set boolean;
  v_updated integer;
begin
  if p_account_id is null or p_provider_subscription_id is null then
    raise exception 'a workspace and a provider subscription id are required'
      using errcode = '22023';
  end if;

  v_all_null := p_pending_plan_code is null
            and p_pending_billing_interval is null
            and p_pending_effective_at is null;
  v_all_set  := p_pending_plan_code is not null
            and p_pending_billing_interval is not null
            and p_pending_effective_at is not null;

  -- Mirrors billing_subscriptions_pending_check. Raising here names the problem;
  -- letting the constraint fire produces a bare 23514 the caller cannot explain.
  if not (v_all_null or v_all_set) then
    raise exception 'a pending plan change needs a plan, an interval and an effective time, or none of the three'
      using errcode = '22023';
  end if;

  if v_all_set then
    if p_pending_plan_code not in ('solo', 'growth', 'scale', 'enterprise') then
      raise exception 'unsupported pending plan code %', p_pending_plan_code
        using errcode = '22023';
    end if;
    if p_pending_billing_interval not in ('monthly', 'annual') then
      raise exception 'unsupported pending billing interval %', p_pending_billing_interval
        using errcode = '22023';
    end if;
    -- A change scheduled in the past would be applied by the very next worker
    -- pass, which is an immediate change wearing a schedule's clothes.
    if p_pending_effective_at <= pg_catalog.now() then
      raise exception 'a pending plan change must take effect in the future'
        using errcode = '22023';
    end if;
  end if;

  update public.billing_subscriptions
     set pending_plan_code = p_pending_plan_code,
         pending_billing_interval = p_pending_billing_interval,
         pending_effective_at = p_pending_effective_at
   where account_id = p_account_id
     and provider_subscription_id = p_provider_subscription_id;

  get diagnostics v_updated = row_count;
  -- Both the account and the subscription id must match. A caller that owns a
  -- different workspace changes nothing and is told so, rather than silently
  -- succeeding against zero rows.
  return v_updated = 1;
end;
$$;

revoke all on function public.set_billing_subscription_pending_plan(uuid, text, text, text, timestamptz) from public;
revoke all on function public.set_billing_subscription_pending_plan(uuid, text, text, text, timestamptz) from anon;
revoke all on function public.set_billing_subscription_pending_plan(uuid, text, text, text, timestamptz) from authenticated;
grant execute on function public.set_billing_subscription_pending_plan(uuid, text, text, text, timestamptz) to service_role;

-- Post-conditions. Assert the whole shape, not a keyword that could sit in a
-- comment: an earlier migration in this repo passed its own check against the
-- word `reconciliation_status` appearing in a comment.
do $$
declare
  v_src text;
  v_secdef boolean;
begin
  -- prosrc is the BODY, verbatim as written, and prosecdef is the catalogue
  -- boolean. Deliberately NOT pg_get_functiondef: it renders keywords in upper
  -- case, so a strpos for 'security definer' can never match on any PostgreSQL
  -- -- a guard that is always false looks identical to one that always passes.
  select p.prosrc, p.prosecdef
    into v_src, v_secdef
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'set_billing_subscription_pending_plan';

  if v_src is null then
    raise exception 'set_billing_subscription_pending_plan was not created';
  end if;
  if not v_secdef then
    raise exception 'set_billing_subscription_pending_plan must be security definer';
  end if;
  if pg_catalog.strpos(v_src, 'and provider_subscription_id = p_provider_subscription_id') = 0 then
    raise exception 'the update must be scoped by BOTH account and subscription id';
  end if;
  if pg_catalog.strpos(v_src, 'p_pending_effective_at <= pg_catalog.now()') = 0 then
    raise exception 'the future-dated guard is missing';
  end if;

  if pg_catalog.has_function_privilege(
       'authenticated',
       'public.set_billing_subscription_pending_plan(uuid, text, text, text, timestamptz)',
       'execute') then
    raise exception 'authenticated must not be able to schedule a plan change directly';
  end if;
  if not pg_catalog.has_function_privilege(
       'service_role',
       'public.set_billing_subscription_pending_plan(uuid, text, text, text, timestamptz)',
       'execute') then
    raise exception 'service_role must be able to execute the pending-plan RPC';
  end if;
end;
$$;

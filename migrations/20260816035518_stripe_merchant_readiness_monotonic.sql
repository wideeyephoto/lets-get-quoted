-- Make Merchant readiness evidence monotonic. Two Stripe reads can finish out
-- of order; only the evidence captured later may replace the workspace state.
-- This prevents an older ready response from re-enabling direct payments after
-- a newer response observed the Merchant as disabled or restricted.

begin;

create or replace function public.persist_stripe_merchant_readiness_evidence(
  p_workspace_id uuid,
  p_provider_account_id text,
  p_expected_livemode boolean,
  p_evidence jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_account public.accounts%rowtype;
  v_state text;
  v_verified_at timestamptz;
  v_requirements_checked_at timestamptz;
  v_ready_at timestamptz;
  v_disabled_at timestamptz;
  v_livemode boolean;
  v_dashboard text;
  v_card_active boolean;
  v_ach_active boolean;
  v_payouts_active boolean;
  v_fees_collector text;
  v_losses_collector text;
  v_api_version text;
  v_snapshot jsonb;
  v_snapshot_sha256 text;
  v_updated integer;
begin
  if p_workspace_id is null then
    raise exception 'Stripe Merchant workspace ID is required' using errcode = '22023';
  end if;
  if p_provider_account_id is null
     or p_provider_account_id !~ '^acct_[A-Za-z0-9]{8,}$'
     or pg_catalog.length(p_provider_account_id) > 255 then
    raise exception 'invalid Stripe Merchant account ID' using errcode = '22023';
  end if;
  if p_expected_livemode is null then
    raise exception 'Stripe Merchant livemode binding is required' using errcode = '22023';
  end if;
  if p_evidence is null or pg_catalog.jsonb_typeof(p_evidence) <> 'object' then
    raise exception 'Stripe Merchant readiness evidence must be a JSON object'
      using errcode = '22023';
  end if;

  v_state := p_evidence ->> 'merchant_onboarding_state';
  v_verified_at := nullif(p_evidence ->> 'merchant_configuration_verified_at', '')::timestamptz;
  v_requirements_checked_at := nullif(p_evidence ->> 'merchant_requirements_checked_at', '')::timestamptz;
  v_ready_at := nullif(p_evidence ->> 'merchant_ready_at', '')::timestamptz;
  v_disabled_at := nullif(p_evidence ->> 'merchant_disabled_at', '')::timestamptz;
  v_livemode := (p_evidence ->> 'merchant_livemode')::boolean;
  v_dashboard := nullif(p_evidence ->> 'merchant_dashboard_type', '');
  v_card_active := (p_evidence ->> 'merchant_card_payments_active')::boolean;
  v_ach_active := (p_evidence ->> 'merchant_us_bank_account_payments_active')::boolean;
  v_payouts_active := (p_evidence ->> 'merchant_payouts_active')::boolean;
  v_fees_collector := nullif(p_evidence ->> 'merchant_fees_collector', '');
  v_losses_collector := nullif(p_evidence ->> 'merchant_losses_collector', '');
  v_api_version := nullif(p_evidence ->> 'merchant_configuration_api_version', '');
  v_snapshot := p_evidence -> 'merchant_configuration_snapshot';
  v_snapshot_sha256 := p_evidence ->> 'merchant_configuration_snapshot_sha256';

  if v_state is null
     or v_state not in ('pending', 'restricted', 'ready', 'disabled')
     or v_verified_at is null
     or v_verified_at > pg_catalog.clock_timestamp() + interval '5 minutes'
     or v_requirements_checked_at is null
     or v_requirements_checked_at is distinct from v_verified_at
     or v_livemode is null
     or v_livemode is distinct from p_expected_livemode
     or v_card_active is null
     or v_ach_active is null
     or v_payouts_active is null
     or v_snapshot is null
     or pg_catalog.jsonb_typeof(v_snapshot) <> 'object'
     or v_snapshot_sha256 is null
     or v_snapshot_sha256 !~ '^[0-9a-f]{64}$'
     or v_snapshot ->> 'schema_version' is distinct from 'lgq.stripe-merchant.v1'
     or v_snapshot ->> 'account_id' is distinct from p_provider_account_id
     or pg_catalog.jsonb_typeof(v_snapshot -> 'livemode') <> 'boolean'
     or (v_snapshot ->> 'livemode')::boolean is distinct from p_expected_livemode
     or nullif(v_snapshot #>> '{stripe_response,api_version}', '') is distinct from v_api_version
     or nullif(v_snapshot #>> '{verification,verified_at}', '')::timestamptz
        is distinct from v_verified_at
     or pg_catalog.jsonb_typeof(v_snapshot #> '{verification,ready}') <> 'boolean'
     or (v_snapshot #>> '{verification,ready}')::boolean
        is distinct from (v_state = 'ready') then
    raise exception 'Stripe Merchant readiness evidence is incomplete or inconsistent'
      using errcode = '22023';
  end if;
  if (v_state = 'ready' and (v_ready_at is distinct from v_verified_at or v_disabled_at is not null))
     or (v_state = 'disabled' and (v_disabled_at is distinct from v_verified_at or v_ready_at is not null))
     or (v_state in ('pending', 'restricted') and (v_ready_at is not null or v_disabled_at is not null)) then
    raise exception 'Stripe Merchant readiness timestamps do not match onboarding state'
      using errcode = '22023';
  end if;

  -- The workspace row is the only lock. Every readiness writer takes it before
  -- comparing timestamps, so either arrival order produces the newest state.
  select a.* into v_account
    from public.accounts a
   where a.id = p_workspace_id
   for update;
  if not found then
    raise exception 'Stripe Merchant workspace was not found' using errcode = 'P0002';
  end if;
  if v_account.stripe_merchant_account_id is distinct from p_provider_account_id
     or v_account.merchant_livemode is distinct from p_expected_livemode then
    raise exception 'Stripe Merchant readiness evidence does not match the workspace mapping'
      using errcode = 'P0001';
  end if;

  -- Equal timestamps are not newer. A replay is a safe no-op, and a competing
  -- snapshot must bring strictly newer provider evidence to change readiness.
  if v_account.merchant_configuration_verified_at is not null
     and v_verified_at <= v_account.merchant_configuration_verified_at then
    return false;
  end if;

  update public.accounts a
     set merchant_onboarding_state = v_state,
         merchant_requirements_checked_at = v_requirements_checked_at,
         merchant_ready_at = v_ready_at,
         merchant_disabled_at = v_disabled_at,
         merchant_livemode = v_livemode,
         merchant_dashboard_type = v_dashboard,
         merchant_card_payments_active = v_card_active,
         merchant_us_bank_account_payments_active = v_ach_active,
         merchant_payouts_active = v_payouts_active,
         merchant_fees_collector = v_fees_collector,
         merchant_losses_collector = v_losses_collector,
         merchant_configuration_api_version = v_api_version,
         merchant_configuration_snapshot = v_snapshot,
         merchant_configuration_snapshot_sha256 = v_snapshot_sha256,
         merchant_configuration_verified_at = v_verified_at
   where a.id = p_workspace_id
     and a.stripe_merchant_account_id = p_provider_account_id
     and a.merchant_livemode = p_expected_livemode;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'Stripe Merchant workspace mapping changed during readiness persistence'
      using errcode = 'P0001';
  end if;

  return true;
end;
$$;

comment on function public.persist_stripe_merchant_readiness_evidence(uuid, text, boolean, jsonb)
  is 'Atomically persists only strictly newer Stripe Merchant readiness evidence for the exact workspace/account/livemode mapping.';

revoke all on function public.persist_stripe_merchant_readiness_evidence(uuid, text, boolean, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.persist_stripe_merchant_readiness_evidence(uuid, text, boolean, jsonb)
  to service_role;

commit;

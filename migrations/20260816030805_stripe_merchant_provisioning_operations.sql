-- Crash-safe, dark-launched orchestration for Stripe Accounts v2 Merchant creation.
--
-- An expired `claimed` row may be reclaimed because begin_submission has not
-- yet committed and Stripe has not been contacted. `submitted` and
-- `indeterminate` are explicit recovery states: neither may ever become a new
-- automatic create. Completion maps the provider account and closes the ledger
-- operation in one database transaction.

begin;

create table public.stripe_merchant_provisioning_operations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  workspace_id uuid not null unique
    references public.accounts(id) on update restrict on delete restrict,
  operation_type text not null default 'account.create'
    check (operation_type = 'account.create'),
  configuration_version text not null
    check (configuration_version = 'lgq.stripe-merchant.v1'),
  livemode boolean not null,
  stripe_idempotency_key text not null unique
    check (
      stripe_idempotency_key ~ '^lgq:merchant:v1:account[.]create:[0-9a-f]{64}$'
      and pg_catalog.length(stripe_idempotency_key) <= 255
    ),
  request_fingerprint text not null
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  state text not null
    check (state in ('claimed', 'submitted', 'succeeded', 'indeterminate')),
  claim_token uuid,
  lease_expires_at timestamptz,
  submission_started_at timestamptz,
  provider_account_id text unique
    check (
      provider_account_id is null
      or provider_account_id ~ '^acct_[A-Za-z0-9]{8,}$'
    ),
  provider_request_id text,
  provider_api_version text,
  provider_response_received_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text check (last_error is null or pg_catalog.length(last_error) <= 2000),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  constraint stripe_merchant_provisioning_state_shape_check check (
    (state = 'claimed'
      and claim_token is not null
      and lease_expires_at is not null
      and submission_started_at is null
      and provider_account_id is null
      and provider_response_received_at is null
      and completed_at is null)
    or (state = 'submitted'
      and claim_token is not null
      and lease_expires_at is null
      and submission_started_at is not null
      and provider_account_id is null
      and provider_response_received_at is null
      and completed_at is null)
    or (state = 'succeeded'
      and claim_token is null
      and lease_expires_at is null
      and submission_started_at is not null
      and provider_account_id is not null
      and provider_response_received_at is not null
      and completed_at is not null)
    or (state = 'indeterminate'
      and claim_token is null
      and lease_expires_at is null
      and submission_started_at is not null
      and completed_at is null)
  )
);

comment on table public.stripe_merchant_provisioning_operations is
  'Dark Accounts v2 Merchant create ledger. submitted/indeterminate rows require reconciliation and are never auto-reclaimed.';
comment on column public.stripe_merchant_provisioning_operations.request_fingerprint is
  'SHA-256 of the exact canonical Stripe create request. Immutable for the workspace create identity.';
comment on column public.stripe_merchant_provisioning_operations.provider_account_id is
  'Confirmed account on success, or an observed candidate on indeterminate recovery when Stripe returned one.';

create index stripe_merchant_provisioning_recovery_idx
  on public.stripe_merchant_provisioning_operations (state, updated_at)
  where state in ('submitted', 'indeterminate');

alter table public.stripe_merchant_provisioning_operations enable row level security;
revoke all on table public.stripe_merchant_provisioning_operations
  from public, anon, authenticated, service_role;

create or replace function public.protect_stripe_merchant_provisioning_operation()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Stripe Merchant provisioning operations are append-only records'
      using errcode = '22000';
  end if;

  if old.workspace_id is distinct from new.workspace_id
     or old.operation_type is distinct from new.operation_type
     or old.configuration_version is distinct from new.configuration_version
     or old.livemode is distinct from new.livemode
     or old.stripe_idempotency_key is distinct from new.stripe_idempotency_key
     or old.request_fingerprint is distinct from new.request_fingerprint
     or old.created_at is distinct from new.created_at then
    raise exception 'Stripe Merchant provisioning request identity is immutable'
      using errcode = '22000';
  end if;

  if old.provider_account_id is not null
     and old.provider_account_id is distinct from new.provider_account_id then
    raise exception 'Stripe Merchant provider account identity is immutable once observed'
      using errcode = '22000';
  end if;
  if new.attempt_count < old.attempt_count then
    raise exception 'Stripe Merchant provisioning attempt count cannot decrease'
      using errcode = '22000';
  end if;

  if old.state = 'claimed' and new.state = 'claimed' then
    if old.lease_expires_at is null or old.lease_expires_at > pg_catalog.now() then
      raise exception 'an active pre-submission Merchant claim cannot be replaced'
        using errcode = '55000';
    end if;
  elsif not (
    (old.state = 'claimed' and new.state = 'submitted')
    or (old.state = 'submitted' and new.state in ('succeeded', 'indeterminate'))
  ) then
    raise exception 'invalid Stripe Merchant provisioning state transition: % to %', old.state, new.state
      using errcode = '22000';
  end if;

  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists protect_stripe_merchant_provisioning_operation_trigger
  on public.stripe_merchant_provisioning_operations;
create trigger protect_stripe_merchant_provisioning_operation_trigger
before update or delete on public.stripe_merchant_provisioning_operations
for each row execute function public.protect_stripe_merchant_provisioning_operation();

revoke all on function public.protect_stripe_merchant_provisioning_operation()
  from public, anon, authenticated, service_role;

create or replace function public.claim_stripe_merchant_provisioning_operation(
  p_workspace_id uuid,
  p_livemode boolean,
  p_stripe_idempotency_key text,
  p_request_fingerprint text
)
returns table (
  claim_status text,
  operation_pk uuid,
  claim_token uuid,
  operation_state text,
  provider_account_id text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_account public.accounts%rowtype;
  v_operation public.stripe_merchant_provisioning_operations%rowtype;
  v_claim_token uuid := pg_catalog.gen_random_uuid();
begin
  if p_workspace_id is null or p_livemode is null then
    raise exception 'workspace and Stripe livemode are required' using errcode = '22023';
  end if;
  if p_stripe_idempotency_key is null
     or p_stripe_idempotency_key !~ '^lgq:merchant:v1:account[.]create:[0-9a-f]{64}$'
     or pg_catalog.length(p_stripe_idempotency_key) > 255 then
    raise exception 'invalid Stripe Merchant idempotency key' using errcode = '22023';
  end if;
  if p_request_fingerprint is null
     or p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid Stripe Merchant request fingerprint' using errcode = '22023';
  end if;

  -- The workspace row is the per-tenant claim mutex, including first insert.
  select a.* into v_account
    from public.accounts a
   where a.id = p_workspace_id
   for update;
  if not found then
    raise exception 'workspace was not found' using errcode = 'P0002';
  end if;

  select o.* into v_operation
    from public.stripe_merchant_provisioning_operations o
   where o.workspace_id = p_workspace_id
   for update;

  if not found then
    if v_account.stripe_merchant_account_id is not null then
      raise exception 'workspace Merchant mapping predates its operation ledger and requires reconciliation'
        using errcode = 'P0001';
    end if;

    insert into public.stripe_merchant_provisioning_operations (
      workspace_id,
      configuration_version,
      livemode,
      stripe_idempotency_key,
      request_fingerprint,
      state,
      claim_token,
      lease_expires_at
    ) values (
      p_workspace_id,
      'lgq.stripe-merchant.v1',
      p_livemode,
      p_stripe_idempotency_key,
      p_request_fingerprint,
      'claimed',
      v_claim_token,
      pg_catalog.now() + interval '5 minutes'
    ) returning * into v_operation;

    return query select
      'claimed'::text,
      v_operation.id,
      v_operation.claim_token,
      v_operation.state,
      v_operation.provider_account_id;
    return;
  end if;

  if v_operation.configuration_version <> 'lgq.stripe-merchant.v1'
     or v_operation.operation_type <> 'account.create'
     or v_operation.livemode is distinct from p_livemode
     or v_operation.stripe_idempotency_key is distinct from p_stripe_idempotency_key
     or v_operation.request_fingerprint is distinct from p_request_fingerprint then
    raise exception 'workspace Merchant create was already claimed with different immutable input'
      using errcode = '22000';
  end if;

  if v_operation.state = 'succeeded' then
    if v_operation.provider_account_id is null
       or v_account.stripe_merchant_account_id is distinct from v_operation.provider_account_id
       or v_account.merchant_livemode is distinct from v_operation.livemode then
      raise exception 'succeeded Merchant operation is not reconciled to its workspace'
        using errcode = 'P0001';
    end if;
    return query select
      'replay'::text,
      v_operation.id,
      null::uuid,
      v_operation.state,
      v_operation.provider_account_id;
    return;
  end if;

  if v_account.stripe_merchant_account_id is not null then
    raise exception 'incomplete Merchant operation conflicts with an existing workspace mapping'
      using errcode = 'P0001';
  end if;

  if v_operation.state = 'claimed'
     and v_operation.lease_expires_at <= pg_catalog.now() then
    update public.stripe_merchant_provisioning_operations o
       set claim_token = v_claim_token,
           lease_expires_at = pg_catalog.now() + interval '5 minutes',
           last_error = null
     where o.id = v_operation.id
    returning * into v_operation;

    return query select
      'claimed'::text,
      v_operation.id,
      v_operation.claim_token,
      v_operation.state,
      v_operation.provider_account_id;
    return;
  end if;

  return query select
    case when v_operation.state = 'claimed' then 'in_progress' else v_operation.state end,
    v_operation.id,
    null::uuid,
    v_operation.state,
    v_operation.provider_account_id;
end;
$$;

create or replace function public.begin_stripe_merchant_provisioning_submission(
  p_operation_pk uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_hint public.stripe_merchant_provisioning_operations%rowtype;
  v_operation public.stripe_merchant_provisioning_operations%rowtype;
  v_account public.accounts%rowtype;
begin
  select o.* into v_hint
    from public.stripe_merchant_provisioning_operations o
   where o.id = p_operation_pk;
  if not found then
    raise exception 'Stripe Merchant provisioning operation was not found'
      using errcode = 'P0002';
  end if;

  -- Match claim/completion lock order: workspace first, operation second.
  select a.* into v_account
    from public.accounts a
   where a.id = v_hint.workspace_id
   for update;
  if not found or v_account.stripe_merchant_account_id is not null then
    raise exception 'Stripe Merchant workspace is no longer submit-ready'
      using errcode = '55000';
  end if;

  select o.* into v_operation
    from public.stripe_merchant_provisioning_operations o
   where o.id = p_operation_pk
   for update;

  if not found
     or v_operation.state <> 'claimed'
     or v_operation.claim_token is distinct from p_claim_token
     or v_operation.lease_expires_at is null
     or v_operation.lease_expires_at <= pg_catalog.now() then
    raise exception 'Stripe Merchant claim is not owned or has expired'
      using errcode = '55000';
  end if;

  -- Commit submitted before the process is permitted to call Stripe. A lost
  -- RPC response therefore blocks the provider call and requires recovery.
  update public.stripe_merchant_provisioning_operations o
     set state = 'submitted',
         lease_expires_at = null,
         submission_started_at = pg_catalog.now(),
         attempt_count = o.attempt_count + 1,
         last_error = null
   where o.id = p_operation_pk;

  return true;
end;
$$;

create or replace function public.complete_stripe_merchant_provisioning_operation(
  p_operation_pk uuid,
  p_claim_token uuid,
  p_provider_account_id text,
  p_evidence jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_hint public.stripe_merchant_provisioning_operations%rowtype;
  v_operation public.stripe_merchant_provisioning_operations%rowtype;
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
  v_provider_request_id text;
begin
  if p_provider_account_id is null
     or p_provider_account_id !~ '^acct_[A-Za-z0-9]{8,}$'
     or pg_catalog.length(p_provider_account_id) > 255 then
    raise exception 'invalid Stripe Merchant account ID' using errcode = '22023';
  end if;
  if p_evidence is null or pg_catalog.jsonb_typeof(p_evidence) <> 'object' then
    raise exception 'Stripe Merchant readiness evidence must be a JSON object'
      using errcode = '22023';
  end if;

  v_state := p_evidence ->> 'merchant_onboarding_state';
  v_verified_at := (p_evidence ->> 'merchant_configuration_verified_at')::timestamptz;
  v_requirements_checked_at := (p_evidence ->> 'merchant_requirements_checked_at')::timestamptz;
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
  v_provider_request_id := nullif(v_snapshot #>> '{stripe_response,request_id}', '');

  if v_state is null
     or v_state not in ('pending', 'restricted', 'ready', 'disabled')
     or v_verified_at is null
     or v_requirements_checked_at is null
     or v_requirements_checked_at is distinct from v_verified_at
     or v_livemode is null
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
     or (v_snapshot ->> 'livemode')::boolean is distinct from v_livemode
     or nullif(v_snapshot #>> '{stripe_response,api_version}', '')
        is distinct from v_api_version then
    raise exception 'Stripe Merchant readiness evidence is incomplete or inconsistent'
      using errcode = '22023';
  end if;
  if (v_state = 'ready' and (v_ready_at is distinct from v_verified_at or v_disabled_at is not null))
     or (v_state = 'disabled' and (v_disabled_at is distinct from v_verified_at or v_ready_at is not null))
     or (v_state in ('pending', 'restricted') and (v_ready_at is not null or v_disabled_at is not null)) then
    raise exception 'Stripe Merchant readiness timestamps do not match onboarding state'
      using errcode = '22023';
  end if;

  select o.* into v_hint
    from public.stripe_merchant_provisioning_operations o
   where o.id = p_operation_pk;
  if not found then
    raise exception 'Stripe Merchant provisioning operation was not found'
      using errcode = 'P0002';
  end if;

  -- Lock workspace before operation everywhere to prevent a claim/completion
  -- deadlock and derive tenant identity only from the immutable operation.
  select a.* into v_account
    from public.accounts a
   where a.id = v_hint.workspace_id
   for update;
  if not found then
    raise exception 'Stripe Merchant workspace was not found' using errcode = 'P0002';
  end if;

  select o.* into v_operation
    from public.stripe_merchant_provisioning_operations o
   where o.id = p_operation_pk
   for update;

  if v_operation.state = 'succeeded'
     and v_operation.provider_account_id = p_provider_account_id
     and v_account.stripe_merchant_account_id = p_provider_account_id then
    return true;
  end if;
  if v_operation.state <> 'submitted'
     or v_operation.claim_token is distinct from p_claim_token then
    raise exception 'Stripe Merchant submission is not owned by this claim'
      using errcode = '55000';
  end if;
  if v_operation.workspace_id is distinct from v_hint.workspace_id
     or v_operation.livemode is distinct from v_livemode
     or v_account.stripe_merchant_account_id is not null then
    raise exception 'Stripe Merchant provider result does not match its workspace operation'
      using errcode = 'P0001';
  end if;

  -- There is deliberately no workspace parameter: tenant identity comes from
  -- the claim-token operation row. Mapping and provider completion commit or
  -- roll back together in this one transaction.
  update public.accounts a
     set stripe_merchant_account_id = p_provider_account_id,
         merchant_onboarding_state = v_state,
         merchant_onboarding_started_at = coalesce(a.merchant_onboarding_started_at, v_verified_at),
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
   where a.id = v_operation.workspace_id;

  update public.stripe_merchant_provisioning_operations o
     set state = 'succeeded',
         claim_token = null,
         provider_account_id = p_provider_account_id,
         provider_request_id = v_provider_request_id,
         provider_api_version = v_api_version,
         provider_response_received_at = v_verified_at,
         completed_at = pg_catalog.now(),
         last_error = null
   where o.id = p_operation_pk;

  return true;
end;
$$;

create or replace function public.mark_stripe_merchant_provisioning_indeterminate(
  p_operation_pk uuid,
  p_claim_token uuid,
  p_provider_account_id text,
  p_last_error text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_operation public.stripe_merchant_provisioning_operations%rowtype;
begin
  if p_provider_account_id is not null
     and (
       p_provider_account_id !~ '^acct_[A-Za-z0-9]{8,}$'
       or pg_catalog.length(p_provider_account_id) > 255
     ) then
    raise exception 'invalid observed Stripe Merchant account ID' using errcode = '22023';
  end if;

  select o.* into v_operation
    from public.stripe_merchant_provisioning_operations o
   where o.id = p_operation_pk
   for update;

  if not found
     or v_operation.state <> 'submitted'
     or v_operation.claim_token is distinct from p_claim_token then
    raise exception 'Stripe Merchant submission is not owned by this claim'
      using errcode = '55000';
  end if;

  update public.stripe_merchant_provisioning_operations o
     set state = 'indeterminate',
         claim_token = null,
         provider_account_id = p_provider_account_id,
         provider_response_received_at = case
           when p_provider_account_id is null then null
           else pg_catalog.now()
         end,
         last_error = pg_catalog.left(
           coalesce(nullif(pg_catalog.btrim(p_last_error), ''),
             'Stripe Merchant submission outcome requires reconciliation'),
           2000
         )
   where o.id = p_operation_pk;

  return true;
end;
$$;

-- No role receives direct table access. The service role gets only the four
-- compare-and-set RPCs that enforce claim ownership and tenant binding.
revoke all on function public.claim_stripe_merchant_provisioning_operation(
  uuid, boolean, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.begin_stripe_merchant_provisioning_submission(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_stripe_merchant_provisioning_operation(
  uuid, uuid, text, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.mark_stripe_merchant_provisioning_indeterminate(
  uuid, uuid, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.claim_stripe_merchant_provisioning_operation(
  uuid, boolean, text, text
) to service_role;
grant execute on function public.begin_stripe_merchant_provisioning_submission(uuid, uuid)
  to service_role;
grant execute on function public.complete_stripe_merchant_provisioning_operation(
  uuid, uuid, text, jsonb
) to service_role;
grant execute on function public.mark_stripe_merchant_provisioning_indeterminate(
  uuid, uuid, text, text
) to service_role;

commit;

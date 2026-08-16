-- Crash-safe, dark-launched orchestration for one-off direct Checkout Sessions.
--
-- The application may reclaim an expired `claimed` row because Stripe has not
-- been contacted yet. Once a row reaches `submitted`, this migration never
-- automatically retries it: a process can die on either side of the provider
-- response, and Stripe's finite idempotency window is not durable proof that a
-- second create is safe.

begin;

alter table public.billing_payment_operations
  add column if not exists claim_token uuid,
  add column if not exists submission_started_at timestamptz;

do $$
begin
  if exists (
    select 1
      from public.billing_payment_operations
     where operation_type = 'checkout_session.create'
       and state in ('claimed', 'submitted')
       and claim_token is null
  ) then
    raise exception 'existing direct Checkout operations require an explicit claim-token backfill';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.billing_payment_operations'::pg_catalog.regclass
       and conname = 'billing_payment_operations_checkout_claim_check'
  ) then
    alter table public.billing_payment_operations
      add constraint billing_payment_operations_checkout_claim_check
      check (
        operation_type <> 'checkout_session.create'
        or (
          (state = 'claimed'
            and claim_token is not null
            and lease_expires_at is not null
            and submission_started_at is null
            and provider_object_id is null)
          or (state = 'submitted'
            and claim_token is not null
            and lease_expires_at is null
            and submission_started_at is not null
            and provider_object_id is null)
          or (state = 'succeeded'
            and claim_token is null
            and lease_expires_at is null
            and submission_started_at is not null
            and provider_object_id is not null)
          or (state = 'indeterminate'
            and claim_token is null
            and lease_expires_at is null
            and submission_started_at is not null)
          or (state = 'failed'
            and claim_token is null
            and lease_expires_at is null)
        )
      );
  end if;
end
$$;

-- A payment gets one durable Checkout-create identity. A caller cannot evade a
-- prior submitted/indeterminate operation by choosing a fresh operation ID.
create unique index if not exists billing_payment_operations_one_checkout_per_payment
  on public.billing_payment_operations (payment_id)
  where operation_type = 'checkout_session.create';

-- The orchestration completion RPC assigns the Checkout Session once. Preserve
-- that provider identity even from accidental service-role table writes.
create or replace function public.protect_direct_checkout_session_identity()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if old.charge_model = 'direct'
     and old.stripe_checkout_session is not null
     and old.stripe_checkout_session is distinct from new.stripe_checkout_session then
    raise exception 'direct payment Checkout Session is immutable once assigned' using errcode = '22000';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_direct_checkout_session_identity_trigger on public.payments;
create trigger protect_direct_checkout_session_identity_trigger
before update of stripe_checkout_session on public.payments
for each row execute function public.protect_direct_checkout_session_identity();

revoke all on function public.protect_direct_checkout_session_identity()
  from public, anon, authenticated, service_role;

create or replace function public.claim_one_off_direct_checkout_operation(
  p_account_id uuid,
  p_payment_id uuid,
  p_stripe_account_id text,
  p_livemode boolean,
  p_operation_id text,
  p_stripe_idempotency_key text,
  p_request_fingerprint text,
  p_gross_amount_cents bigint,
  p_fee_basis_amount_cents bigint,
  p_application_fee_cents bigint,
  p_fee_plan_code text,
  p_fee_catalog_version text,
  p_fee_rate_bps integer,
  p_fee_rate numeric
)
returns table (
  claim_status text,
  operation_pk uuid,
  claim_token uuid,
  operation_state text,
  provider_object_id text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_operation public.billing_payment_operations%rowtype;
  v_payment public.payments%rowtype;
  v_claim_token uuid := pg_catalog.gen_random_uuid();
begin
  if p_stripe_account_id is null
     or p_stripe_account_id !~ '^acct_[A-Za-z0-9]{8,}$' then
    raise exception 'invalid Stripe Merchant account ID' using errcode = '22023';
  end if;
  if p_livemode is null then
    raise exception 'Stripe livemode is required' using errcode = '22023';
  end if;
  if p_operation_id is null
     or pg_catalog.length(pg_catalog.btrim(p_operation_id)) not between 1 and 200 then
    raise exception 'operation ID must contain between 1 and 200 characters' using errcode = '22023';
  end if;
  if p_stripe_idempotency_key is null
     or p_stripe_idempotency_key !~ '^lgq:direct:v1:checkout_session[.]create:[0-9a-f]{64}$' then
    raise exception 'invalid direct Checkout idempotency key' using errcode = '22023';
  end if;
  if p_request_fingerprint is null
     or p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid direct Checkout request fingerprint' using errcode = '22023';
  end if;
  if p_gross_amount_cents is null or p_gross_amount_cents <= 0
     or p_fee_basis_amount_cents is null or p_fee_basis_amount_cents < 0
     or p_fee_basis_amount_cents > p_gross_amount_cents
     or p_application_fee_cents is null or p_application_fee_cents < 0
     or p_application_fee_cents > p_fee_basis_amount_cents
     or p_fee_rate_bps is null or p_fee_rate_bps not between 0 and 10000
     or p_fee_rate is null or p_fee_rate <> p_fee_rate_bps::numeric / 10000 then
    raise exception 'invalid direct Checkout fee snapshot' using errcode = '22023';
  end if;
  if p_fee_plan_code is null
     or p_fee_plan_code not in ('flex', 'solo', 'growth', 'scale', 'enterprise')
     or p_fee_catalog_version is null
     or pg_catalog.length(pg_catalog.btrim(p_fee_catalog_version)) = 0 then
    raise exception 'direct Checkout fee plan snapshot is incomplete' using errcode = '22023';
  end if;

  -- Consistent lock order for every orchestration RPC: account, payment, then
  -- operation. The account lock also prevents readiness from changing between
  -- this check and the durable claim.
  perform 1
    from public.accounts a
   where a.id = p_account_id
     and a.stripe_merchant_account_id = p_stripe_account_id
     and a.merchant_livemode = p_livemode
     and a.merchant_onboarding_state = 'ready'
     and a.merchant_disabled_at is null
     and a.merchant_dashboard_type = 'full'
     and a.merchant_card_payments_active
     and a.merchant_payouts_active
     and a.merchant_fees_collector = 'stripe'
     and a.merchant_losses_collector = 'stripe'
     and a.merchant_configuration_api_version is not null
     and pg_catalog.length(pg_catalog.btrim(a.merchant_configuration_api_version)) > 0
     and a.merchant_configuration_snapshot is not null
     and pg_catalog.jsonb_typeof(a.merchant_configuration_snapshot) = 'object'
     and a.merchant_configuration_snapshot_sha256 ~ '^[0-9a-f]{64}$'
     and a.merchant_configuration_verified_at >= pg_catalog.now() - interval '24 hours'
   for share;
  if not found then
    raise exception 'direct Checkout requires a recently verified, ready Stripe Merchant account'
      using errcode = '55000';
  end if;

  select p.*
    into v_payment
    from public.payments p
   where p.id = p_payment_id
     and p.account_id = p_account_id
   for update;
  if not found then
    raise exception 'direct Checkout payment was not found in the requested account'
      using errcode = 'P0002';
  end if;

  if v_payment.charge_model <> 'direct'
     or v_payment.stripe_account_id is distinct from p_stripe_account_id
     or v_payment.stripe_livemode is distinct from p_livemode
     or v_payment.amount is distinct from p_gross_amount_cents::numeric / 100
     or v_payment.fee_basis_amount is distinct from p_fee_basis_amount_cents::numeric / 100
     or v_payment.platform_fee is distinct from p_application_fee_cents::numeric / 100
     or v_payment.fee_plan_code is distinct from p_fee_plan_code
     or v_payment.fee_catalog_version is distinct from p_fee_catalog_version
     or v_payment.fee_rate_bps is distinct from p_fee_rate_bps
     or v_payment.fee_rate is distinct from p_fee_rate then
    raise exception 'direct Checkout input does not exactly match the immutable payment fee snapshot'
      using errcode = '22000';
  end if;

  select o.*
    into v_operation
    from public.billing_payment_operations o
   where o.payment_id = p_payment_id
     and o.operation_type = 'checkout_session.create'
   for update;

  if not found then
    if v_payment.status::text <> 'requested'
       or v_payment.stripe_checkout_session is not null then
      raise exception 'direct Checkout can only be claimed for an unsubmitted requested payment'
        using errcode = '55000';
    end if;

    insert into public.billing_payment_operations (
      account_id,
      payment_id,
      operation_type,
      operation_id,
      charge_model,
      stripe_account_id,
      livemode,
      stripe_idempotency_key,
      request_fingerprint,
      state,
      attempt_count,
      claim_token,
      lease_expires_at,
      metadata
    ) values (
      p_account_id,
      p_payment_id,
      'checkout_session.create',
      pg_catalog.btrim(p_operation_id),
      'direct',
      p_stripe_account_id,
      p_livemode,
      p_stripe_idempotency_key,
      p_request_fingerprint,
      'claimed',
      0,
      v_claim_token,
      pg_catalog.now() + interval '5 minutes',
      pg_catalog.jsonb_build_object(
        'schema', 'one_off_direct_checkout_v1',
        'fee_snapshot', pg_catalog.jsonb_build_object(
          'plan_code', p_fee_plan_code,
          'catalog_version', p_fee_catalog_version,
          'fee_rate_bps', p_fee_rate_bps,
          'fee_rate', p_fee_rate,
          'gross_amount_cents', p_gross_amount_cents,
          'eligible_service_subtotal_cents', p_fee_basis_amount_cents,
          'application_fee_cents', p_application_fee_cents
        )
      )
    )
    on conflict do nothing
    returning * into v_operation;

    if found then
      return query select
        'claimed'::text,
        v_operation.id,
        v_operation.claim_token,
        v_operation.state,
        v_operation.provider_object_id;
      return;
    end if;

    -- A conflicting business key can point at a different payment. Read it so
    -- the comparison below returns an immutable-input conflict, never a blind
    -- unique-violation retry loop.
    select o.*
      into v_operation
      from public.billing_payment_operations o
     where o.account_id = p_account_id
       and o.operation_type = 'checkout_session.create'
       and o.operation_id = pg_catalog.btrim(p_operation_id)
     for update;
    if not found then
      raise exception 'direct Checkout claim conflict could not be resolved safely'
        using errcode = '40001';
    end if;
  end if;

  if v_operation.account_id is distinct from p_account_id
     or v_operation.payment_id is distinct from p_payment_id
     or v_operation.operation_id is distinct from pg_catalog.btrim(p_operation_id)
     or v_operation.charge_model <> 'direct'
     or v_operation.stripe_account_id is distinct from p_stripe_account_id
     or v_operation.livemode is distinct from p_livemode
     or v_operation.stripe_idempotency_key is distinct from p_stripe_idempotency_key
     or v_operation.request_fingerprint is distinct from p_request_fingerprint then
    raise exception 'operation ID was already claimed with different immutable input'
      using errcode = '22000';
  end if;

  if v_operation.state = 'succeeded' then
    if v_operation.provider_object_id is null
       or v_payment.stripe_checkout_session is distinct from v_operation.provider_object_id then
      raise exception 'succeeded direct Checkout operation is not reconciled to its payment'
        using errcode = 'P0001';
    end if;
    return query select
      'replay'::text,
      v_operation.id,
      null::uuid,
      v_operation.state,
      v_operation.provider_object_id;
    return;
  end if;

  if v_operation.state = 'claimed'
     and v_operation.lease_expires_at <= pg_catalog.now() then
    update public.billing_payment_operations o
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
      v_operation.provider_object_id;
    return;
  end if;

  return query select
    case when v_operation.state = 'claimed' then 'in_progress' else v_operation.state end,
    v_operation.id,
    null::uuid,
    v_operation.state,
    v_operation.provider_object_id;
end;
$$;

create or replace function public.begin_one_off_direct_checkout_submission(
  p_operation_pk uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_hint public.billing_payment_operations%rowtype;
  v_operation public.billing_payment_operations%rowtype;
  v_payment public.payments%rowtype;
begin
  select o.* into v_hint
    from public.billing_payment_operations o
   where o.id = p_operation_pk;
  if not found or v_hint.operation_type <> 'checkout_session.create' then
    raise exception 'direct Checkout operation was not found' using errcode = 'P0002';
  end if;

  perform 1
    from public.accounts a
   where a.id = v_hint.account_id
     and a.stripe_merchant_account_id = v_hint.stripe_account_id
     and a.merchant_livemode = v_hint.livemode
     and a.merchant_onboarding_state = 'ready'
     and a.merchant_disabled_at is null
     and a.merchant_dashboard_type = 'full'
     and a.merchant_card_payments_active
     and a.merchant_payouts_active
     and a.merchant_fees_collector = 'stripe'
     and a.merchant_losses_collector = 'stripe'
     and a.merchant_configuration_api_version is not null
     and pg_catalog.length(pg_catalog.btrim(a.merchant_configuration_api_version)) > 0
     and a.merchant_configuration_snapshot is not null
     and pg_catalog.jsonb_typeof(a.merchant_configuration_snapshot) = 'object'
     and a.merchant_configuration_snapshot_sha256 ~ '^[0-9a-f]{64}$'
     and a.merchant_configuration_verified_at >= pg_catalog.now() - interval '24 hours'
   for share;
  if not found then
    raise exception 'Stripe Merchant readiness changed before Checkout submission'
      using errcode = '55000';
  end if;

  select p.* into v_payment
    from public.payments p
   where p.id = v_hint.payment_id
     and p.account_id = v_hint.account_id
     and p.stripe_account_id = v_hint.stripe_account_id
     and p.stripe_livemode = v_hint.livemode
     and p.charge_model = 'direct'
   for share;
  if not found
     or v_payment.status::text <> 'requested'
     or v_payment.stripe_checkout_session is not null then
    raise exception 'direct Checkout payment is no longer submit-ready' using errcode = '55000';
  end if;

  select o.* into v_operation
    from public.billing_payment_operations o
   where o.id = p_operation_pk
   for update;

  if v_operation.state <> 'claimed'
     or v_operation.claim_token is distinct from p_claim_token
     or v_operation.lease_expires_at is null
     or v_operation.lease_expires_at <= pg_catalog.now() then
    raise exception 'direct Checkout claim is not owned or has expired' using errcode = '55000';
  end if;

  update public.billing_payment_operations o
     set state = 'submitted',
         submission_started_at = pg_catalog.now(),
         lease_expires_at = null,
         attempt_count = o.attempt_count + 1,
         last_error = null
   where o.id = p_operation_pk;

  return true;
end;
$$;

create or replace function public.complete_one_off_direct_checkout_operation(
  p_operation_pk uuid,
  p_claim_token uuid,
  p_checkout_session_id text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_hint public.billing_payment_operations%rowtype;
  v_operation public.billing_payment_operations%rowtype;
  v_payment public.payments%rowtype;
begin
  if p_checkout_session_id is null
     or p_checkout_session_id !~ '^cs_[A-Za-z0-9_]+$'
     or pg_catalog.length(p_checkout_session_id) > 255 then
    raise exception 'invalid Stripe Checkout Session ID' using errcode = '22023';
  end if;

  select o.* into v_hint
    from public.billing_payment_operations o
   where o.id = p_operation_pk;
  if not found or v_hint.operation_type <> 'checkout_session.create' then
    raise exception 'direct Checkout operation was not found' using errcode = 'P0002';
  end if;

  perform 1 from public.accounts a where a.id = v_hint.account_id for share;

  select p.* into v_payment
    from public.payments p
   where p.id = v_hint.payment_id
   for update;
  if not found then
    raise exception 'direct Checkout payment was not found' using errcode = 'P0002';
  end if;

  select o.* into v_operation
    from public.billing_payment_operations o
   where o.id = p_operation_pk
   for update;

  if v_operation.state <> 'submitted'
     or v_operation.claim_token is distinct from p_claim_token then
    raise exception 'direct Checkout submission is not owned by this claim'
      using errcode = '55000';
  end if;
  if v_payment.account_id is distinct from v_operation.account_id
     or v_payment.stripe_account_id is distinct from v_operation.stripe_account_id
     or v_payment.stripe_livemode is distinct from v_operation.livemode
     or v_payment.charge_model <> 'direct'
     or v_payment.status::text not in ('requested', 'processing')
     or (
       v_payment.stripe_checkout_session is not null
       and v_payment.stripe_checkout_session is distinct from p_checkout_session_id
     ) then
    raise exception 'direct Checkout provider result does not match its payment'
      using errcode = 'P0001';
  end if;

  update public.payments p
     set stripe_checkout_session = p_checkout_session_id,
         status = 'processing'
   where p.id = v_operation.payment_id;

  update public.billing_payment_operations o
     set state = 'succeeded',
         provider_object_id = p_checkout_session_id,
         completed_at = pg_catalog.now(),
         claim_token = null,
         lease_expires_at = null,
         last_error = null
   where o.id = p_operation_pk;

  return true;
end;
$$;

create or replace function public.mark_one_off_direct_checkout_indeterminate(
  p_operation_pk uuid,
  p_claim_token uuid,
  p_last_error text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_operation public.billing_payment_operations%rowtype;
begin
  select o.* into v_operation
    from public.billing_payment_operations o
   where o.id = p_operation_pk
   for update;

  if not found
     or v_operation.operation_type <> 'checkout_session.create'
     or v_operation.state <> 'submitted'
     or v_operation.claim_token is distinct from p_claim_token then
    raise exception 'direct Checkout submission is not owned by this claim'
      using errcode = '55000';
  end if;

  update public.billing_payment_operations o
     set state = 'indeterminate',
         claim_token = null,
         lease_expires_at = null,
         last_error = pg_catalog.left(
           coalesce(nullif(pg_catalog.btrim(p_last_error), ''),
             'Stripe submission outcome is unknown'),
           2000
         )
   where o.id = p_operation_pk;

  return true;
end;
$$;

-- The service role may inspect the ledger but may mutate it only through the
-- claim-token RPCs above. This makes their compare-and-set rules a database
-- boundary, not an application convention.
revoke all on table public.billing_payment_operations from service_role;
grant select on table public.billing_payment_operations to service_role;

revoke all on function public.claim_one_off_direct_checkout_operation(
  uuid, uuid, text, boolean, text, text, text, bigint, bigint, bigint,
  text, text, integer, numeric
) from public, anon, authenticated, service_role;
revoke all on function public.begin_one_off_direct_checkout_submission(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_one_off_direct_checkout_operation(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.mark_one_off_direct_checkout_indeterminate(uuid, uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function public.claim_one_off_direct_checkout_operation(
  uuid, uuid, text, boolean, text, text, text, bigint, bigint, bigint,
  text, text, integer, numeric
) to service_role;
grant execute on function public.begin_one_off_direct_checkout_submission(uuid, uuid)
  to service_role;
grant execute on function public.complete_one_off_direct_checkout_operation(uuid, uuid, text)
  to service_role;
grant execute on function public.mark_one_off_direct_checkout_indeterminate(uuid, uuid, text)
  to service_role;

commit;

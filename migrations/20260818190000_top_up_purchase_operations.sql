-- Claim one top-up purchase intent exactly once, before Stripe is asked.
--
-- WHY THIS TABLE EXISTS. Without a durable claim, a double-submitted form
-- creates two Checkout Sessions for one intent. The projector is idempotent per
-- SESSION, not per intent, so paying both would grant twice and charge twice --
-- correctly, by its own rules, which is the worst kind of wrong.
--
-- WHY NOT billing_payment_operations. That ledger requires payment_id NOT NULL
-- against public.payments, charge_model = 'direct', and a connected
-- stripe_account_id matching '^acct_'. A top-up is bought on the PLATFORM
-- account with no connected account and no payments row, so it satisfies none of
-- the three. Relaxing them would weaken the guarantees the contractor rail
-- depends on. billing_subscription_checkout_operations exists for exactly this
-- reason -- a platform checkout needs its own ledger -- and this mirrors it.
--
-- WHAT IT DELIBERATELY DOES NOT DO. It stops at checkout_created. What happens
-- to the money afterwards belongs to the projector, which keys on the Checkout
-- Session and owns the grant. Two ledgers competing to decide whether credit was
-- granted is how they disagree.
--
-- THE AMOUNT IS BOUND TO THE CATALOG. A row cannot record a price the published
-- catalog does not carry, the same way the subscription ledger pins its six plan
-- amounts. All eight SKUs are listed, not the five sellable ones: the price book
-- is published and settled, and which of them may be SOLD is the application's
-- decision (TOP_UPS_WITHHELD), not a shape the database should have to be
-- migrated to change.

begin;

create table public.billing_top_up_purchase_operations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,
  operation_id text not null check (
    pg_catalog.length(pg_catalog.btrim(operation_id)) between 1 and 200
    and operation_id !~ '[[:cntrl:]]'
    and operation_id = pg_catalog.btrim(operation_id)
  ),
  purpose text not null default 'top_up_purchase'
    check (purpose = 'top_up_purchase'),
  top_up_id text not null check (
    top_up_id in (
      'flex_text_250', 'text_1000', 'marketing_email_5000', 'ai_intake_100',
      'ai_writing_250', 'storage_100gb', 'office_user', 'crew_user'
    )
  ),
  resource_code text not null check (resource_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  units bigint not null check (units > 0),
  catalog_version text not null check (catalog_version = '2026-08-18-preview'),
  livemode boolean not null,
  stripe_price_id text not null check (
    stripe_price_id ~ '^price_[A-Za-z0-9]{8,}$'
    and pg_catalog.length(stripe_price_id) <= 255
  ),
  stripe_product_id text not null check (
    stripe_product_id ~ '^prod_[A-Za-z0-9]{8,}$'
    and pg_catalog.length(stripe_product_id) <= 255
  ),
  currency text not null default 'usd' check (currency = 'usd'),
  unit_amount_cents bigint not null check (unit_amount_cents > 0),
  stripe_idempotency_key text not null check (
    stripe_idempotency_key ~ '^lgq:billing:v1:top_up_purchase[.]create:[0-9a-f]{64}$'
    and pg_catalog.length(stripe_idempotency_key) <= 255
  ),
  request_fingerprint text check (
    request_fingerprint is null or request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  state text not null default 'claimed'
    check (state in ('claimed', 'submitted', 'checkout_created', 'indeterminate', 'failed')),
  claim_token uuid,
  lease_expires_at timestamptz,
  submission_started_at timestamptz,
  provider_object_id text,
  checkout_created_at timestamptz,
  resolved_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text check (last_error is null or last_error ~ '^[a-z][a-z0-9_]{2,63}$'),
  metadata jsonb not null default '{}'::jsonb
    check (pg_catalog.jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),

  -- One Session per client intent. This is the constraint that makes a
  -- double-submitted form idempotent rather than expensive.
  constraint billing_top_up_purchase_business_key_unique
    unique (account_id, operation_id),
  constraint billing_top_up_purchase_idempotency_key_unique
    unique (livemode, stripe_idempotency_key),
  constraint billing_top_up_purchase_provider_object_unique
    unique (livemode, provider_object_id),

  -- The published price book, so a row cannot record an amount the catalog does
  -- not carry. Changing a customer-visible price is a migration on purpose.
  constraint billing_top_up_purchase_catalog_binding_check check (
    (top_up_id = 'flex_text_250' and resource_code = 'text_segments'
      and units = 250 and unit_amount_cents = 1200)
    or (top_up_id = 'text_1000' and resource_code = 'text_segments'
      and units = 1000 and unit_amount_cents = 4200)
    or (top_up_id = 'marketing_email_5000' and resource_code = 'marketing_email_sends'
      and units = 5000 and unit_amount_cents = 1700)
    or (top_up_id = 'ai_intake_100' and resource_code = 'ai_intake_threads'
      and units = 100 and unit_amount_cents = 1500)
    or (top_up_id = 'ai_writing_250' and resource_code = 'ai_writing_drafts'
      and units = 250 and unit_amount_cents = 1900)
    or (top_up_id = 'storage_100gb' and resource_code = 'storage_gb'
      and units = 100 and unit_amount_cents = 1500)
    or (top_up_id = 'office_user' and resource_code = 'office_users'
      and units = 1 and unit_amount_cents = 1500)
    or (top_up_id = 'crew_user' and resource_code = 'crew_users'
      and units = 1 and unit_amount_cents = 500)
  ),

  constraint billing_top_up_purchase_provider_mode_check check (
    provider_object_id is null
    or (
      pg_catalog.length(provider_object_id) <= 255
      and (
        (livemode and provider_object_id ~ '^cs_live_[A-Za-z0-9_]+$')
        or (not livemode and provider_object_id ~ '^cs_test_[A-Za-z0-9_]+$')
      )
    )
  ),

  -- Each state carries exactly the evidence it has earned, and no more. This is
  -- what makes "we asked Stripe and never heard back" a distinguishable state
  -- rather than something inferred later from a missing row.
  constraint billing_top_up_purchase_state_shape_check check (
    (
      state = 'claimed'
      and claim_token is not null
      and lease_expires_at is not null
      and submission_started_at is null
      and request_fingerprint is null
      and provider_object_id is null
      and checkout_created_at is null
      and resolved_at is null
      and last_error is null
    )
    or (
      state = 'submitted'
      and claim_token is not null
      and lease_expires_at is not null
      and submission_started_at is not null
      and request_fingerprint is not null
      and provider_object_id is null
      and checkout_created_at is null
      and resolved_at is null
      and last_error is null
    )
    or (
      state = 'checkout_created'
      and claim_token is null
      and lease_expires_at is null
      and submission_started_at is not null
      and request_fingerprint is not null
      and provider_object_id is not null
      and checkout_created_at is not null
      and resolved_at is not null
      and last_error is null
    )
    or (
      state = 'indeterminate'
      and claim_token is not null
      and submission_started_at is not null
      and request_fingerprint is not null
      and provider_object_id is null
      and checkout_created_at is null
      and resolved_at is null
      and last_error is not null
    )
    or (
      state = 'failed'
      and claim_token is null
      and lease_expires_at is null
      and provider_object_id is null
      and checkout_created_at is null
      and resolved_at is not null
      and last_error is not null
    )
  )
);

create index billing_top_up_purchase_account_created_idx
  on public.billing_top_up_purchase_operations (account_id, created_at desc);
create index billing_top_up_purchase_recovery_idx
  on public.billing_top_up_purchase_operations (state, lease_expires_at, created_at)
  where state in ('claimed', 'submitted', 'indeterminate');

alter table public.billing_top_up_purchase_operations enable row level security;
-- No policy: this ledger is service-role only. `authenticated` reads nothing.

-- Append-only in the ways that matter, and one legal path through the states.
create or replace function public.protect_billing_top_up_purchase_operation()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'top-up purchase operations cannot be deleted' using errcode = '42501';
  end if;

  if old.account_id is distinct from new.account_id
     or old.operation_id is distinct from new.operation_id
     or old.purpose is distinct from new.purpose
     or old.top_up_id is distinct from new.top_up_id
     or old.resource_code is distinct from new.resource_code
     or old.units is distinct from new.units
     or old.catalog_version is distinct from new.catalog_version
     or old.livemode is distinct from new.livemode
     or old.stripe_price_id is distinct from new.stripe_price_id
     or old.stripe_product_id is distinct from new.stripe_product_id
     or old.currency is distinct from new.currency
     or old.unit_amount_cents is distinct from new.unit_amount_cents
     or old.stripe_idempotency_key is distinct from new.stripe_idempotency_key
     or old.created_at is distinct from new.created_at then
    raise exception 'top-up purchase operation identity is immutable' using errcode = '22000';
  end if;

  if old.provider_object_id is not null
     and old.provider_object_id is distinct from new.provider_object_id then
    raise exception 'top-up purchase Checkout Session is immutable once recorded'
      using errcode = '22000';
  end if;

  if new.attempt_count < old.attempt_count then
    raise exception 'top-up purchase attempt count cannot decrease' using errcode = '22000';
  end if;

  if new.state is distinct from old.state and not (
    (old.state = 'claimed' and new.state in ('submitted', 'failed'))
    or (old.state = 'submitted' and new.state in ('checkout_created', 'failed', 'indeterminate'))
    or (old.state = 'indeterminate' and new.state in ('checkout_created', 'failed'))
  ) then
    raise exception 'invalid top-up purchase operation state transition: % -> %',
      old.state, new.state using errcode = '22000';
  end if;

  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists protect_billing_top_up_purchase_operation_update_trigger
  on public.billing_top_up_purchase_operations;
create trigger protect_billing_top_up_purchase_operation_update_trigger
before update on public.billing_top_up_purchase_operations
for each row execute function public.protect_billing_top_up_purchase_operation();

drop trigger if exists protect_billing_top_up_purchase_operation_delete_trigger
  on public.billing_top_up_purchase_operations;
create trigger protect_billing_top_up_purchase_operation_delete_trigger
before delete on public.billing_top_up_purchase_operations
for each row execute function public.protect_billing_top_up_purchase_operation();

-- A trigger fires regardless of who may EXECUTE it, so revoking costs nothing
-- and stops the guard being callable as an ordinary function by a client role.
revoke all on function public.protect_billing_top_up_purchase_operation()
  from public, anon, authenticated;

-- Claim one intent. A repeat of the same business key does not insert again; it
-- reports what the first claim became, so a double submit can be answered with
-- the Session that already exists instead of a second one.
create or replace function public.claim_stripe_top_up_purchase(
  p_account_id uuid,
  p_operation_id text,
  p_top_up_id text,
  p_resource_code text,
  p_units bigint,
  p_catalog_version text,
  p_livemode boolean,
  p_stripe_price_id text,
  p_stripe_product_id text,
  p_unit_amount_cents bigint,
  p_stripe_idempotency_key text
)
returns table (
  claim_status text,
  operation_pk uuid,
  claim_token uuid,
  state text,
  provider_object_id text
)
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_existing public.billing_top_up_purchase_operations%rowtype;
  v_token uuid := pg_catalog.gen_random_uuid();
  v_row public.billing_top_up_purchase_operations%rowtype;
begin
  if p_account_id is null or p_operation_id is null or p_stripe_idempotency_key is null then
    raise exception 'top-up purchase claim input is invalid' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_account_id::text || ':top_up_purchase:' || p_operation_id, 0)
  );

  select o.* into v_existing
    from public.billing_top_up_purchase_operations o
   where o.account_id = p_account_id
     and o.operation_id = p_operation_id
   for update;

  if found then
    -- The same intent must mean the same purchase. Anything else is a different
    -- request wearing a reused id, and it must not silently adopt this row.
    if v_existing.top_up_id is distinct from p_top_up_id
       or v_existing.livemode is distinct from p_livemode
       or v_existing.unit_amount_cents is distinct from p_unit_amount_cents
       or v_existing.stripe_price_id is distinct from p_stripe_price_id then
      raise exception 'top-up purchase intent was reused with different purchase data'
        using errcode = '22000';
    end if;
    return query select
      'replayed'::text, v_existing.id, v_existing.claim_token,
      v_existing.state, v_existing.provider_object_id;
    return;
  end if;

  insert into public.billing_top_up_purchase_operations (
    account_id, operation_id, top_up_id, resource_code, units, catalog_version,
    livemode, stripe_price_id, stripe_product_id, unit_amount_cents,
    stripe_idempotency_key, state, claim_token, lease_expires_at
  ) values (
    p_account_id, p_operation_id, p_top_up_id, p_resource_code, p_units, p_catalog_version,
    p_livemode, p_stripe_price_id, p_stripe_product_id, p_unit_amount_cents,
    p_stripe_idempotency_key, 'claimed', v_token, pg_catalog.now() + interval '5 minutes'
  )
  returning * into v_row;

  return query select
    'claimed'::text, v_row.id, v_row.claim_token, v_row.state, v_row.provider_object_id;
end;
$$;

-- Record that Stripe is about to be asked, BEFORE asking. This is the only
-- reason a crash mid-call is distinguishable from never having tried.
create or replace function public.begin_stripe_top_up_purchase_submission(
  p_operation_pk uuid,
  p_claim_token uuid,
  p_request_fingerprint text
)
returns boolean
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_row public.billing_top_up_purchase_operations%rowtype;
begin
  if p_operation_pk is null or p_claim_token is null
     or p_request_fingerprint is null or p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'top-up purchase submission input is invalid' using errcode = '22023';
  end if;

  select o.* into v_row
    from public.billing_top_up_purchase_operations o
   where o.id = p_operation_pk
   for update;
  if not found
     or v_row.state <> 'claimed'
     or v_row.claim_token is distinct from p_claim_token
     or v_row.lease_expires_at <= pg_catalog.now() then
    raise exception 'top-up purchase claim is not owned or expired' using errcode = '55000';
  end if;

  update public.billing_top_up_purchase_operations o
     set state = 'submitted',
         submission_started_at = pg_catalog.now(),
         request_fingerprint = p_request_fingerprint,
         attempt_count = o.attempt_count + 1,
         lease_expires_at = pg_catalog.now() + interval '5 minutes'
   where o.id = v_row.id;
  return true;
end;
$$;

-- The Session exists. This is terminal for the ledger: what happens to the money
-- afterwards belongs to the projector.
create or replace function public.complete_stripe_top_up_purchase(
  p_operation_pk uuid,
  p_claim_token uuid,
  p_checkout_session_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_row public.billing_top_up_purchase_operations%rowtype;
begin
  if p_operation_pk is null or p_claim_token is null
     or p_checkout_session_id is null or p_checkout_session_id !~ '^cs_(test|live)_[A-Za-z0-9_]+$' then
    raise exception 'top-up purchase completion input is invalid' using errcode = '22023';
  end if;

  select o.* into v_row
    from public.billing_top_up_purchase_operations o
   where o.id = p_operation_pk
   for update;
  if not found
     or v_row.state not in ('submitted', 'indeterminate')
     or v_row.claim_token is distinct from p_claim_token then
    raise exception 'top-up purchase claim is not owned or expired' using errcode = '55000';
  end if;

  update public.billing_top_up_purchase_operations o
     set state = 'checkout_created',
         provider_object_id = p_checkout_session_id,
         checkout_created_at = pg_catalog.now(),
         resolved_at = pg_catalog.now(),
         claim_token = null,
         lease_expires_at = null,
         last_error = null
   where o.id = v_row.id;
  return true;
end;
$$;

-- Stripe was asked and the answer never arrived. The claim is kept, deliberately:
-- a Session may exist, and inventing a second one is the failure this avoids.
create or replace function public.mark_stripe_top_up_purchase_indeterminate(
  p_operation_pk uuid,
  p_claim_token uuid,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_row public.billing_top_up_purchase_operations%rowtype;
begin
  if p_operation_pk is null or p_claim_token is null
     or p_error_code is null or p_error_code !~ '^[a-z][a-z0-9_]{2,63}$' then
    raise exception 'top-up purchase indeterminate input is invalid' using errcode = '22023';
  end if;

  select o.* into v_row
    from public.billing_top_up_purchase_operations o
   where o.id = p_operation_pk
   for update;
  if not found or v_row.state <> 'submitted' or v_row.claim_token is distinct from p_claim_token then
    raise exception 'top-up purchase claim is not owned or expired' using errcode = '55000';
  end if;

  update public.billing_top_up_purchase_operations o
     set state = 'indeterminate',
         last_error = p_error_code
   where o.id = v_row.id;
  return true;
end;
$$;

-- Stripe refused before creating anything. Nothing exists to reconcile.
create or replace function public.fail_stripe_top_up_purchase(
  p_operation_pk uuid,
  p_claim_token uuid,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_row public.billing_top_up_purchase_operations%rowtype;
begin
  if p_operation_pk is null or p_claim_token is null
     or p_error_code is null or p_error_code !~ '^[a-z][a-z0-9_]{2,63}$' then
    raise exception 'top-up purchase failure input is invalid' using errcode = '22023';
  end if;

  select o.* into v_row
    from public.billing_top_up_purchase_operations o
   where o.id = p_operation_pk
   for update;
  if not found
     or v_row.state not in ('claimed', 'submitted')
     or v_row.claim_token is distinct from p_claim_token then
    raise exception 'top-up purchase claim is not owned or expired' using errcode = '55000';
  end if;

  update public.billing_top_up_purchase_operations o
     set state = 'failed',
         resolved_at = pg_catalog.now(),
         claim_token = null,
         lease_expires_at = null,
         last_error = p_error_code
   where o.id = v_row.id;
  return true;
end;
$$;

comment on table public.billing_top_up_purchase_operations is
  'Durable claim for one top-up purchase intent. Terminal at checkout_created: the projector owns what happens to the money afterwards.';

revoke all on function public.claim_stripe_top_up_purchase(uuid, text, text, text, bigint, text, boolean, text, text, bigint, text)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_stripe_top_up_purchase(uuid, text, text, text, bigint, text, boolean, text, text, bigint, text)
  to service_role;

revoke all on function public.begin_stripe_top_up_purchase_submission(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.begin_stripe_top_up_purchase_submission(uuid, uuid, text)
  to service_role;

revoke all on function public.complete_stripe_top_up_purchase(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_stripe_top_up_purchase(uuid, uuid, text)
  to service_role;

revoke all on function public.mark_stripe_top_up_purchase_indeterminate(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_stripe_top_up_purchase_indeterminate(uuid, uuid, text)
  to service_role;

revoke all on function public.fail_stripe_top_up_purchase(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.fail_stripe_top_up_purchase(uuid, uuid, text)
  to service_role;

commit;

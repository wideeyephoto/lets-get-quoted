-- Dark foundation for preparing one existing one-off invoice payment for the
-- already-dark direct Checkout orchestrator.
--
-- This migration does not add a caller, route, flag, environment variable, or
-- Stripe mutation. The service-role RPC accepts only row identities. Merchant,
-- entitlement, invoice, and fee facts are derived and snapshotted atomically in
-- the database.
--
-- Deliberate scope limit: the target must equal the entire currently
-- outstanding invoice balance. All invoice payments are locked before that
-- balance and its cumulative eligible-service allocation are derived. The RPC
-- does not accept an arbitrary partial amount and refuses competing open,
-- submitted, or prepared payments.

begin;

-- The original pricing trigger makes charge_model immutable, including the
-- one intentional destination -> direct preparation transition. Preserve all
-- of its guards and admit only the exact transition performed by the RPC below.
-- A transaction-local payment ID is necessary but not sufficient: the trigger
-- also requires the definer context, a pristine legacy row, and a complete
-- direct snapshot in the same UPDATE.
create or replace function public.protect_payment_pricing_snapshot()
returns trigger
language plpgsql
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_atomic_direct_preparation boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_atomic_direct_preparation :=
      old.charge_model = 'destination'
      and new.charge_model = 'direct'
      and current_user not in ('anon', 'authenticated', 'service_role')
      and coalesce(
        pg_catalog.current_setting('lgq.direct_payment_preparation_id', true),
        ''
      ) = old.id::text
      and old.status::text = 'requested'
      and new.status is not distinct from old.status
      and new.account_id is not distinct from old.account_id
      and new.job_id is not distinct from old.job_id
      and new.invoice_id is not distinct from old.invoice_id
      and new.kind is not distinct from old.kind
      and new.amount is not distinct from old.amount
      and old.stripe_account_id is null
      and new.stripe_account_id is not null
      and old.stripe_livemode is null
      and new.stripe_livemode is not null
      and old.fee_basis_amount is null
      and new.fee_basis_amount is not null
      and old.platform_fee is null
      and new.platform_fee is not null
      and old.fee_rate is null
      and new.fee_rate is not null
      and old.fee_rate_bps is null
      and new.fee_rate_bps is not null
      and old.fee_plan_code is null
      and new.fee_plan_code is not null
      and old.fee_catalog_version is null
      and new.fee_catalog_version is not null
      and old.reconciliation_status is null
      and new.reconciliation_status = 'pending'
      and old.reconciled_at is null
      and new.reconciled_at is null
      and new.stripe_checkout_session is null
      and new.stripe_payment_intent is null
      and new.stripe_charge_id is null
      and new.stripe_application_fee_id is null
      and new.stripe_balance_transaction_id is null;
  end if;

  if tg_op = 'INSERT' then
    if current_user in ('anon', 'authenticated')
       and (
         new.fee_basis_amount is not null
          or new.platform_fee is not null
          or new.fee_rate is not null
          or new.fee_rate_bps is not null
          or new.fee_plan_code is not null
         or new.fee_catalog_version is not null
         or new.stripe_account_id is not null
         or new.charge_model <> 'destination'
         or new.stripe_charge_id is not null
         or new.stripe_application_fee_id is not null
         or new.stripe_latest_refund_id is not null
         or new.stripe_latest_application_fee_refund_id is not null
         or new.stripe_balance_transaction_id is not null
         or new.reconciliation_status is not null
         or new.reconciled_at is not null
       ) then
      raise exception 'payment pricing and Stripe reconciliation fields are backend-managed'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if current_user in ('anon', 'authenticated')
     and (
       old.fee_basis_amount is distinct from new.fee_basis_amount
        or old.platform_fee is distinct from new.platform_fee
        or old.fee_rate is distinct from new.fee_rate
        or old.fee_rate_bps is distinct from new.fee_rate_bps
        or old.fee_plan_code is distinct from new.fee_plan_code
       or old.fee_catalog_version is distinct from new.fee_catalog_version
       or old.stripe_account_id is distinct from new.stripe_account_id
       or old.charge_model is distinct from new.charge_model
       or old.stripe_charge_id is distinct from new.stripe_charge_id
       or old.stripe_application_fee_id is distinct from new.stripe_application_fee_id
       or old.stripe_latest_refund_id is distinct from new.stripe_latest_refund_id
       or old.stripe_latest_application_fee_refund_id is distinct from new.stripe_latest_application_fee_refund_id
       or old.stripe_balance_transaction_id is distinct from new.stripe_balance_transaction_id
       or old.reconciliation_status is distinct from new.reconciliation_status
       or old.reconciled_at is distinct from new.reconciled_at
     ) then
    raise exception 'payment pricing and Stripe reconciliation fields are backend-managed'
      using errcode = '42501';
  end if;

  if old.charge_model is distinct from new.charge_model
     and not v_atomic_direct_preparation then
    raise exception 'payments.charge_model is immutable' using errcode = '22000';
  end if;
  if old.stripe_account_id is not null
     and old.stripe_account_id is distinct from new.stripe_account_id then
    raise exception 'payments.stripe_account_id is immutable once assigned' using errcode = '22000';
  end if;
  if old.fee_basis_amount is not null
     and old.fee_basis_amount is distinct from new.fee_basis_amount then
    raise exception 'payments.fee_basis_amount is immutable once assigned' using errcode = '22000';
  end if;
  if old.charge_model = 'direct'
     and old.platform_fee is not null
     and old.platform_fee is distinct from new.platform_fee then
    raise exception 'payments.platform_fee is immutable once assigned' using errcode = '22000';
  end if;
  if old.charge_model = 'direct'
     and old.fee_rate is not null
     and old.fee_rate is distinct from new.fee_rate then
    raise exception 'payments.fee_rate is immutable once assigned' using errcode = '22000';
  end if;
  if old.fee_rate_bps is not null
     and old.fee_rate_bps is distinct from new.fee_rate_bps then
    raise exception 'payments.fee_rate_bps is immutable once assigned' using errcode = '22000';
  end if;
  if old.fee_plan_code is not null
     and old.fee_plan_code is distinct from new.fee_plan_code then
    raise exception 'payments.fee_plan_code is immutable once assigned' using errcode = '22000';
  end if;
  if old.fee_catalog_version is not null
     and old.fee_catalog_version is distinct from new.fee_catalog_version then
    raise exception 'payments.fee_catalog_version is immutable once assigned' using errcode = '22000';
  end if;
  if old.stripe_application_fee_id is not null
     and old.stripe_application_fee_id is distinct from new.stripe_application_fee_id then
    raise exception 'payments.stripe_application_fee_id is immutable once assigned' using errcode = '22000';
  end if;
  if old.stripe_charge_id is not null
     and old.stripe_charge_id is distinct from new.stripe_charge_id then
    raise exception 'payments.stripe_charge_id is immutable once assigned' using errcode = '22000';
  end if;
  if old.stripe_balance_transaction_id is not null
     and old.stripe_balance_transaction_id is distinct from new.stripe_balance_transaction_id then
    raise exception 'payments.stripe_balance_transaction_id is immutable once assigned' using errcode = '22000';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_payment_pricing_snapshot()
  from public, anon, authenticated, service_role;

-- stripe_livemode has a separate immutable-field trigger. Admit the same one
-- null -> explicit-mode transition and no other change.
create or replace function public.protect_payment_stripe_livemode()
returns trigger
language plpgsql
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_atomic_direct_preparation boolean := false;
begin
  if tg_op = 'INSERT' then
    if current_user in ('anon', 'authenticated') and new.stripe_livemode is not null then
      raise exception 'payment Stripe mode is backend-managed' using errcode = '42501';
    end if;
    return new;
  end if;

  v_atomic_direct_preparation :=
    old.charge_model = 'destination'
    and new.charge_model = 'direct'
    and old.stripe_livemode is null
    and new.stripe_livemode is not null
    and current_user not in ('anon', 'authenticated', 'service_role')
    and coalesce(
      pg_catalog.current_setting('lgq.direct_payment_preparation_id', true),
      ''
    ) = old.id::text;

  if old.stripe_livemode is distinct from new.stripe_livemode
     and not v_atomic_direct_preparation then
    raise exception 'payments.stripe_livemode is immutable' using errcode = '22000';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_payment_stripe_livemode()
  from public, anon, authenticated, service_role;

-- Keep line items and invoice arithmetic fixed while an open direct snapshot
-- exists. Invoice-row locking serializes this guard with the preparation RPC.
create or replace function public.reject_direct_prepared_invoice_item_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_invoice_ids uuid[];
begin
  v_invoice_ids := case
    when tg_op = 'INSERT' then array[new.invoice_id]
    when tg_op = 'DELETE' then array[old.invoice_id]
    else array[old.invoice_id, new.invoice_id]
  end;

  perform 1
    from public.invoices i
   where i.id = any(v_invoice_ids)
   order by i.id
   for update;

  if exists (
    select 1
      from public.payments p
     where p.invoice_id = any(v_invoice_ids)
       and p.charge_model = 'direct'
       and p.status in ('requested', 'processing', 'failed')
       and p.reconciliation_status = 'pending'
  ) then
    raise exception 'invoice line items are immutable while a direct payment is open'
      using errcode = '55000';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists reject_direct_prepared_invoice_item_mutation_trigger
  on public.invoice_items;
create trigger reject_direct_prepared_invoice_item_mutation_trigger
before insert or update or delete on public.invoice_items
for each row execute function public.reject_direct_prepared_invoice_item_mutation();

revoke all on function public.reject_direct_prepared_invoice_item_mutation()
  from public, anon, authenticated, service_role;

create or replace function public.reject_direct_prepared_invoice_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
begin
  if exists (
    select 1
      from public.payments p
     where p.invoice_id = old.id
       and p.charge_model = 'direct'
       and p.status in ('requested', 'processing', 'failed')
       and p.reconciliation_status = 'pending'
  ) then
    raise exception 'invoice is immutable while a direct payment is open'
      using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists reject_direct_prepared_invoice_mutation_trigger
  on public.invoices;
create trigger reject_direct_prepared_invoice_mutation_trigger
before update of account_id, job_id, status, total, discount_percent, tax_rate
  or delete on public.invoices
for each row execute function public.reject_direct_prepared_invoice_mutation();

revoke all on function public.reject_direct_prepared_invoice_mutation()
  from public, anon, authenticated, service_role;

-- While a prepared direct row is open, freeze every sibling payment row as well
-- as new inserts. A later open payment is also forbidden once an invoice has any
-- historical direct row. Locking the invoice closes insert-vs-prepare races.
create or replace function public.reject_competing_open_invoice_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_invoice_ids uuid[];
  v_payment_id uuid;
begin
  v_invoice_ids := case
    when tg_op = 'INSERT' then array[new.invoice_id]
    when tg_op = 'DELETE' then array[old.invoice_id]
    else array[old.invoice_id, new.invoice_id]
  end;
  v_payment_id := case when tg_op = 'DELETE' then old.id else new.id end;

  perform 1
    from public.invoices i
   where i.id = any(v_invoice_ids)
   order by i.id
   for update;

  if tg_op = 'DELETE'
     and old.charge_model = 'direct'
     and old.status in ('requested', 'processing', 'failed')
     and old.reconciliation_status = 'pending' then
    raise exception 'an open prepared direct payment cannot be deleted'
      using errcode = '55000';
  end if;

  if exists (
    select 1
      from public.payments p
     where p.invoice_id = any(v_invoice_ids)
       and p.id <> v_payment_id
       and p.charge_model = 'direct'
       and p.status in ('requested', 'processing', 'failed')
       and p.reconciliation_status = 'pending'
  ) then
    raise exception 'sibling payments are immutable while a direct payment is open'
      using errcode = '55000';
  end if;

  if tg_op <> 'DELETE'
     and new.invoice_id is not null
     and new.status in ('requested', 'processing', 'failed')
     and exists (
       select 1
         from public.payments p
        where p.invoice_id = new.invoice_id
          and p.id <> new.id
          and p.charge_model = 'direct'
     ) then
    raise exception 'an invoice with direct-payment history cannot accept a competing open payment'
      using errcode = '55000';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists reject_competing_open_invoice_payment_trigger
  on public.payments;
create trigger reject_competing_open_invoice_payment_trigger
before insert or update or delete on public.payments
for each row execute function public.reject_competing_open_invoice_payment();

revoke all on function public.reject_competing_open_invoice_payment()
  from public, anon, authenticated, service_role;

create unique index if not exists payments_one_direct_invoice_idx
  on public.payments (invoice_id)
  where invoice_id is not null
    and charge_model = 'direct';

-- Recheck the canonical entitlement when the existing orchestrator claims and
-- submits. This closes the interval between preparation and provider egress
-- without blocking legitimate entitlement downgrades.
create or replace function public.require_direct_checkout_entitlement_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_payment public.payments%rowtype;
  v_entitlement public.workspace_entitlements%rowtype;
  v_expected_bps integer;
begin
  if new.operation_type <> 'checkout_session.create'
     or (tg_op = 'UPDATE' and new.state is not distinct from old.state)
     or (tg_op = 'UPDATE' and new.state <> 'submitted') then
    return new;
  end if;

  select p.*
    into v_payment
    from public.payments p
   where p.id = new.payment_id
     and p.account_id = new.account_id
   for share;
  if not found
     or v_payment.charge_model <> 'direct'
     or v_payment.stripe_account_id is distinct from new.stripe_account_id
     or v_payment.stripe_livemode is distinct from new.livemode then
    raise exception 'direct Checkout entitlement check cannot resolve its payment snapshot'
      using errcode = '55000';
  end if;

  select e.*
    into v_entitlement
    from public.workspace_entitlements e
   where e.account_id = new.account_id
   for share;

  v_expected_bps := case v_entitlement.plan_code
    when 'flex' then 125
    when 'solo' then 50
    when 'growth' then 25
    when 'scale' then 10
    else null
  end;

  if not found
     or v_entitlement.entitlement_state <> 'active'
     or v_entitlement.catalog_version <> '2026-08-15-preview'
     or v_entitlement.platform_fee_bps is distinct from v_expected_bps
     or not (
       (v_entitlement.plan_code = 'flex'
         and v_entitlement.billing_interval = 'none'
         and v_entitlement.billing_status = 'free')
       or
       (v_entitlement.plan_code in ('solo', 'growth', 'scale')
         and v_entitlement.billing_interval in ('monthly', 'annual')
         and v_entitlement.billing_status = 'active'
         and v_entitlement.period_start is not null
         and v_entitlement.period_end > pg_catalog.now())
     )
     or v_payment.fee_plan_code is distinct from v_entitlement.plan_code
     or v_payment.fee_catalog_version is distinct from v_entitlement.catalog_version
     or v_payment.fee_rate_bps is distinct from v_entitlement.platform_fee_bps
     or v_payment.fee_rate is distinct from v_entitlement.platform_fee_bps::numeric / 10000 then
    raise exception 'direct Checkout requires the exact active entitlement snapshot'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

drop trigger if exists require_direct_checkout_entitlement_insert_trigger
  on public.billing_payment_operations;
create trigger require_direct_checkout_entitlement_insert_trigger
before insert on public.billing_payment_operations
for each row execute function public.require_direct_checkout_entitlement_snapshot();

drop trigger if exists require_direct_checkout_entitlement_submit_trigger
  on public.billing_payment_operations;
create trigger require_direct_checkout_entitlement_submit_trigger
before update of state on public.billing_payment_operations
for each row execute function public.require_direct_checkout_entitlement_snapshot();

revoke all on function public.require_direct_checkout_entitlement_snapshot()
  from public, anon, authenticated, service_role;

create or replace function public.prepare_one_off_direct_invoice_payment(
  p_account_id uuid,
  p_job_id uuid,
  p_invoice_id uuid,
  p_payment_id uuid
)
returns table (
  preparation_status text,
  account_id uuid,
  job_id uuid,
  invoice_id uuid,
  payment_id uuid,
  merchant_account_id text,
  livemode boolean,
  plan_code text,
  catalog_version text,
  fee_rate_bps integer,
  fee_rate numeric,
  gross_amount_cents bigint,
  eligible_service_subtotal_cents bigint,
  application_fee_cents bigint,
  reconciliation_status text
)
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_account public.accounts%rowtype;
  v_entitlement public.workspace_entitlements%rowtype;
  v_invoice public.invoices%rowtype;
  v_payment public.payments%rowtype;
  v_operation public.billing_payment_operations%rowtype;
  v_expected_bps integer;
  v_fee_rate_bps integer;
  v_entitlement_is_current boolean;
  v_succeeded_operation_replay boolean := false;
  v_item_count bigint;
  v_subtotal numeric(12,2);
  v_discount_amount numeric(12,2);
  v_eligible_subtotal numeric(12,2);
  v_tax_amount numeric(12,2);
  v_reconciled_total numeric(12,2);
  v_paid_amount numeric(12,2);
  v_outstanding_amount numeric(12,2);
  v_invoice_total_cents bigint;
  v_paid_amount_cents bigint;
  v_gross_amount_cents bigint;
  v_eligible_total_cents bigint;
  v_eligible_before_cents bigint;
  v_fee_basis_cents bigint;
  v_application_fee_cents bigint;
  v_status text;
begin
  if p_account_id is null or p_job_id is null
     or p_invoice_id is null or p_payment_id is null then
    raise exception 'account, job, invoice, and payment IDs are required'
      using errcode = '22023';
  end if;

  -- One lock order across preparation: account -> entitlement -> job -> line
  -- items -> every invoice payment -> invoice. Row-level child mutation triggers
  -- lock the invoice after the child row, so locking children before their parent
  -- avoids a child/parent deadlock. The final invoice lock blocks new child FKs.
  select a.*
    into v_account
    from public.accounts a
   where a.id = p_account_id
   for update;
  if not found then
    raise exception 'direct payment workspace was not found' using errcode = 'P0002';
  end if;

  if v_account.stripe_merchant_account_id is null
     or v_account.stripe_merchant_account_id !~ '^acct_[A-Za-z0-9]{8,}$'
     or v_account.merchant_livemode is null
     or v_account.merchant_onboarding_state is distinct from 'ready'
     or v_account.merchant_configuration_verified_at is null
     or v_account.merchant_ready_at is distinct from v_account.merchant_configuration_verified_at
     or v_account.merchant_requirements_checked_at is distinct from v_account.merchant_configuration_verified_at
     or v_account.merchant_disabled_at is not null
     or v_account.merchant_dashboard_type is distinct from 'full'
     or v_account.merchant_card_payments_active is distinct from true
     or v_account.merchant_payouts_active is distinct from true
     or v_account.merchant_fees_collector is distinct from 'stripe'
     or v_account.merchant_losses_collector is distinct from 'stripe'
     or v_account.merchant_configuration_api_version is null
     or pg_catalog.length(pg_catalog.btrim(v_account.merchant_configuration_api_version)) = 0
     or v_account.merchant_configuration_verified_at < pg_catalog.clock_timestamp() - interval '24 hours'
     or v_account.merchant_configuration_verified_at > pg_catalog.clock_timestamp() + interval '5 minutes'
     or v_account.merchant_configuration_snapshot is null
     or pg_catalog.jsonb_typeof(v_account.merchant_configuration_snapshot) <> 'object'
     or v_account.merchant_configuration_snapshot_sha256 is null
     or v_account.merchant_configuration_snapshot_sha256 !~ '^[0-9a-f]{64}$'
     or v_account.merchant_configuration_snapshot ->> 'schema_version'
        is distinct from 'lgq.stripe-merchant.v1'
     or v_account.merchant_configuration_snapshot ->> 'object'
        is distinct from 'v2.core.account'
     or v_account.merchant_configuration_snapshot ->> 'account_id'
        is distinct from v_account.stripe_merchant_account_id
     or pg_catalog.jsonb_typeof(v_account.merchant_configuration_snapshot -> 'livemode') <> 'boolean'
     or (v_account.merchant_configuration_snapshot ->> 'livemode')::boolean
        is distinct from v_account.merchant_livemode
     or pg_catalog.jsonb_typeof(v_account.merchant_configuration_snapshot -> 'closed')
        is distinct from 'boolean'
     or v_account.merchant_configuration_snapshot ->> 'closed' is distinct from 'false'
     or v_account.merchant_configuration_snapshot ->> 'dashboard' is distinct from 'full'
     or pg_catalog.jsonb_typeof(
       v_account.merchant_configuration_snapshot -> 'applied_configurations'
     ) is distinct from 'array'
     or not coalesce(
       v_account.merchant_configuration_snapshot -> 'applied_configurations'
       @> '["merchant"]'::jsonb,
       false
     )
     or pg_catalog.jsonb_typeof(
       v_account.merchant_configuration_snapshot #> '{merchant,applied}'
     ) is distinct from 'boolean'
     or v_account.merchant_configuration_snapshot #>> '{merchant,applied}' is distinct from 'true'
     or v_account.merchant_configuration_snapshot #>> '{merchant,card_payments_status}'
        is distinct from 'active'
     or v_account.merchant_configuration_snapshot #>> '{merchant,payouts_status}'
        is distinct from 'active'
     or v_account.merchant_configuration_snapshot #>> '{responsibilities,fees_collector}'
        is distinct from 'stripe'
     or v_account.merchant_configuration_snapshot #>> '{responsibilities,losses_collector}'
        is distinct from 'stripe'
     or v_account.merchant_configuration_snapshot #>> '{responsibilities,requirements_collector}'
        is distinct from 'stripe'
     or pg_catalog.jsonb_typeof(
       v_account.merchant_configuration_snapshot #> '{requirements,included}'
     ) is distinct from 'boolean'
     or v_account.merchant_configuration_snapshot #>> '{requirements,included}'
        is distinct from 'true'
     or v_account.merchant_configuration_snapshot #>> '{requirements,minimum_deadline_status}' = 'past_due'
     or v_account.merchant_configuration_snapshot #>> '{stripe_response,api_version}'
        is distinct from v_account.merchant_configuration_api_version
     or v_account.merchant_configuration_snapshot #>> '{stripe_response,expected_api_version}'
        is distinct from v_account.merchant_configuration_api_version
     or pg_catalog.jsonb_typeof(
       v_account.merchant_configuration_snapshot #> '{stripe_response,status_code}'
     ) is distinct from 'number'
     or (v_account.merchant_configuration_snapshot #>> '{stripe_response,status_code}')::integer
        not between 200 and 299
     or pg_catalog.length(pg_catalog.btrim(coalesce(
       v_account.merchant_configuration_snapshot #>> '{stripe_response,request_id}',
       ''
     ))) = 0
     or pg_catalog.jsonb_typeof(
       v_account.merchant_configuration_snapshot #> '{verification,ready}'
     ) is distinct from 'boolean'
     or v_account.merchant_configuration_snapshot #>> '{verification,ready}'
        is distinct from 'true'
     or pg_catalog.jsonb_typeof(
       v_account.merchant_configuration_snapshot #> '{verification,issues}'
     ) is distinct from 'array'
     or v_account.merchant_configuration_snapshot #> '{verification,issues}'
        is distinct from '[]'::jsonb
     or pg_catalog.jsonb_typeof(
       v_account.merchant_configuration_snapshot #> '{verification,verified_at}'
     ) is distinct from 'string'
     or nullif(
       v_account.merchant_configuration_snapshot #>> '{verification,verified_at}', ''
     )::timestamptz is distinct from v_account.merchant_configuration_verified_at then
    raise exception 'direct payment requires a recently verified ready Accounts v2 Merchant with Stripe-owned fees and losses'
      using errcode = '55000';
  end if;

  select e.*
    into v_entitlement
    from public.workspace_entitlements e
   where e.account_id = p_account_id
   for update;
  if not found then
    raise exception 'canonical workspace entitlement was not found' using errcode = 'P0002';
  end if;

  v_expected_bps := case v_entitlement.plan_code
    when 'flex' then 125
    when 'solo' then 50
    when 'growth' then 25
    when 'scale' then 10
    else null
  end;

  v_entitlement_is_current := coalesce(
    v_entitlement.entitlement_state = 'active'
    and v_entitlement.catalog_version = '2026-08-15-preview'
    and v_entitlement.platform_fee_bps is not distinct from v_expected_bps
    and (
      (v_entitlement.plan_code = 'flex'
        and v_entitlement.billing_interval = 'none'
        and v_entitlement.billing_status = 'free')
      or
      (v_entitlement.plan_code in ('solo', 'growth', 'scale')
        and v_entitlement.billing_interval in ('monthly', 'annual')
        and v_entitlement.billing_status = 'active'
        and v_entitlement.period_start is not null
        and v_entitlement.period_end > pg_catalog.now())
    ),
    false
  );

  perform 1
    from public.jobs j
   where j.id = p_job_id
     and j.account_id = p_account_id
   for share;
  if not found then
    raise exception 'direct payment job does not match the requested workspace'
      using errcode = 'P0002';
  end if;

  -- Lock existing child rows in deterministic order before their parent. A
  -- concurrent child mutation either commits before these locks are acquired or
  -- waits for preparation; preparation never holds the parent while waiting for
  -- a child row whose mutation trigger is itself waiting for that parent.
  perform 1
    from public.invoice_items ii
   where ii.invoice_id = p_invoice_id
   order by ii.id
   for update;

  -- Lock every payment, not just the target. Two preparations for one invoice
  -- therefore serialize and the second observes the first prepared row.
  perform 1
    from public.payments p
   where p.invoice_id = p_invoice_id
   order by p.id
   for update;

  select p.*
    into v_payment
    from public.payments p
   where p.id = p_payment_id
   for update;
  if not found
     or v_payment.account_id is distinct from p_account_id
     or v_payment.job_id is distinct from p_job_id
     or v_payment.invoice_id is distinct from p_invoice_id then
    raise exception 'direct payment row does not match the requested workspace, job, and invoice'
      using errcode = 'P0002';
  end if;

  -- Child locks precede the parent lock because the mutation triggers use that
  -- same child -> invoice order. The invoice lock now also blocks new child rows
  -- through their foreign-key key-share lock while the snapshot is derived.
  select i.*
    into v_invoice
    from public.invoices i
   where i.id = p_invoice_id
   for update;
  if not found
     or v_invoice.account_id is distinct from p_account_id
     or v_invoice.job_id is distinct from p_job_id then
    raise exception 'direct payment invoice does not match the requested workspace and job'
      using errcode = 'P0002';
  end if;
  if v_invoice.status not in ('sent', 'signed')
     or v_invoice.total <= 0
     or v_invoice.discount_percent not between 0 and 100
     or v_invoice.tax_rate not between 0 and 100 then
    raise exception 'direct payment invoice is not a payable reconciliable invoice'
      using errcode = '55000';
  end if;

  select pg_catalog.count(*),
         pg_catalog.round(coalesce(pg_catalog.sum(ii.amount), 0), 2)
    into v_item_count, v_subtotal
    from public.invoice_items ii
   where ii.invoice_id = p_invoice_id;
  if v_item_count = 0 or exists (
    select 1 from public.invoice_items ii
     where ii.invoice_id = p_invoice_id and ii.amount <= 0
  ) then
    raise exception 'direct payment invoice requires positive canonical line items'
      using errcode = '55000';
  end if;

  v_discount_amount := pg_catalog.round(
    v_subtotal * v_invoice.discount_percent / 100,
    2
  );
  v_eligible_subtotal := pg_catalog.round(v_subtotal - v_discount_amount, 2);
  v_tax_amount := pg_catalog.round(
    v_eligible_subtotal * v_invoice.tax_rate / 100,
    2
  );
  v_reconciled_total := pg_catalog.round(v_eligible_subtotal + v_tax_amount, 2);

  if v_invoice.total is distinct from v_reconciled_total
     or v_eligible_subtotal < 0
     or v_eligible_subtotal > v_invoice.total then
    raise exception 'stored invoice total does not reconcile from line items, discount, and tax'
      using errcode = '22000';
  end if;

  if v_payment.kind not in ('deposit', 'stage', 'final')
     or v_payment.payment_plan_id is not null
     or v_payment.recurring_plan_id is not null
     or v_payment.installment_seq is not null
     or v_payment.due_date is not null
     or v_payment.imported is distinct from false
     or v_payment.refunded_amount is distinct from 0
     or v_payment.eligible_service_refunded_amount is distinct from 0
     or v_payment.platform_fee_refunded is distinct from 0
     or v_payment.refunded_at is not null
     or v_payment.stripe_latest_refund_id is not null
     or v_payment.stripe_latest_application_fee_refund_id is not null then
    raise exception 'direct payment preparation supports only a non-plan, non-recurring one-off payment'
      using errcode = '0A000';
  end if;

  if exists (
    select 1
      from public.payments p
     where p.invoice_id = p_invoice_id
       and p.id <> p_payment_id
       and (
         p.status in ('requested', 'processing', 'failed', 'disputed')
         -- Any prior direct row would require proving a cumulative canonical
         -- application-fee target across immutable historical snapshots. This
         -- intentionally narrower foundation does not attempt that allocation.
         or p.charge_model = 'direct'
         or (p.stripe_checkout_session is not null and p.status not in ('paid', 'refunded'))
         or (p.stripe_payment_intent is not null and p.status not in ('paid', 'refunded'))
       )
  ) or exists (
    select 1
      from public.payments p
     where p.invoice_id = p_invoice_id
       and p.id <> p_payment_id
       and (
         p.payment_plan_id is not null
         or p.recurring_plan_id is not null
         or p.kind = 'plan_installment'
       )
  ) then
    raise exception 'invoice has a competing open, submitted, prepared, plan, recurring, or disputed payment'
      using errcode = '55000';
  end if;

  if v_payment.charge_model = 'direct' then
    select o.*
      into v_operation
      from public.billing_payment_operations o
     where o.payment_id = p_payment_id
       and o.operation_type = 'checkout_session.create'
     for share;
  end if;

  v_succeeded_operation_replay := coalesce(
    v_payment.charge_model = 'direct'
    and v_payment.status::text = 'processing'
    and v_payment.stripe_checkout_session ~ '^cs_[A-Za-z0-9_]+$'
    and v_payment.stripe_payment_intent is null
    and v_payment.stripe_charge_id is null
    and v_payment.stripe_application_fee_id is null
    and v_payment.stripe_balance_transaction_id is null
    and v_payment.paid_at is null
    and v_operation.id is not null
    and v_operation.account_id is not distinct from p_account_id
    and v_operation.stripe_account_id is not distinct from v_payment.stripe_account_id
    and v_operation.livemode is not distinct from v_payment.stripe_livemode
    and v_operation.charge_model is not distinct from 'direct'
    and v_operation.state is not distinct from 'succeeded'
    and v_operation.provider_object_id is not distinct from v_payment.stripe_checkout_session,
    false
  );

  if v_succeeded_operation_replay then
    v_expected_bps := case v_payment.fee_plan_code
      when 'flex' then 125
      when 'solo' then 50
      when 'growth' then 25
      when 'scale' then 10
      else null
    end;
    if v_payment.fee_catalog_version is distinct from '2026-08-15-preview'
       or v_payment.fee_rate_bps is distinct from v_expected_bps
       or v_payment.fee_rate is distinct from v_expected_bps::numeric / 10000 then
      raise exception 'succeeded direct replay has a non-canonical frozen fee snapshot'
        using errcode = '22000';
    end if;
    v_fee_rate_bps := v_payment.fee_rate_bps;
  else
    if not v_entitlement_is_current then
      raise exception 'direct payment requires the exact canonical active workspace entitlement'
        using errcode = '55000';
    end if;
    v_fee_rate_bps := v_entitlement.platform_fee_bps;
  end if;

  select pg_catalog.round(coalesce(pg_catalog.sum(
           case when p.status = 'paid'
             then p.amount - p.refunded_amount
             else 0 end
         ), 0), 2)
    into v_paid_amount
    from public.payments p
   where p.invoice_id = p_invoice_id;

  if v_paid_amount < 0 or v_paid_amount >= v_invoice.total then
    raise exception 'invoice does not have a positive outstanding balance'
      using errcode = '55000';
  end if;

  v_outstanding_amount := pg_catalog.round(v_invoice.total - v_paid_amount, 2);
  if v_payment.amount is distinct from v_outstanding_amount then
    raise exception 'one-off direct payment must equal the full outstanding invoice balance'
      using errcode = '55000';
  end if;

  v_invoice_total_cents := (v_invoice.total * 100)::bigint;
  v_paid_amount_cents := (v_paid_amount * 100)::bigint;
  v_gross_amount_cents := (v_outstanding_amount * 100)::bigint;
  v_eligible_total_cents := (v_eligible_subtotal * 100)::bigint;

  -- Cumulative allocation mirrors payment-fee.ts. Because this payment is the
  -- full remainder, target-after is exactly the total eligible service cents.
  -- Tax participates only in gross/outstanding math and never in this basis.
  v_eligible_before_cents := case
    when v_paid_amount_cents = 0 or v_eligible_total_cents = 0 then 0
    else pg_catalog.round(
      v_paid_amount_cents::numeric * v_eligible_total_cents::numeric
        / v_invoice_total_cents::numeric,
      0
    )::bigint
  end;
  v_fee_basis_cents := v_eligible_total_cents - v_eligible_before_cents;
  v_application_fee_cents := pg_catalog.round(
    v_fee_basis_cents::numeric * v_fee_rate_bps::numeric / 10000,
    0
  )::bigint;

  if v_fee_basis_cents < 0
     or v_fee_basis_cents > v_gross_amount_cents
     or v_application_fee_cents < 0
     or v_application_fee_cents > v_fee_basis_cents then
    raise exception 'derived direct payment fee allocation is invalid'
      using errcode = '22000';
  end if;

  if v_payment.charge_model = 'direct' then
    if v_payment.stripe_account_id is distinct from v_account.stripe_merchant_account_id
       or v_payment.stripe_livemode is distinct from v_account.merchant_livemode
       or (
         not v_succeeded_operation_replay
         and (
           v_payment.fee_plan_code is distinct from v_entitlement.plan_code
           or v_payment.fee_catalog_version is distinct from v_entitlement.catalog_version
           or v_payment.fee_rate_bps is distinct from v_entitlement.platform_fee_bps
           or v_payment.fee_rate is distinct from v_entitlement.platform_fee_bps::numeric / 10000
         )
       )
       or v_payment.fee_basis_amount is distinct from v_fee_basis_cents::numeric / 100
       or v_payment.platform_fee is distinct from v_application_fee_cents::numeric / 100
       or v_payment.reconciliation_status <> 'pending'
       or v_payment.reconciled_at is not null then
      raise exception 'prepared direct payment does not match the current immutable snapshot'
        using errcode = '22000';
    end if;

    if v_operation.id is not null
       and (
         v_operation.account_id is distinct from p_account_id
         or v_operation.stripe_account_id is distinct from v_payment.stripe_account_id
         or v_operation.livemode is distinct from v_payment.stripe_livemode
         or v_operation.charge_model is distinct from 'direct'
       ) then
      raise exception 'direct replay Checkout operation identity does not match its payment snapshot'
        using errcode = '22000';
    end if;

    if v_payment.status::text = 'requested' then
      if v_payment.stripe_checkout_session is not null
         or v_payment.stripe_payment_intent is not null
         or v_payment.stripe_charge_id is not null
         or v_payment.stripe_application_fee_id is not null
         or v_payment.stripe_balance_transaction_id is not null
         or v_payment.paid_at is not null
         or (v_operation.id is not null and v_operation.state = 'succeeded') then
        raise exception 'requested direct replay contains submitted provider state'
          using errcode = '55000';
      end if;
    elsif v_payment.status::text = 'processing' then
      if v_payment.stripe_checkout_session is null
         or v_payment.stripe_checkout_session !~ '^cs_[A-Za-z0-9_]+$'
         or v_payment.stripe_payment_intent is not null
         or v_payment.stripe_charge_id is not null
         or v_payment.stripe_application_fee_id is not null
         or v_payment.stripe_balance_transaction_id is not null
         or v_payment.paid_at is not null
         or v_operation.id is null
         or v_operation.state is distinct from 'succeeded'
         or v_operation.provider_object_id is distinct from v_payment.stripe_checkout_session then
        raise exception 'processing direct replay does not match its succeeded Checkout operation'
          using errcode = '55000';
      end if;
    else
      raise exception 'prepared direct payment is outside the replayable Checkout stages'
        using errcode = '55000';
    end if;

    v_status := 'replay';
  elsif v_payment.charge_model = 'destination' then
    if v_payment.status::text <> 'requested'
       or v_payment.stripe_checkout_session is not null
       or v_payment.stripe_payment_intent is not null
       or v_payment.stripe_charge_id is not null
       or v_payment.stripe_application_fee_id is not null
       or v_payment.stripe_balance_transaction_id is not null
       or v_payment.paid_at is not null then
      raise exception 'direct payment must be requested and unsubmitted'
        using errcode = '55000';
    end if;

    if exists (
      select 1
        from public.billing_payment_operations o
       where o.payment_id = p_payment_id
    ) then
      raise exception 'unprepared payment has already entered the Checkout operation ledger'
        using errcode = '55000';
    end if;

    if v_payment.stripe_account_id is not null
       or v_payment.stripe_livemode is not null
       or v_payment.fee_plan_code is not null
       or v_payment.fee_catalog_version is not null
       or v_payment.fee_rate_bps is not null
       or v_payment.fee_rate is not null
       or v_payment.fee_basis_amount is not null
       or v_payment.platform_fee is not null
       or v_payment.reconciliation_status is not null
       or v_payment.reconciled_at is not null then
      raise exception 'legacy payment contains a partial or conflicting direct snapshot'
        using errcode = '22000';
    end if;

    perform pg_catalog.set_config(
      'lgq.direct_payment_preparation_id',
      p_payment_id::text,
      true
    );

    update public.payments p
       set charge_model = 'direct',
           stripe_account_id = v_account.stripe_merchant_account_id,
           stripe_livemode = v_account.merchant_livemode,
           fee_plan_code = v_entitlement.plan_code,
           fee_catalog_version = v_entitlement.catalog_version,
           fee_rate_bps = v_entitlement.platform_fee_bps,
           fee_rate = v_entitlement.platform_fee_bps::numeric / 10000,
           fee_basis_amount = v_fee_basis_cents::numeric / 100,
           platform_fee = v_application_fee_cents::numeric / 100,
           reconciliation_status = 'pending',
           reconciled_at = null
     where p.id = p_payment_id
       and p.account_id = p_account_id
       and p.job_id = p_job_id
       and p.invoice_id = p_invoice_id
       and p.status = 'requested'
       and p.charge_model = 'destination'
    returning p.* into v_payment;

    perform pg_catalog.set_config('lgq.direct_payment_preparation_id', '', true);

    if not found then
      raise exception 'direct payment changed during atomic preparation'
        using errcode = '40001';
    end if;
    v_status := 'prepared';
  else
    raise exception 'payment charge model is not supported by direct preparation'
      using errcode = '22000';
  end if;

  return query select
    v_status,
    p_account_id,
    p_job_id,
    p_invoice_id,
    p_payment_id,
    v_payment.stripe_account_id,
    v_payment.stripe_livemode,
    v_payment.fee_plan_code,
    v_payment.fee_catalog_version,
    v_payment.fee_rate_bps,
    v_payment.fee_rate,
    (v_payment.amount * 100)::bigint,
    (v_payment.fee_basis_amount * 100)::bigint,
    (v_payment.platform_fee * 100)::bigint,
    v_payment.reconciliation_status;
end;
$$;

comment on function public.prepare_one_off_direct_invoice_payment(uuid, uuid, uuid, uuid)
  is 'Dark service-only RPC: atomically snapshots one full-outstanding-balance invoice payment for the direct Checkout orchestrator; performs no Stripe call.';

revoke all on function public.prepare_one_off_direct_invoice_payment(uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.prepare_one_off_direct_invoice_payment(uuid, uuid, uuid, uuid)
  to service_role;

commit;

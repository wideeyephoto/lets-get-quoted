-- Persist and enforce the Stripe Merchant configuration that makes LGQ's
-- low application-fee model safe: the contractor's account owns processing
-- fees and losses, and every direct payment is bound to that exact account.

begin;

alter table public.accounts
  add column if not exists merchant_livemode boolean,
  add column if not exists merchant_dashboard_type text,
  add column if not exists merchant_card_payments_active boolean not null default false,
  add column if not exists merchant_us_bank_account_payments_active boolean not null default false,
  add column if not exists merchant_payouts_active boolean not null default false,
  add column if not exists merchant_fees_collector text,
  add column if not exists merchant_losses_collector text,
  add column if not exists merchant_configuration_api_version text,
  add column if not exists merchant_configuration_snapshot jsonb,
  add column if not exists merchant_configuration_snapshot_sha256 text,
  add column if not exists merchant_configuration_verified_at timestamptz;

do $$
begin
  alter table public.accounts
    drop constraint if exists accounts_merchant_ready_state_check;
  alter table public.accounts
    add constraint accounts_merchant_ready_state_check
    check (
      merchant_onboarding_state <> 'ready'
      or (
        stripe_merchant_account_id is not null
        and merchant_ready_at is not null
        and merchant_disabled_at is null
        and merchant_requirements_checked_at is not null
        and merchant_configuration_verified_at is not null
        and merchant_configuration_verified_at >= merchant_requirements_checked_at
        and merchant_livemode is not null
        and merchant_dashboard_type = 'full'
        and merchant_card_payments_active
        and merchant_payouts_active
        and merchant_fees_collector = 'stripe'
        and merchant_losses_collector = 'stripe'
        and merchant_configuration_api_version is not null
        and pg_catalog.length(pg_catalog.btrim(merchant_configuration_api_version)) > 0
        and merchant_configuration_snapshot is not null
        and pg_catalog.jsonb_typeof(merchant_configuration_snapshot) = 'object'
        and merchant_configuration_snapshot_sha256 ~ '^[0-9a-f]{64}$'
      )
    );

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.accounts'::pg_catalog.regclass
       and conname = 'accounts_merchant_dashboard_type_check'
  ) then
    alter table public.accounts
      add constraint accounts_merchant_dashboard_type_check
      check (merchant_dashboard_type is null or merchant_dashboard_type in ('none', 'express', 'full'));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.accounts'::pg_catalog.regclass
       and conname = 'accounts_merchant_collectors_check'
  ) then
    alter table public.accounts
      add constraint accounts_merchant_collectors_check
      check (
        (merchant_fees_collector is null or merchant_fees_collector in ('stripe', 'application'))
        and (merchant_losses_collector is null or merchant_losses_collector in ('stripe', 'application'))
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.accounts'::pg_catalog.regclass
       and conname = 'accounts_merchant_configuration_snapshot_check'
  ) then
    alter table public.accounts
      add constraint accounts_merchant_configuration_snapshot_check
      check (
        (merchant_configuration_snapshot is null or pg_catalog.jsonb_typeof(merchant_configuration_snapshot) = 'object')
        and (
          merchant_configuration_snapshot_sha256 is null
          or merchant_configuration_snapshot_sha256 ~ '^[0-9a-f]{64}$'
        )
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.accounts'::pg_catalog.regclass
       and conname = 'accounts_id_stripe_merchant_account_unique'
  ) then
    alter table public.accounts
      add constraint accounts_id_stripe_merchant_account_unique
      unique (id, stripe_merchant_account_id);
  end if;
end
$$;

-- Extend the existing browser guard to every provider-verified readiness fact.
create or replace function public.protect_account_merchant_state()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.stripe_merchant_account_id is not null
         or new.merchant_onboarding_state <> 'not_started'
         or new.merchant_onboarding_started_at is not null
         or new.merchant_requirements_checked_at is not null
         or new.merchant_ready_at is not null
         or new.merchant_disabled_at is not null
         or new.merchant_livemode is not null
         or new.merchant_dashboard_type is not null
         or new.merchant_card_payments_active
         or new.merchant_us_bank_account_payments_active
         or new.merchant_payouts_active
         or new.merchant_fees_collector is not null
         or new.merchant_losses_collector is not null
         or new.merchant_configuration_api_version is not null
         or new.merchant_configuration_snapshot is not null
         or new.merchant_configuration_snapshot_sha256 is not null
         or new.merchant_configuration_verified_at is not null then
        raise exception 'Stripe Merchant state is backend-managed' using errcode = '42501';
      end if;
    elsif old.stripe_merchant_account_id is distinct from new.stripe_merchant_account_id
       or old.merchant_onboarding_state is distinct from new.merchant_onboarding_state
       or old.merchant_onboarding_started_at is distinct from new.merchant_onboarding_started_at
       or old.merchant_requirements_checked_at is distinct from new.merchant_requirements_checked_at
       or old.merchant_ready_at is distinct from new.merchant_ready_at
       or old.merchant_disabled_at is distinct from new.merchant_disabled_at
       or old.merchant_livemode is distinct from new.merchant_livemode
       or old.merchant_dashboard_type is distinct from new.merchant_dashboard_type
       or old.merchant_card_payments_active is distinct from new.merchant_card_payments_active
       or old.merchant_us_bank_account_payments_active is distinct from new.merchant_us_bank_account_payments_active
       or old.merchant_payouts_active is distinct from new.merchant_payouts_active
       or old.merchant_fees_collector is distinct from new.merchant_fees_collector
       or old.merchant_losses_collector is distinct from new.merchant_losses_collector
       or old.merchant_configuration_api_version is distinct from new.merchant_configuration_api_version
       or old.merchant_configuration_snapshot is distinct from new.merchant_configuration_snapshot
       or old.merchant_configuration_snapshot_sha256 is distinct from new.merchant_configuration_snapshot_sha256
       or old.merchant_configuration_verified_at is distinct from new.merchant_configuration_verified_at then
      raise exception 'Stripe Merchant state is backend-managed' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_account_merchant_state_update_trigger on public.accounts;
create trigger protect_account_merchant_state_update_trigger
before update of stripe_merchant_account_id, merchant_onboarding_state,
  merchant_onboarding_started_at, merchant_requirements_checked_at,
  merchant_ready_at, merchant_disabled_at, merchant_livemode,
  merchant_dashboard_type, merchant_card_payments_active,
  merchant_us_bank_account_payments_active, merchant_payouts_active,
  merchant_fees_collector, merchant_losses_collector,
  merchant_configuration_api_version, merchant_configuration_snapshot,
  merchant_configuration_snapshot_sha256, merchant_configuration_verified_at
on public.accounts
for each row execute function public.protect_account_merchant_state();

revoke all on function public.protect_account_merchant_state() from public, anon, authenticated;

-- MATCH SIMPLE intentionally leaves legacy destination rows (whose
-- stripe_account_id is NULL) alone. Direct rows require a non-NULL account and
-- therefore must match their workspace's verified Merchant account exactly.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.payments'::pg_catalog.regclass
       and conname = 'payments_direct_merchant_account_fk'
  ) then
    alter table public.payments
      add constraint payments_direct_merchant_account_fk
      foreign key (account_id, stripe_account_id)
      references public.accounts(id, stripe_merchant_account_id)
      on update restrict on delete restrict;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.payments'::pg_catalog.regclass
       and conname = 'payments_id_account_stripe_model_unique'
  ) then
    alter table public.payments
      add constraint payments_id_account_stripe_model_unique
      unique (id, account_id, stripe_account_id, charge_model);
  end if;
end
$$;

-- Every current durable operation creates or mutates a payment object. Requiring
-- its payment closes the nullable-FK escape hatch and also proves direct model.
alter table public.billing_payment_operations
  alter column payment_id set not null;
alter table public.billing_payment_operations
  drop constraint if exists billing_payment_operations_payment_fk;
alter table public.billing_payment_operations
  add constraint billing_payment_operations_payment_fk
  foreign key (payment_id, account_id, stripe_account_id, charge_model)
  references public.payments(id, account_id, stripe_account_id, charge_model)
  on delete restrict;

commit;

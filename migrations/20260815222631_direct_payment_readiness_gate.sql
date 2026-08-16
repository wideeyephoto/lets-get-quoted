-- Bind every direct payment and durable Stripe mutation to the verified
-- test/live Merchant configuration, and refuse to create direct work when that
-- verification is missing or stale.

begin;

alter table public.payments
  add column if not exists stripe_livemode boolean;

alter table public.billing_payment_operations
  add column if not exists livemode boolean;

do $$
begin
  if exists (select 1 from public.billing_payment_operations where livemode is null) then
    raise exception 'billing payment operations require an explicit livemode backfill';
  end if;
  alter table public.billing_payment_operations
    alter column livemode set not null;

  alter table public.payments
    drop constraint if exists payments_direct_charge_account_check;
  alter table public.payments
    add constraint payments_direct_charge_account_check
    check (
      charge_model <> 'direct'
      or (
        stripe_account_id is not null
        and stripe_livemode is not null
        and fee_basis_amount is not null
        and fee_plan_code is not null
        and fee_catalog_version is not null
        and fee_rate_bps is not null
        and fee_rate is not null
        and platform_fee is not null
        and reconciliation_status is not null
        and stripe_account_id ~ '^acct_[A-Za-z0-9]{8,}$'
        and fee_rate = fee_rate_bps::numeric / 10000
        and platform_fee = pg_catalog.round(fee_basis_amount * fee_rate_bps::numeric / 10000, 2)
      )
    );

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.accounts'::pg_catalog.regclass
       and conname = 'accounts_id_stripe_merchant_livemode_unique'
  ) then
    alter table public.accounts
      add constraint accounts_id_stripe_merchant_livemode_unique
      unique (id, stripe_merchant_account_id, merchant_livemode);
  end if;

  alter table public.payments
    drop constraint if exists payments_direct_merchant_account_fk;
  alter table public.payments
    add constraint payments_direct_merchant_account_fk
    foreign key (account_id, stripe_account_id, stripe_livemode)
    references public.accounts(id, stripe_merchant_account_id, merchant_livemode)
    on update restrict on delete restrict;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.payments'::pg_catalog.regclass
       and conname = 'payments_id_account_stripe_live_model_unique'
  ) then
    alter table public.payments
      add constraint payments_id_account_stripe_live_model_unique
      unique (id, account_id, stripe_account_id, stripe_livemode, charge_model);
  end if;

  alter table public.billing_payment_operations
    drop constraint if exists billing_payment_operations_payment_fk;
  alter table public.billing_payment_operations
    add constraint billing_payment_operations_payment_fk
    foreign key (payment_id, account_id, stripe_account_id, livemode, charge_model)
    references public.payments(id, account_id, stripe_account_id, stripe_livemode, charge_model)
    on delete restrict;
end
$$;

create or replace function public.protect_payment_stripe_livemode()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if current_user in ('anon', 'authenticated') and new.stripe_livemode is not null then
      raise exception 'payment Stripe mode is backend-managed' using errcode = '42501';
    end if;
    return new;
  end if;

  if old.stripe_livemode is distinct from new.stripe_livemode then
    raise exception 'payments.stripe_livemode is immutable' using errcode = '22000';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_payment_stripe_livemode_insert_trigger on public.payments;
create trigger protect_payment_stripe_livemode_insert_trigger
before insert on public.payments
for each row execute function public.protect_payment_stripe_livemode();

drop trigger if exists protect_payment_stripe_livemode_update_trigger on public.payments;
create trigger protect_payment_stripe_livemode_update_trigger
before update of stripe_livemode on public.payments
for each row execute function public.protect_payment_stripe_livemode();

revoke all on function public.protect_payment_stripe_livemode() from public, anon, authenticated;

create or replace function public.require_direct_payment_merchant_readiness()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.charge_model = 'direct' and not exists (
    select 1
      from public.accounts a
     where a.id = new.account_id
       and a.stripe_merchant_account_id = new.stripe_account_id
       and a.merchant_livemode = new.stripe_livemode
       and a.merchant_onboarding_state = 'ready'
       and a.merchant_disabled_at is null
       and a.merchant_configuration_verified_at >= pg_catalog.now() - interval '24 hours'
  ) then
    raise exception 'direct payment requires a recently verified, ready Stripe Merchant account'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists require_direct_payment_merchant_readiness_insert_trigger on public.payments;
create trigger require_direct_payment_merchant_readiness_insert_trigger
before insert on public.payments
for each row execute function public.require_direct_payment_merchant_readiness();

drop trigger if exists require_direct_payment_merchant_readiness_update_trigger on public.payments;
create trigger require_direct_payment_merchant_readiness_update_trigger
before update of account_id, stripe_account_id, stripe_livemode, charge_model on public.payments
for each row execute function public.require_direct_payment_merchant_readiness();

revoke all on function public.require_direct_payment_merchant_readiness() from public, anon, authenticated;

create or replace function public.protect_billing_operation_livemode()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if old.livemode is distinct from new.livemode then
    raise exception 'billing payment operation livemode is immutable' using errcode = '22000';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_billing_operation_livemode_trigger
  on public.billing_payment_operations;
create trigger protect_billing_operation_livemode_trigger
before update of livemode on public.billing_payment_operations
for each row execute function public.protect_billing_operation_livemode();

revoke all on function public.protect_billing_operation_livemode() from public, anon, authenticated;

create index if not exists billing_payment_operations_payment_live_scope_idx
  on public.billing_payment_operations (
    payment_id, account_id, stripe_account_id, livemode, charge_model
  );

create index if not exists payments_account_stripe_live_scope_idx
  on public.payments (account_id, stripe_account_id, stripe_livemode);

commit;

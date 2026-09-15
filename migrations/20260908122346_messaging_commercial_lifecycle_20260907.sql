begin;
-- Migration: 20260907170000_messaging_commercial_lifecycle.sql
-- Dedicated Number Commercial Lifecycle & Entitlement Engine Foundation

-- 1. Extend accounts with dedicated number entitlement & commercial lifecycle fields
alter table if exists public.accounts
  add column if not exists dedicated_number_status text not null default 'none',
  add column if not exists dedicated_number_subscription_item_id text,
  add column if not exists dedicated_number_monthly_cents integer not null default 2500,
  add column if not exists dedicated_number_allowance_segments integer not null default 500,
  add column if not exists dedicated_number_released_at timestamptz;

-- Add check constraint for status values safely
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'accounts_dedicated_number_status_check'
  ) then
    alter table public.accounts
      add constraint accounts_dedicated_number_status_check
      check (dedicated_number_status in ('none', 'pending_setup', 'provisioning', 'active', 'suspended', 'quarantined', 'released'));
  end if;
end $$;

-- 2. Create messaging payment ledger table for net-of-refunds tracking
create table if not exists public.messaging_payment_ledger (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  order_id uuid references public.messaging_setup_orders(id) on delete set null,
  entry_type text not null check (entry_type in ('setup_fee', 'monthly_rental', 'refund', 'dispute', 'manual_credit')),
  amount_cents integer not null,
  currency text not null default 'usd',
  stripe_event_id text,
  stripe_refund_id text,
  stripe_dispute_id text,
  notes text,
  created_at timestamptz not null default clock_timestamp()
);

-- Covering indexes on foreign keys
create index if not exists messaging_payment_ledger_account_idx
  on public.messaging_payment_ledger(account_id);

create index if not exists messaging_payment_ledger_order_idx
  on public.messaging_payment_ledger(order_id);

-- Enable RLS
alter table public.messaging_payment_ledger enable row level security;

-- Owner read-only policy
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'messaging_payment_ledger' and policyname = 'messaging_payment_ledger_owner_read'
  ) then
    create policy "messaging_payment_ledger_owner_read"
      on public.messaging_payment_ledger
      for select
      to authenticated
      using (
        account_id in (
          select account_id from public.memberships
          where user_id = auth.uid() and role = 'owner'
        )
      );
  end if;
end $$;

-- Service role full access policy
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'messaging_payment_ledger' and policyname = 'messaging_payment_ledger_service_role'
  ) then
    create policy "messaging_payment_ledger_service_role"
      on public.messaging_payment_ledger
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;


commit;;

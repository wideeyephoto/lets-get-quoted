-- Somewhere for a purchased seat to live.
--
-- WHY THIS TABLE EXISTS. A recurring-capacity top-up -- a crew seat today --
-- raises a limit rather than granting a consumable balance, and this schema has
-- nowhere to put that. Both existing homes are wrong, for different reasons:
--
--   workspace_entitlements.feature_limits is recomputed WHOLESALE from the plan
--   by project_stripe_billing_subscription_event_v1_unchecked, which builds its
--   own copy, refuses the projection if the caller's differs, and then
--   overwrites the column. A purchased seat written there is rejected on the way
--   in and erased on the next subscription event.
--
--   usage_credit_lots is a consumable FIFO ledger. reserve_usage_credits selects
--   lots by account, resource, window and remaining balance -- there is no
--   source_type filter -- so a seat stored as a lot is one reservation away from
--   being spent, and there is no revoke path to undo it.
--
-- So capacity gets its own ledger, summed at read time and never merged into the
-- plan's numbers. The plan stays the plan; what was bought stays separate and
-- auditable next to the Stripe subscription that pays for it.
--
-- WHAT COUNTS, AND WHY past_due DOES. Active and past_due both count; only
-- canceled stops counting. This mirrors what the base plan already does with a
-- failed renewal -- billing_status 'past_due' maps to entitlement_state 'grace',
-- not to a revoked plan. Stripe's past_due is a temporary state that resolves to
-- active or canceled on its own. Dropping a seat the instant a card fails would
-- lock an employee out of a job they are stood on, to recover $5 that Stripe is
-- still trying to collect.
--
-- ONE DEFINITION OF "COUNTED". The count lives in a function, not in the two
-- callers. The crew seat gate already computes its plan limit in two
-- byte-identical blocks -- create and reactivate -- and any second copy of this
-- sum would be a third place for them to disagree.
--
-- ALL THREE CAPACITY SKUS ARE BOUND, not just the sellable one. The price book is
-- published and settled; which of them may be SOLD is the application's decision
-- (TOP_UPS_WITHHELD), not a shape the database should be migrated to change.
-- Today only crew_user is heading for sale; office_user and storage_100gb remain
-- withheld for reasons that are not about billing.

begin;

create table public.workspace_purchased_capacity (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,
  top_up_id text not null check (
    top_up_id in ('crew_user', 'office_user', 'storage_100gb')
  ),
  resource_code text not null check (resource_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  units bigint not null check (units > 0),
  unit_amount_cents bigint not null check (unit_amount_cents > 0),
  catalog_version text not null check (catalog_version = '2026-08-18-preview'),
  livemode boolean not null,
  stripe_subscription_id text not null check (
    stripe_subscription_id ~ '^sub_[A-Za-z0-9]{8,}$'
    and pg_catalog.length(stripe_subscription_id) <= 255
  ),
  status text not null default 'active'
    check (status in ('active', 'past_due', 'canceled')),
  current_period_end timestamptz,
  -- The receipt that bought it. Evidence, not identity: a Session is projected
  -- once, but the subscription outlives it and changes state without one.
  billing_event_id uuid references public.billing_events(id) on delete set null,
  canceled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
    check (pg_catalog.jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),

  -- One row per Stripe subscription. This is what makes a replayed receipt and a
  -- redelivered lifecycle event idempotent rather than additive -- two rows for
  -- one subscription would be two seats for one payment.
  constraint workspace_purchased_capacity_subscription_unique
    unique (livemode, stripe_subscription_id),

  -- The published price book, so a row cannot record capacity the catalog does
  -- not carry. Changing a customer-visible price is a migration on purpose.
  constraint workspace_purchased_capacity_catalog_binding_check check (
    (top_up_id = 'crew_user' and resource_code = 'crew_users'
      and units = 1 and unit_amount_cents = 500)
    or (top_up_id = 'office_user' and resource_code = 'office_users'
      and units = 1 and unit_amount_cents = 1500)
    or (top_up_id = 'storage_100gb' and resource_code = 'storage_gb'
      and units = 100 and unit_amount_cents = 1500)
  ),

  -- There is deliberately no test/live shape check on the subscription ID. A
  -- Stripe Checkout Session ID carries its mode (cs_test_ / cs_live_) and the
  -- top-up ledger checks it; a subscription ID does not, so the only guard
  -- against crossing modes is the livemode column plus the uniqueness above.

  -- Only a canceled row carries a cancellation time, and it always carries one.
  constraint workspace_purchased_capacity_state_shape_check check (
    (status in ('active', 'past_due') and canceled_at is null)
    or (status = 'canceled' and canceled_at is not null)
  )
);

-- The read the seat gates make, on every create and every reactivate.
create index workspace_purchased_capacity_counted_idx
  on public.workspace_purchased_capacity (account_id, resource_code)
  where status in ('active', 'past_due');
create index workspace_purchased_capacity_account_created_idx
  on public.workspace_purchased_capacity (account_id, created_at desc);

alter table public.workspace_purchased_capacity enable row level security;
-- No policy: this ledger is service-role only, like every other billing ledger
-- here. Owners see the effect through their seat limit, not the rows.

comment on table public.workspace_purchased_capacity is
  'Purchased recurring capacity, summed into a seat limit at read time. Never merged into workspace_entitlements.feature_limits, which is recomputed from the plan.';

-- Append-only in the ways that matter, and one legal path through the states.
create or replace function public.protect_workspace_purchased_capacity()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'purchased capacity cannot be deleted' using errcode = '42501';
  end if;

  if old.account_id is distinct from new.account_id
     or old.top_up_id is distinct from new.top_up_id
     or old.resource_code is distinct from new.resource_code
     or old.units is distinct from new.units
     or old.unit_amount_cents is distinct from new.unit_amount_cents
     or old.catalog_version is distinct from new.catalog_version
     or old.livemode is distinct from new.livemode
     or old.stripe_subscription_id is distinct from new.stripe_subscription_id
     or old.created_at is distinct from new.created_at then
    raise exception 'purchased capacity identity is immutable' using errcode = '22000';
  end if;

  -- canceled is terminal. A resumed subscription is a NEW Stripe subscription
  -- with a new id, so it gets its own row rather than resurrecting this one.
  if new.status is distinct from old.status and not (
    (old.status = 'active' and new.status in ('past_due', 'canceled'))
    or (old.status = 'past_due' and new.status in ('active', 'canceled'))
  ) then
    raise exception 'invalid purchased capacity state transition: % -> %',
      old.status, new.status using errcode = '22000';
  end if;

  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists protect_workspace_purchased_capacity_update_trigger
  on public.workspace_purchased_capacity;
create trigger protect_workspace_purchased_capacity_update_trigger
before update on public.workspace_purchased_capacity
for each row execute function public.protect_workspace_purchased_capacity();

drop trigger if exists protect_workspace_purchased_capacity_delete_trigger
  on public.workspace_purchased_capacity;
create trigger protect_workspace_purchased_capacity_delete_trigger
before delete on public.workspace_purchased_capacity
for each row execute function public.protect_workspace_purchased_capacity();

revoke all on function public.protect_workspace_purchased_capacity()
  from public, anon, authenticated;

-- The single definition of "how much capacity has this workspace bought".
--
-- A function rather than a subquery in each caller: the crew seat gate computes
-- its plan limit in two byte-identical blocks already, and a second copy of this
-- sum would give create and reactivate a third way to disagree.
--
-- STABLE, not IMMUTABLE: it reads a table. Callers that need the value to hold
-- for the rest of their transaction take the entitlement row FOR UPDATE first,
-- which is the lock the seat gates already use.
create or replace function public.workspace_purchased_capacity_units(
  p_account_id uuid,
  p_resource_code text
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  -- Bare coalesce on purpose: it is a grammar construct, not a function, so
  -- pg_catalog.coalesce(...) does not exist and would fail at runtime rather
  -- than at parse time. Same trap as nullif. pg_catalog.sum IS a real aggregate.
  select coalesce(pg_catalog.sum(c.units), 0)::bigint
    from public.workspace_purchased_capacity c
   where c.account_id = p_account_id
     and c.resource_code = p_resource_code
     and c.status in ('active', 'past_due');
$$;

comment on function public.workspace_purchased_capacity_units(uuid, text) is
  'Purchased capacity currently counted for a workspace. past_due counts, mirroring the grace the base plan already gives a failed renewal; only canceled stops counting.';

revoke all on function public.workspace_purchased_capacity_units(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.workspace_purchased_capacity_units(uuid, text)
  to service_role;

commit;

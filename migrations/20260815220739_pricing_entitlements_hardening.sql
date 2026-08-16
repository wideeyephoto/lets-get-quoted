-- Harden the pricing-entitlement foundation after validating it against a
-- legacy Supabase project whose default privileges predate opt-in Data API
-- exposure.

begin;

-- GRANT is additive. Remove any legacy default service_role privileges before
-- rebuilding the exact backend surface intended by the foundation migration.
revoke all on table public.billing_subscriptions from service_role;
revoke all on table public.workspace_entitlements from service_role;
revoke all on table public.billing_events from service_role;
revoke all on table public.billing_payment_operations from service_role;
revoke all on table public.usage_credit_lots from service_role;
revoke all on table public.usage_reservations from service_role;
revoke all on table public.usage_reservation_allocations from service_role;
revoke all on table public.workspace_usage_credit_balances from service_role;

grant select, insert, update on table public.billing_subscriptions to service_role;
grant select, insert, update on table public.workspace_entitlements to service_role;
grant select, insert, update on table public.billing_events to service_role;
grant select, insert, update on table public.billing_payment_operations to service_role;
grant select on table public.usage_credit_lots to service_role;
grant select on table public.usage_reservations to service_role;
grant select on table public.usage_reservation_allocations to service_role;
grant select on table public.workspace_usage_credit_balances to service_role;

-- A provider object may reconcile to only one LGQ payment in its connected
-- account. These indexes also make accidental double refunds/counting fail
-- closed at the database boundary.
create unique index if not exists payments_stripe_account_charge_unique
  on public.payments (stripe_account_id, stripe_charge_id)
  where stripe_account_id is not null and stripe_charge_id is not null;
create unique index if not exists payments_stripe_account_intent_unique
  on public.payments (stripe_account_id, stripe_payment_intent)
  where stripe_account_id is not null and stripe_payment_intent is not null;
create unique index if not exists payments_stripe_account_session_unique
  on public.payments (stripe_account_id, stripe_checkout_session)
  where stripe_account_id is not null and stripe_checkout_session is not null;

-- A durable operation must use the same connected account as its payment.
-- The original two-column FK proved the workspace but not the Stripe scope.
do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.payments'::pg_catalog.regclass
       and conname = 'payments_id_account_stripe_account_unique'
  ) then
    alter table public.payments
      add constraint payments_id_account_stripe_account_unique
      unique (id, account_id, stripe_account_id);
  end if;
end
$$;

alter table public.billing_payment_operations
  drop constraint if exists billing_payment_operations_payment_fk;
alter table public.billing_payment_operations
  add constraint billing_payment_operations_payment_fk
  foreign key (payment_id, account_id, stripe_account_id)
  references public.payments(id, account_id, stripe_account_id)
  on delete restrict;

-- NULL is not a valid batch size. PostgreSQL treats LIMIT NULL as unlimited,
-- which would defeat the bounded expiration-worker contract.
create or replace function public.expire_usage_reservations(p_limit integer default 250)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_reservation record;
  v_allocation record;
  v_updated integer;
  v_expired integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'expiration batch limit must be between 1 and 1000' using errcode = '22023';
  end if;

  for v_reservation in
    select r.id, r.account_id, r.resource_code
      from public.usage_reservations r
     where r.state = 'reserved' and r.expires_at <= pg_catalog.now()
     order by
       pg_catalog.hashtextextended(r.account_id::text || ':' || r.resource_code, 0),
       r.account_id,
       r.resource_code,
       r.expires_at,
       r.id
     limit p_limit
     for update skip locked
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_reservation.account_id::text || ':' || v_reservation.resource_code, 0)
    );

    for v_allocation in
      select a.credit_lot_id, a.units
        from public.usage_reservation_allocations a
       where a.reservation_id = v_reservation.id
       order by a.credit_lot_id
    loop
      update public.usage_credit_lots l
         set reserved_units = l.reserved_units - v_allocation.units
       where l.id = v_allocation.credit_lot_id
         and l.account_id = v_reservation.account_id
         and l.reserved_units >= v_allocation.units;
      get diagnostics v_updated = row_count;
      if v_updated <> 1 then
        raise exception 'usage credit reservation invariant failed in expiration sweep' using errcode = 'P0001';
      end if;
    end loop;

    update public.usage_reservations
       set state = 'expired', released_at = pg_catalog.now(),
           finalization_key = 'system-expiry:' || v_reservation.id::text,
           release_reason = 'reservation_expired'
     where id = v_reservation.id and state = 'reserved';
    get diagnostics v_updated = row_count;
    v_expired := v_expired + v_updated;
  end loop;

  return v_expired;
end;
$$;

revoke all on function public.expire_usage_reservations(integer) from service_role;
grant execute on function public.expire_usage_reservations(integer) to service_role;

commit;

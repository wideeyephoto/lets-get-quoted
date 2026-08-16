-- Cover the new foreign-key lookup paths identified by the staging database
-- advisor. These indexes protect delete/update checks and reconciliation joins
-- as the billing ledgers grow.

begin;

create index if not exists billing_events_subscription_idx
  on public.billing_events (billing_subscription_id)
  where billing_subscription_id is not null;

create index if not exists billing_payment_operations_payment_scope_idx
  on public.billing_payment_operations (
    payment_id, account_id, stripe_account_id, charge_model
  );

create index if not exists payments_account_stripe_scope_idx
  on public.payments (account_id, stripe_account_id);

create index if not exists usage_reservation_allocations_lot_account_idx
  on public.usage_reservation_allocations (credit_lot_id, account_id);

create index if not exists usage_reservation_allocations_reservation_account_idx
  on public.usage_reservation_allocations (reservation_id, account_id);

commit;

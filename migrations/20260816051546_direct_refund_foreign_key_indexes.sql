-- Cover every composite direct-refund foreign key in declared column order.
-- This is a follow-up to the already-applied refund foundation migration.

begin;

create index if not exists billing_direct_refund_authorizations_payment_scope_idx
  on public.billing_direct_refund_authorizations (
    payment_id,
    account_id,
    stripe_account_id,
    livemode,
    charge_model
  );

create index if not exists billing_direct_refund_operations_authorization_scope_idx
  on public.billing_direct_refund_operations (
    authorization_id,
    account_id,
    payment_id,
    stripe_account_id,
    livemode,
    charge_model
  );

create index if not exists billing_direct_refund_operations_operation_scope_idx
  on public.billing_direct_refund_operations (
    operation_pk,
    account_id,
    payment_id,
    stripe_account_id,
    livemode,
    charge_model
  );

commit;

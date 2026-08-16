-- Cover the two composite Customer foreign keys introduced by the dark Stripe
-- Billing subscription Checkout foundation. PostgreSQL does not create indexes
-- on referencing columns automatically; without these, a future Customer
-- identity update/delete check would scan the child ledgers.

begin;

create index if not exists billing_subscription_checkout_customer_mode_fk_idx
  on public.billing_subscription_checkout_operations (
    account_id, livemode, provider_customer_id
  );

create index if not exists billing_subscriptions_customer_mode_fk_idx
  on public.billing_subscriptions (
    account_id, provider, livemode, provider_customer_id
  );

commit;

-- Rollback:
--   begin;
--   drop index if exists public.billing_subscriptions_customer_mode_fk_idx;
--   drop index if exists public.billing_subscription_checkout_customer_mode_fk_idx;
--   commit;

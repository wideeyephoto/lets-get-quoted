CREATE OR REPLACE FUNCTION public.resolve_stripe_billing_subscription_projection_binding_v1_unche(p_billing_event_id uuid, p_claim_token uuid, p_account_id uuid, p_operation_id text, p_provider_customer_id text, p_provider_subscription_id text, p_provider_price_id text)
 RETURNS TABLE(operation_pk uuid, operation_state text, workspace_id uuid, operation_id text, checkout_session_id text, plan_code text, billing_interval text, catalog_version text, livemode boolean, price_id text, product_id text, currency text, unit_amount_cents bigint, terms_version text, recurring_consent_version text, recurring_consent_text_sha256 text, recurring_consent_acceptance_id uuid, checkout_expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
 SET "TimeZone" TO 'UTC'
AS $function$
declare
  v_event public.billing_events%rowtype;
  v_operation public.billing_subscription_checkout_operations%rowtype;
  v_subscription public.billing_subscriptions%rowtype;
begin
  if p_claim_token is null
     or p_account_id is null
     or p_operation_id is null
     or pg_catalog.length(pg_catalog.btrim(p_operation_id)) not between 1 and 200
     or p_operation_id ~ '[[:cntrl:]]'
     or p_provider_customer_id is null
     or p_provider_customer_id !~ '^cus_[A-Za-z0-9]{8,}$'
     or p_provider_subscription_id is null
     or p_provider_subscription_id !~ '^sub_[A-Za-z0-9]{8,}$'
     or p_provider_price_id is null
     or p_provider_price_id !~ '^price_[A-Za-z0-9]{8,}$' then
    raise exception 'Stripe Billing projection binding input is invalid'
      using errcode = '22023';
  end if;

  select e.*
    into v_event
    from public.billing_events e
   where e.id = p_billing_event_id
   for update;
  if not found
     or v_event.event_scope <> 'platform_subscription'
     or v_event.processing_status <> 'processing'
     or v_event.projection_claim_token is distinct from p_claim_token
     or v_event.projection_lease_expires_at <= pg_catalog.now() then
    raise exception 'Stripe Billing event projection claim is not owned or expired'
      using errcode = '55000';
  end if;

  perform 1
    from public.accounts a
   where a.id = p_account_id
   for share;
  if not found then
    raise exception 'Stripe Billing projection workspace was not found'
      using errcode = 'P0002';
  end if;

  select o.*
    into v_operation
    from public.billing_subscription_checkout_operations o
   where o.account_id = p_account_id
     and o.operation_id = pg_catalog.btrim(p_operation_id)
   for share;
  if not found
     or v_operation.state not in (
       'checkout_created', 'indeterminate', 'activated', 'expired', 'canceled'
     )
     or v_operation.livemode is distinct from v_event.livemode
     or v_operation.stripe_price_id is distinct from p_provider_price_id
     or (
       v_operation.provider_customer_id is not null
       and v_operation.provider_customer_id is distinct from p_provider_customer_id
     )
     or v_operation.checkout_expires_at is null then
    raise exception 'Stripe Billing provider metadata does not bind to one Checkout operation'
      using errcode = '22000';
  end if;

  select s.*
    into v_subscription
    from public.billing_subscriptions s
   where s.provider = 'stripe'
     and s.livemode = v_event.livemode
     and s.provider_subscription_id = p_provider_subscription_id
   for share;
  if found and (
    v_subscription.account_id is distinct from p_account_id
    or v_subscription.provider_customer_id is distinct from p_provider_customer_id
    or v_subscription.provider_price_id is distinct from p_provider_price_id
  ) then
    raise exception 'Stripe Billing subscription identity is already bound differently'
      using errcode = '23505';
  end if;

  return query select
    v_operation.id,
    v_operation.state,
    v_operation.account_id,
    v_operation.operation_id,
    v_operation.provider_object_id,
    v_operation.plan_code,
    v_operation.billing_interval,
    v_operation.catalog_version,
    v_operation.livemode,
    v_operation.stripe_price_id,
    v_operation.stripe_product_id,
    v_operation.currency,
    v_operation.unit_amount_cents,
    v_operation.terms_version,
    v_operation.recurring_consent_version,
    v_operation.recurring_consent_text_sha256,
    v_operation.recurring_consent_acceptance_id,
    v_operation.checkout_expires_at;
end;
$function$

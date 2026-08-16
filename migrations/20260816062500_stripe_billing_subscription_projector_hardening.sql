-- Post-application hardening for the dark Stripe Billing subscription projector.
--
-- The base projector was already present on staging when these fail-closed
-- guards were added. Keep the deployed v1 implementations private, wrap their
-- stable RPC names with explicit NULL rejection, and pin every projector RPC to
-- UTC so session timezone cannot change month/timestamp behavior.

begin;

alter function public.claim_stripe_billing_subscription_event(uuid)
  set timezone to 'UTC';
alter function public.fail_stripe_billing_subscription_event(
  uuid, uuid, text, boolean, timestamptz
) set timezone to 'UTC';

alter function public.resolve_stripe_billing_subscription_projection_binding(
  uuid, uuid, uuid, text, text, text, text
) rename to resolve_stripe_billing_subscription_projection_binding_v1_unchecked;
alter function public.resolve_stripe_billing_subscription_projection_binding_v1_unchecked(
  uuid, uuid, uuid, text, text, text, text
) set timezone to 'UTC';
revoke all on function public.resolve_stripe_billing_subscription_projection_binding_v1_unchecked(
  uuid, uuid, uuid, text, text, text, text
) from public, anon, authenticated, service_role;

create function public.resolve_stripe_billing_subscription_projection_binding(
  p_billing_event_id uuid,
  p_claim_token uuid,
  p_account_id uuid,
  p_operation_id text,
  p_provider_customer_id text,
  p_provider_subscription_id text,
  p_provider_price_id text
)
returns table (
  operation_pk uuid,
  operation_state text,
  workspace_id uuid,
  operation_id text,
  checkout_session_id text,
  plan_code text,
  billing_interval text,
  catalog_version text,
  livemode boolean,
  price_id text,
  product_id text,
  currency text,
  unit_amount_cents bigint,
  terms_version text,
  recurring_consent_version text,
  recurring_consent_text_sha256 text,
  recurring_consent_acceptance_id uuid,
  checkout_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
begin
  if p_billing_event_id is null
     or p_claim_token is null
     or p_account_id is null
     or p_operation_id is null
     or p_provider_customer_id is null
     or p_provider_subscription_id is null
     or p_provider_price_id is null then
    raise exception 'Stripe Billing projection binding input is invalid'
      using errcode = '22023';
  end if;

  return query
  select *
    from public.resolve_stripe_billing_subscription_projection_binding_v1_unchecked(
      p_billing_event_id,
      p_claim_token,
      p_account_id,
      p_operation_id,
      p_provider_customer_id,
      p_provider_subscription_id,
      p_provider_price_id
    );
end;
$$;

revoke all on function public.resolve_stripe_billing_subscription_projection_binding(
  uuid, uuid, uuid, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.resolve_stripe_billing_subscription_projection_binding(
  uuid, uuid, uuid, text, text, text, text
) to service_role;

alter function public.project_stripe_billing_subscription_event(uuid, uuid, jsonb)
  rename to project_stripe_billing_subscription_event_v1_unchecked;
alter function public.project_stripe_billing_subscription_event_v1_unchecked(uuid, uuid, jsonb)
  set timezone to 'UTC';
revoke all on function public.project_stripe_billing_subscription_event_v1_unchecked(
  uuid, uuid, jsonb
) from public, anon, authenticated, service_role;

create function public.project_stripe_billing_subscription_event(
  p_billing_event_id uuid,
  p_claim_token uuid,
  p_projection jsonb
)
returns table (
  processing_status text,
  billing_subscription_id uuid,
  workspace_id uuid,
  projection_applied boolean,
  allowances_granted boolean
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
begin
  if p_billing_event_id is null
     or p_claim_token is null
     or p_projection is null
     or pg_catalog.jsonb_typeof(p_projection) <> 'object'
     or p_projection ->> 'schema' is null
     or p_projection ->> 'provider_event_id' is null
     or p_projection ->> 'event_type' is null
     or p_projection ->> 'event_created_at' is null
     or p_projection ->> 'event_object_id' is null
     or p_projection ->> 'workspace_id' is null
     or p_projection ->> 'operation_id' is null
     or p_projection ->> 'checkout_session_id' is null
     or p_projection ->> 'customer_id' is null
     or p_projection ->> 'subscription_id' is null
     or p_projection ->> 'subscription_item_id' is null
     or p_projection ->> 'price_id' is null
     or p_projection ->> 'product_id' is null
     or p_projection ->> 'plan_code' is null
     or p_projection ->> 'billing_interval' is null
     or p_projection ->> 'catalog_version' is null
     or p_projection ->> 'currency' is null
     or p_projection ->> 'unit_amount_cents' is null
     or p_projection ->> 'platform_fee_bps' is null
     or p_projection ->> 'subscription_status' is null
     or p_projection ->> 'period_start' is null
     or p_projection ->> 'period_end' is null
     or p_projection ->> 'cancel_at_period_end' is null
     or p_projection ->> 'payment_evidence_kind' is null
     or p_projection ->> 'allowance_start' is null
     or p_projection ->> 'allowance_end' is null
     or p_projection -> 'feature_limits' is null
     or p_projection -> 'feature_limits' = 'null'::jsonb
     or p_projection -> 'feature_flags' is null
     or p_projection -> 'feature_flags' = 'null'::jsonb
     or p_projection ->> 'terms_version' is null
     or p_projection ->> 'recurring_consent_version' is null
     or p_projection ->> 'recurring_consent_text_sha256' is null
     or p_projection ->> 'recurring_consent_acceptance_id' is null then
    raise exception 'Stripe Billing projection contract has a NULL required field'
      using errcode = '22023';
  end if;

  return query
  select *
    from public.project_stripe_billing_subscription_event_v1_unchecked(
      p_billing_event_id,
      p_claim_token,
      p_projection
    );
end;
$$;

revoke all on function public.project_stripe_billing_subscription_event(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.project_stripe_billing_subscription_event(uuid, uuid, jsonb)
  to service_role;

comment on function public.project_stripe_billing_subscription_event(uuid, uuid, jsonb) is
  'Dark NULL-safe PII-free Stripe Billing projector wrapper; no active caller exists.';

commit;

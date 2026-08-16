import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(new URL(
  '../migrations/20260816060000_stripe_billing_subscription_event_projection.sql',
  import.meta.url,
));
const sql = readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase();
const compact = sql.replace(/\s+/g, ' ');
const inboxSql = readFileSync(fileURLToPath(new URL(
  '../migrations/20260815231620_stripe_event_inbox.sql',
  import.meta.url,
)), 'utf8').replace(/\r\n/g, '\n').toLowerCase();
const inboxCompact = inboxSql.replace(/\s+/g, ' ');

describe('dark Stripe Billing subscription event projection migration', () => {
  it('claims redacted signed-inbox rows durably and never stores provider payloads', () => {
    expect(compact).toContain('create function public.claim_stripe_billing_subscription_event');
    expect(compact).toContain("v_event.event_scope <> 'platform_subscription'");
    expect(compact).toContain("v_event.payload #>> '{schema}' <> 'lgq.stripe-event-inbox.v1'");
    expect(compact).toContain("projection_lease_expires_at = pg_catalog.now() + interval '5 minutes'");
    expect(compact).toContain("v_event.processing_status in ('processed', 'ignored')");
    expect(compact).toContain("v_event.processing_status = 'failed' and v_event.next_attempt_at is null");
    expect(compact).toContain("p_projection - array[");
    expect(compact).toContain("<> '{}'::jsonb");
    expect(compact).not.toContain('customer_email');
    expect(compact).not.toContain('client_secret');
    expect(compact).not.toContain('payment_method');
  });

  it('binds mode, Price, catalog, consent evidence, and one immutable Checkout operation', () => {
    expect(compact).toContain('create function public.resolve_stripe_billing_subscription_projection_binding');
    expect(compact).toContain("v_operation.livemode is distinct from v_event.livemode");
    expect(compact).toContain('v_operation.stripe_price_id is distinct from p_provider_price_id');
    expect(compact).toContain('v_operation.recurring_consent_acceptance_id');
    expect(compact).toContain('v_operation.recurring_consent_text_sha256');
    expect(compact).toContain("v_recurring_consent_version <> 'base-plan-recurring-2026-08-16'");
    expect(compact).toContain(
      "v_recurring_consent_text_sha256 <> 'f39aeedb379d397f941d3c5fc48357703b4cc97148d8b1bb3c2f55b04e449c75'",
    );
    expect(compact).toContain("v_catalog_version <> '2026-08-15-preview'");
    expect(compact).toContain("v_currency <> 'usd'");
    expect(compact).toContain("v_event.livemode and v_checkout_session_id !~ '^cs_live_'");
    expect(compact).toContain("not v_event.livemode and v_checkout_session_id !~ '^cs_test_'");
  });

  it('ignores older provider timestamps and safely re-projects equal-second current truth', () => {
    expect(compact).toContain('provider_state_event_created_at timestamptz');
    expect(compact).toContain('latest_invoice_event_created_at timestamptz');
    expect(compact).toContain('v_event_created_at >= v_subscription.provider_state_event_created_at');
    expect(compact).toContain('v_event_created_at >= v_subscription.latest_invoice_event_created_at');
    expect(sql).toMatch(/stripe event\.created has only second precision[\s\S]{0,100}event ids are not[\s\S]{0,30}chronological/);
    expect(compact).toContain("else 'out_of_order_ignored'");
    expect(compact).toContain("processing_status = case when v_state_applied or v_invoice_applied then 'processed' else 'ignored' end");
  });

  it('grants one idempotent monthly window even when the payment cadence is annual', () => {
    expect(compact).toContain("v_allowance_end is distinct from least( v_period_end, v_period_start + interval '1 month' )");
    expect(compact).toContain("pg_catalog.date_part('epoch', v_allowance_start)::bigint::text");
    expect(compact).not.toContain('pg_catalog.extract');
    expect(compact).not.toContain('pg_catalog.least');
    expect(compact).toContain('next_allowance_reset_at = case');
    expect(compact).toContain("'plan-period:' || v_catalog_version || ':' || v_subscription_id || ':'");
    expect(compact).toContain("on conflict (account_id, resource_code, idempotency_key) do nothing");
    expect(compact).toContain("'text_segments'::text, case v_plan_code when 'solo' then 500");
    expect(compact).toContain("'ai_intake_threads'::text, case v_plan_code when 'solo' then 250");
    expect(compact).not.toMatch(/(?:units|granted_units)\s*\*\s*12/);
    expect(compact).not.toContain("interval '1 year'");
    expect(compact).toContain('annual billing changes payment cadence only');
  });

  it('does not double-grant on duplicate or out-of-order invoice projections', () => {
    expect(compact).toContain('on conflict (account_id, resource_code, idempotency_key) do nothing');
    expect(compact).toContain('v_allowance_start >= v_entitlement.next_allowance_reset_at');
    expect(compact).toContain('select l.* into v_existing_lot');
    expect(compact).toContain('monthly allowance idempotency binding is inconsistent');
    expect(compact).toContain('v_state_applied or v_invoice_applied');
  });

  it('does not treat the historical Checkout payment as payment for a later renewal', () => {
    expect(compact).toContain("v_operation_was_activated := v_operation.state = 'activated'");
    expect(compact).toContain(
      "v_payment_evidence = 'invoice_paid' or ( not v_operation_was_activated and v_payment_evidence = 'checkout_session_paid' )",
    );
    // A subscription.updated can advance the provider period, but once the
    // operation was already activated it cannot grant that period. The later
    // invoice.paid path is the only renewal evidence and remains idempotent.
    expect(compact).toContain("v_payment_evidence = 'invoice_paid'");
    expect(compact).toContain('v_allowance_start >= v_entitlement.next_allowance_reset_at');
    expect(compact).toContain('on conflict (account_id, resource_code, idempotency_key) do nothing');
  });

  it('models failed, uncollectible, voided, cancel-at-period-end, and deletion explicitly', () => {
    expect(compact).toContain("v_subscription.latest_invoice_event_type in ( 'invoice.payment_failed', 'invoice.payment_action_required' )");
    expect(compact).toContain("when v_subscription.latest_invoice_status = 'uncollectible' then 'unpaid'");
    // A voided invoice does not itself cancel service; the freshly retrieved
    // Subscription status remains authoritative.
    expect(compact).not.toMatch(/v_event_type\s*=\s*'invoice\.voided'[\s\S]{0,100}then\s+'canceled'/);
    // cancel_at_period_end is recorded while status=active; only the provider's
    // later canceled/deleted snapshot restricts the entitlement.
    expect(compact).toContain('cancel_at_period_end = v_cancel_at_period_end');
    expect(compact).toContain("when 'canceled' then 'canceled'");
    expect(compact).toContain("when v_entitlement_billing_status = 'active' then 'active'");
    expect(compact).toContain("when v_entitlement_billing_status = 'past_due' then 'grace'");
    expect(compact).toContain("else 'restricted'");
    expect(compact).toContain('cannot clear a still-open failed invoice by omitting invoice context');
  });

  it('preserves open-invoice failure grace until invoice truth resolves it', () => {
    expect(compact).toContain('if v_was_activated and (v_state_applied or v_invoice_applied) then');
    expect(compact).toContain("case v_subscription.status when 'incomplete' then 'incomplete'");
    expect(compact).toContain(
      "v_subscription.latest_invoice_event_type in ( 'invoice.payment_failed', 'invoice.payment_action_required' ) and v_subscription.latest_invoice_status = 'open' then 'past_due'",
    );
    expect(compact).toContain(
      "when v_invoice_status = 'open' and s.latest_invoice_id = v_invoice_id and s.latest_invoice_status = 'open'",
    );
    expect(compact).toContain('then s.latest_invoice_event_type else v_event_type');
    expect(compact).toContain("v_subscription.latest_invoice_status = 'uncollectible'");
    expect(compact).not.toContain(
      "v_subscription.latest_invoice_event_type = 'invoice.marked_uncollectible' and v_subscription.latest_invoice_status = 'uncollectible'",
    );
    expect(compact).toContain('effective_at = greatest(e.effective_at, v_event_created_at)');
  });

  it('activates only from paid active truth and keeps direct writes revoked', () => {
    expect(compact).toContain("v_can_activate := v_subscription_status = 'active' and v_payment_evidence in ('checkout_session_paid', 'invoice_paid')");
    expect(compact).toContain("set state = 'activated'");
    expect(compact).toContain("elsif v_subscription_status = 'incomplete_expired'");
    expect(compact).toContain("elsif v_subscription_status = 'canceled'");
    expect(compact).toContain('revoke all on table public.billing_subscriptions from public, anon, authenticated, service_role');
    expect(compact).toContain('grant select on table public.billing_subscriptions to service_role');
    expect(compact).toContain('revoke all on table public.billing_events from public, anon, authenticated, service_role');
    for (const rpc of [
      'claim_stripe_billing_subscription_event',
      'resolve_stripe_billing_subscription_projection_binding',
      'project_stripe_billing_subscription_event',
      'fail_stripe_billing_subscription_event',
    ]) {
      expect(compact).toContain(`grant execute on function public.${rpc}`);
    }
  });

  it('keeps inbox ingestion compatible through its existing security-definer RPC', () => {
    expect(inboxCompact).toContain('create or replace function public.ingest_stripe_event_inbox');
    expect(inboxSql).toMatch(/create or replace function public\.ingest_stripe_event_inbox[\s\S]*?security definer[\s\S]*?set search_path = pg_catalog, pg_temp/);
    expect(inboxCompact).toContain('grant execute on function public.ingest_stripe_event_inbox');
    expect(compact).toContain('revoke all on table public.billing_events from public, anon, authenticated, service_role');
    expect(compact).toContain('grant select on table public.billing_events to service_role');
  });
});

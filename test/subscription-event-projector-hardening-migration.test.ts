import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const baseSql = readFileSync(fileURLToPath(new URL(
  '../migrations/20260816060000_stripe_billing_subscription_event_projection.sql',
  import.meta.url,
)), 'utf8').replace(/\r\n/g, '\n').toLowerCase();
const baseCompact = baseSql.replace(/\s+/g, ' ');

const followUpSql = readFileSync(fileURLToPath(new URL(
  '../migrations/20260816062500_stripe_billing_subscription_projector_hardening.sql',
  import.meta.url,
)), 'utf8').replace(/\r\n/g, '\n').toLowerCase();
const followUpCompact = followUpSql.replace(/\s+/g, ' ');

describe('Stripe Billing subscription projector hardening migrations', () => {
  it('makes fresh installs reject NULL required provider and allowance fields', () => {
    for (const requiredGuard of [
      'v_checkout_session_id is null',
      'v_subscription_item_id is null',
      'v_period_start is null',
      'v_period_end is null',
      'v_allowance_start is null',
      'v_allowance_end is null',
      'v_recurring_consent_acceptance_id is null',
    ]) {
      expect(baseCompact).toContain(requiredGuard);
    }
    expect(baseCompact).toContain('p_provider_customer_id is null');
    expect(baseCompact).toContain('p_provider_subscription_id is null');
    expect(baseCompact).toContain('p_provider_price_id is null');
  });

  it('pins every base projector RPC to UTC', () => {
    expect(baseSql.match(/set timezone to 'utc'/g)).toHaveLength(4);
  });

  it('hardens an already-applied projector without exposing its old bodies', () => {
    expect(followUpCompact).toContain(
      'rename to resolve_stripe_billing_subscription_projection_binding_v1_unchecked',
    );
    expect(followUpCompact).toContain(
      'rename to project_stripe_billing_subscription_event_v1_unchecked',
    );
    for (const privateBody of [
      'resolve_stripe_billing_subscription_projection_binding_v1_unchecked',
      'project_stripe_billing_subscription_event_v1_unchecked',
    ]) {
      expect(followUpCompact).toContain(
        `revoke all on function public.${privateBody}`,
      );
      expect(followUpCompact).not.toContain(
        `grant execute on function public.${privateBody}`,
      );
    }
    expect(followUpCompact).toContain(
      'grant execute on function public.resolve_stripe_billing_subscription_projection_binding',
    );
    expect(followUpCompact).toContain(
      'grant execute on function public.project_stripe_billing_subscription_event',
    );
  });

  it('puts explicit NULL guards and UTC on the stable deployed RPC signatures', () => {
    expect(followUpSql.match(/set timezone to 'utc'/g)).toHaveLength(6);
    for (const requiredJsonField of [
      'checkout_session_id',
      'subscription_item_id',
      'period_start',
      'period_end',
      'allowance_start',
      'allowance_end',
      'recurring_consent_acceptance_id',
    ]) {
      expect(followUpCompact).toContain(`p_projection ->> '${requiredJsonField}' is null`);
    }
    expect(followUpCompact).toContain("p_projection ->> 'schema' is null");
    expect(followUpCompact).toContain("p_projection -> 'feature_limits' = 'null'::jsonb");
    expect(followUpCompact).toContain("p_projection -> 'feature_flags' = 'null'::jsonb");
  });
});

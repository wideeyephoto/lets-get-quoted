import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PLATFORM_TOP_UP_EVENT_TYPES } from '@/lib/billing/stripe-event-inbox';
import {
  PLATFORM_TOP_UP_PROJECTION_SCHEMA,
  TOP_UP_LOT_SOURCE_TYPE,
} from '@/lib/billing/top-up-event-projector';

const MIGRATION_FILE = '20260818160000_top_up_projection_shape.sql';
const sql = readFileSync(join(process.cwd(), 'migrations', MIGRATION_FILE), 'utf8')
  .replace(/\r\n/g, '\n');

const compact = sql.replace(/\s+/g, ' ').toLowerCase();

function functionDefinition(name: string): string {
  const start = compact.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} must be defined`).toBeGreaterThanOrEqual(0);
  const next = compact.indexOf('create or replace function public.', start + 1);
  return compact.slice(start, next < 0 ? compact.length : next);
}

/** Every result literal this migration introduces, and the status it belongs to. */
const GRANTING_RESULTS = [
  'top_up_credits_granted',
  'top_up_credits_already_granted',
] as const;

const NON_GRANTING_RESULTS = [
  'top_up_awaiting_async_payment',
  'top_up_payment_failed',
  'top_up_checkout_expired',
  'top_up_not_a_purchase',
  'top_up_fulfillment_withheld',
  'top_up_capacity_fulfillment_deferred',
] as const;

describe('the top-up projection shape', () => {
  it('is one exact timestamped, transactional migration ordered after the receipt scope', () => {
    expect(MIGRATION_FILE).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    expect(MIGRATION_FILE > '20260818140000_top_up_receipt_scope.sql').toBe(true);
    expect(compact.startsWith('-- let a received top-up become credit.')).toBe(true);
    expect(compact).toContain('begin;');
    expect(compact.trimEnd().endsWith('commit;')).toBe(true);
  });

  it('extends the constraints from their own live text instead of retyping them', () => {
    // Two of these are hundreds of characters of nested boolean logic. Retyping
    // one to add a branch is how a subtle inversion gets introduced.
    expect(compact).toContain('pg_get_constraintdef');
    expect(compact).toContain('or %s');
    expect(compact).toContain("body := pg_catalog.substr(body, 8, pg_catalog.length(body) - 8)");
    // It must never rewrite a scope it does not own.
    expect(compact).not.toMatch(/add constraint billing_events_projection_terminal_shape_check check \(\s*\(\s*event_scope/);
  });

  it('appends only once, so a second apply cannot double the branch', () => {
    expect(compact).toContain('if pg_catalog.strpos(body, spec.marker) > 0 then continue;');
  });

  it('admits the projected shape it was written to allow', () => {
    expect(compact).toContain(`'${PLATFORM_TOP_UP_PROJECTION_SCHEMA}'`);
    for (const result of [...GRANTING_RESULTS, ...NON_GRANTING_RESULTS]) {
      expect(compact, `${result} must join the result vocabulary`).toContain(`'${result}'`);
    }
  });

  it('binds every result to the event types that can produce it', () => {
    // A granting result on an expiration, or an expiry result on a completion,
    // is a projector bug that the constraint should refuse rather than store.
    expect(compact).toContain(
      "event_type = 'checkout.session.async_payment_failed' and projection_result = 'top_up_payment_failed'",
    );
    expect(compact).toContain(
      "event_type = 'checkout.session.expired' and projection_result = 'top_up_checkout_expired'",
    );
    expect(compact).toContain(
      "event_type = 'checkout.session.completed' and projection_result = 'top_up_awaiting_async_payment'",
    );
  });

  it('closes the gap the receipt branch left, with a constraint that ands rather than ors', () => {
    // OR only ever widens, so the receipt branch cannot be narrowed by appending
    // to it. A separate constraint ANDs with the others and is the only way to
    // forbid a terminal top-up row that carries no evidence.
    expect(compact).toContain('billing_events_top_up_projection_completeness_check');
    expect(compact).toContain(
      "event_scope <> 'platform_top_up' or processing_status not in ('processed', 'ignored') or processed_at is not null",
    );
  });

  it('refuses to run over a top-up inbox that already has processing history', () => {
    expect(compact).toContain('lock table public.billing_events in share row exclusive mode');
    expect(compact).toContain('top-up inbox contains pre-projector processing history');
  });

  it('does not mistake its own success for that history', () => {
    // The guard asks about the state BEFORE this migration. Once it has run, the
    // projector is live and processing history is exactly what should be there,
    // so re-applying the file must not fail with a message that reads like data
    // corruption. The early return is what makes it re-runnable in every state.
    expect(compact).toContain(
      "select 1 from pg_constraint where conrelid = 'public.billing_events'::regclass"
      + " and conname = 'billing_events_top_up_projection_completeness_check' ) then return;",
    );
  });

  it('proves the outcome rather than assuming it', () => {
    expect(compact).toContain('terminal shape does not admit the top-up projection schema');
    expect(compact).toContain('terminal shape lost an existing scope');
    expect(compact).toContain('result vocabulary lost a literal');
    // The two scopes that already existed must still be named after the rewrite.
    expect(compact).toContain('stripe_subscription_projection_v1');
    expect(compact).toContain('stripe_connected_payment_projection_v1');
    expect(compact).toContain('stripe_connected_checkout_expiration_v1');
  });

  it('grants through grant_usage_credits instead of writing a lot itself', () => {
    const definition = functionDefinition('project_stripe_platform_top_up_event');
    expect(definition).toContain('public.grant_usage_credits(');
    expect(definition).not.toMatch(/insert\s+into\s+public\.usage_credit_lots/);
    expect(definition).toContain(`p_source_type => '${TOP_UP_LOT_SOURCE_TYPE}'`);
    // Purchased credit never expires, and the call site says so.
    expect(definition).toContain('p_expires_at => null');
  });

  it('takes the same advisory lock the grant does, so a replay reads and writes atomically', () => {
    const definition = functionDefinition('project_stripe_platform_top_up_event');
    expect(definition).toContain('pg_catalog.pg_advisory_xact_lock');
    expect(definition).toContain('pg_catalog.hashtextextended(v_account::text || \':\' || v_resource, 0)');
  });

  it('binds the workspace before granting, because the inbox cannot', () => {
    const definition = functionDefinition('project_stripe_platform_top_up_event');
    expect(definition).toContain('set account_id = v_account');
    expect(definition).toContain('top-up projection names a workspace that does not exist');
  });

  it('refuses a projection that names a different Checkout Session', () => {
    const definition = functionDefinition('project_stripe_platform_top_up_event');
    expect(definition).toContain("v_session is distinct from v_event.payload #>> '{data_object,id}'");
  });

  it('verifies the immutable inbox envelope on every claim', () => {
    const definition = functionDefinition('claim_stripe_platform_top_up_event');
    expect(definition).toContain('v_event.payload_sha256 is distinct from v_expected_hash');
    expect(definition).toContain("v_event.payload #>> '{scope}' is distinct from 'platform_top_up'");
    expect(definition).toContain('v_event.provider_account_id is not null');
    for (const type of PLATFORM_TOP_UP_EVENT_TYPES) {
      expect(definition, `${type} must be claimable`).toContain(`'${type}'`);
    }
  });

  it('leaves a failed event with no projection evidence', () => {
    const definition = functionDefinition('fail_stripe_platform_top_up_event');
    expect(definition).toContain('projection_schema_version = null');
    expect(definition).toContain('projection_applied = null');
    expect(definition).toContain('projection_result = null');
    expect(definition).toContain('processed_at = null');
  });

  const privilegedFunctions: Array<[string, string]> = [
    ['claim_stripe_platform_top_up_event', 'uuid'],
    ['project_stripe_platform_top_up_event', 'uuid, uuid, jsonb'],
    ['fail_stripe_platform_top_up_event', 'uuid, uuid, text, boolean, timestamptz'],
  ];

  it.each(privilegedFunctions)('%s is pinned, schema-qualified, and service-role only', (name, signature) => {
    const definition = functionDefinition(name);
    expect(definition).toContain('security definer');
    expect(definition).toContain("set search_path = ''");

    const qualified = `public.${name}(${signature})`;
    expect(compact).toContain(`revoke all on function ${qualified} from public, anon, authenticated, service_role`);
    expect(compact).toContain(`grant execute on function ${qualified} to service_role`);
    expect(compact).not.toContain(`grant execute on function ${qualified} to authenticated`);
  });
});

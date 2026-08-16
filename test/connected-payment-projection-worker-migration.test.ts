import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(new URL(
  '../migrations/20260816090000_stripe_connected_payment_projection_worker.sql',
  import.meta.url,
));
const sql = readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase();
const compact = sql.replace(/\s+/g, ' ');

describe('dark connected-payment projection worker migration', () => {
  it('stays additive and dark while delegating the ordinary claim transition', () => {
    expect(compact.startsWith('-- dark bounded worker selector')).toBe(true);
    expect(compact).toContain(
      'create function public.claim_next_due_stripe_connected_payment_event()',
    );
    expect(compact).toContain(
      'from public.claim_stripe_connected_payment_event(v_event.id) c',
    );
    expect(compact).not.toContain('cron.schedule');
    expect(compact).not.toContain('net.http');
    expect(compact).not.toContain('create policy');
  });

  it('selects only exact LGQ direct card-Checkout success candidates', () => {
    for (const guard of [
      "e.provider = 'stripe'",
      "e.event_scope = 'connected_payment'",
      "e.event_type = 'checkout.session.completed'",
      "e.payload #>> '{scope}' = 'connected_payment'",
      "e.payload #>> '{event,account}' = e.provider_account_id",
      "e.payload #>> '{data_object,object}' = 'checkout.session'",
      "o.operation_type = 'checkout_session.create'",
      "o.charge_model = 'direct'",
      "o.state = 'succeeded'",
      "o.metadata #>> '{schema}' = 'one_off_direct_checkout_v1'",
      "p.charge_model = 'direct'",
      "p.status::text in ('processing', 'paid')",
      'a.stripe_merchant_account_id = e.provider_account_id',
      'a.merchant_livemode = e.livemode',
    ]) {
      expect(compact).toContain(guard);
    }
    for (const unsupported of [
      'checkout.session.expired',
      'charge.refunded',
      'charge.dispute.created',
      'refund.created',
    ]) {
      expect(compact).not.toContain(`e.event_type = '${unsupported}'`);
    }
  });

  it('takes one deterministic JIT lease and leaves terminal or future retries alone', () => {
    expect(compact).toContain(
      'order by e.provider_created_at, e.received_at, e.id limit 1 for update of e skip locked',
    );
    expect(compact).toContain("e.processing_status = 'received'");
    expect(compact).toContain(
      "e.processing_status = 'failed' and e.next_attempt_at is not null and ( e.attempt_count >= 8 or e.next_attempt_at <= pg_catalog.now() )",
    );
    expect(compact).toContain(
      "e.processing_status = 'processing' and e.projection_lease_expires_at is not null and e.projection_lease_expires_at <= pg_catalog.now()",
    );
    expect(compact).not.toMatch(
      /e\.processing_status = 'failed'\s+and e\.next_attempt_at is null/,
    );
  });

  it('durably dead-letters at eight leases without taking another provider claim', () => {
    const limitIndex = compact.indexOf('if v_event.attempt_count >= 8 then');
    const claimIndex = compact.indexOf(
      'from public.claim_stripe_connected_payment_event(v_event.id) c',
    );
    expect(limitIndex).toBeGreaterThan(-1);
    expect(claimIndex).toBeGreaterThan(limitIndex);
    expect(compact).toContain("last_error = 'projection_retry_attempt_limit'");
    expect(compact).toContain('projection_claim_token = null');
    expect(compact).toContain('projection_lease_expires_at = null');
    expect(compact).toContain('next_attempt_at = null');
    expect(compact).toContain("'failed_terminal'::text");
    expect(compact).toContain('v_claim.attempt_count not between 1 and 8');
    expect(compact).toContain(
      "e.processing_status <> 'received' or e.attempt_count < 8",
    );
  });

  it('verifies the payload digest and exposes only service-role execution', () => {
    expect(compact).toContain(
      "extensions.digest(pg_catalog.convert_to(e.payload::text, 'utf8'), 'sha256')",
    );
    expect(compact).toContain(
      'revoke all on function public.claim_next_due_stripe_connected_payment_event() from public, anon, authenticated, service_role',
    );
    expect(compact).toContain(
      'grant execute on function public.claim_next_due_stripe_connected_payment_event() to service_role',
    );
    expect(sql.match(/set search_path = pg_catalog, pg_temp/g)).toHaveLength(1);
    expect(sql.match(/set timezone to 'utc'/g)).toHaveLength(1);
  });

  it('returns only identifiers needed for connected-account projection ownership', () => {
    const signature = compact.match(/returns table \((.*?)\) language plpgsql/)?.[1] ?? '';
    for (const field of [
      'billing_event_id uuid',
      'claim_token uuid',
      'attempt_count integer',
      'provider_event_id text',
      'checkout_session_id text',
      'workspace_id uuid',
      'merchant_account_id text',
      'livemode boolean',
      'provider_created_at timestamptz',
    ]) {
      expect(signature).toContain(field);
    }
    for (const forbidden of [
      'customer_email', 'customer_name', 'phone', 'address', 'client_secret', 'payment_method',
    ]) {
      expect(signature).not.toContain(forbidden);
    }
  });
});

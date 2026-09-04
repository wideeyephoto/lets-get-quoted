import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(new URL(
  '../migrations/20260815231620_stripe_event_inbox.sql',
  import.meta.url,
));
const sql = readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase();
const compact = sql.replace(/\s+/g, ' ');

describe('Stripe event inbox migration', () => {
  it('is isolated, transactional, and refuses to guess scope for historical rows', () => {
    expect(compact).toContain('begin;');
    expect(compact.trimEnd().endsWith('commit;')).toBe(true);
    expect(compact).toContain('add column if not exists event_scope text');
    expect(compact).toContain('where event_scope is null');
    expect(compact).toContain('classify them before applying this migration');
    expect(compact).toContain('alter column event_scope set not null');
  });

  it('persists and freezes an explicit platform-vs-connected scope', () => {
    expect(compact).toContain("event_scope in ('connected_payment', 'platform_subscription')");
    expect(compact).toMatch(/event_scope = 'connected_payment'[\s\S]*account_id is not null[\s\S]*provider_account_id is not null/);
    expect(compact).toMatch(/event_scope = 'platform_subscription'[\s\S]*provider_account_id is null/);
    expect(compact).not.toContain("'top_up_purchase'");
    expect(compact).toContain('billing event scope is immutable');
    expect(compact).toContain('before update of event_scope');
  });

  it('allows only the reviewed payment and subscription event families', () => {
    for (const connectedType of [
      'checkout.session.completed',
      'payment_intent.succeeded',
      'charge.refunded',
      'charge.dispute.created',
      'refund.failed',
    ]) {
      expect(compact).toContain(`'${connectedType}'`);
    }
    for (const platformType of [
      'customer.subscription.created',
      'customer.subscription.deleted',
      'invoice.paid',
      'invoice.payment_failed',
      'invoice.voided',
    ]) {
      expect(compact).toContain(`'${platformType}'`);
    }
    expect(compact).toContain('unsupported stripe payment event type for scope');
    expect(compact).toContain('unsupported platform subscription event type');
    expect(compact).toContain("event_scope = 'connected_payment'");
  });

  it('enforces a minimal canonical envelope rather than retaining the raw Stripe object', () => {
    expect(compact).toContain("'lgq.stripe-event-inbox.v1'");
    expect(compact).toContain("array['schema', 'scope', 'event', 'data_object']");
    expect(compact).toContain("array['id', 'type', 'account', 'livemode', 'api_version', 'created']");
    expect(compact).toContain("array['id', 'object']");
    expect(compact).toContain('raw request bodies and full stripe data.object payloads are intentionally not persisted');
    expect(compact).toContain('payload_sha256 is not null');
    expect(compact).toContain("extensions.digest(pg_catalog.convert_to(p_payload::text, 'utf8'), 'sha256')");
    expect(compact).not.toContain('p_payload_sha256');
  });

  it('resolves exactly one account+mode Merchant mapping in a single transaction', () => {
    expect(compact).toContain('ingest_stripe_event_inbox');
    expect(compact).toContain('a.stripe_merchant_account_id = p_provider_account_id');
    expect(compact).toContain('a.merchant_livemode = p_livemode');
    expect(compact).toContain('order by a.id for key share');
    expect(compact).toContain('cardinality(v_workspace_ids)');
    expect(compact).not.toContain('pg_catalog.coalesce');
    expect(compact).toContain('must map to exactly one workspace merchant account');
    expect(compact).toContain("connected-account payment events require a valid event.account");
    expect(compact).toContain("platform subscription events must not contain event.account");
  });

  it('uses the provider event unique key for insert-or-replay and rejects conflicting replays', () => {
    expect(compact).toContain('on conflict on constraint billing_events_provider_event_unique do nothing');
    expect(compact).toContain("where e.provider = 'stripe'");
    expect(compact).toContain('for update');
    for (const immutableField of [
      'event_type',
      'event_scope',
      'provider_account_id',
      'livemode',
      'api_version',
      'provider_created_at',
      'payload',
    ]) {
      expect(compact).toContain(`v_existing.${immutableField} is distinct from`);
    }
    expect(compact).toContain('v_existing.payload_sha256 is distinct from v_payload_sha256');
    expect(compact).toContain('stripe event id was already received with different immutable input');
    expect(compact).toContain('stripe event id was concurrently received with different immutable input');
  });

  it('removes service-role table insertion and exposes only the narrow RPC', () => {
    expect(compact).toContain('security definer');
    expect(compact).toContain('set search_path = pg_catalog, pg_temp');
    expect(compact).toContain('revoke all on table public.billing_events from public, anon, authenticated, service_role');
    expect(compact).toContain('grant select on table public.billing_events to service_role');
    expect(compact).not.toContain('grant select, update on table public.billing_events to service_role');
    expect(compact).not.toContain('grant select, insert, update on table public.billing_events to service_role');
    expect(compact).toContain('from public, anon, authenticated, service_role');
    expect(compact).toContain('grant execute on function public.ingest_stripe_event_inbox');
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PLATFORM_TOP_UP_EVENT_TYPES } from '@/lib/billing/stripe-event-inbox';

const MIGRATION_FILE = '20260818180000_top_up_projection_worker.sql';
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

const sql = read(`migrations/${MIGRATION_FILE}`);
const compact = sql.replace(/\s+/g, ' ').toLowerCase();

function functionDefinition(name: string): string {
  const start = compact.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} must be defined`).toBeGreaterThanOrEqual(0);
  const next = compact.indexOf('create or replace function public.', start + 1);
  return compact.slice(start, next < 0 ? compact.length : next);
}

describe('the top-up projection worker selector', () => {
  it('is one exact timestamped, transactional migration ordered after the projector', () => {
    expect(MIGRATION_FILE).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    expect(MIGRATION_FILE > '20260818160000_top_up_projection_shape.sql').toBe(true);
    expect(compact.startsWith('-- dark bounded worker selector for platform top-up purchases.')).toBe(true);
    expect(compact).toContain('begin;');
    expect(compact).toContain('commit;');
  });

  it('claims one row at a time, oldest first, without blocking', () => {
    const definition = functionDefinition('claim_next_due_stripe_platform_top_up_event');
    expect(definition).toContain('order by e.provider_created_at, e.received_at, e.id');
    expect(definition).toContain('limit 1');
    expect(definition).toContain('for update of e skip locked');
  });

  it('delegates the claim transition instead of duplicating it', () => {
    // One claim transition and one source of event-contract truth.
    const definition = functionDefinition('claim_next_due_stripe_platform_top_up_event');
    expect(definition).toContain('public.claim_stripe_platform_top_up_event(v_event.id)');
    expect(definition).not.toMatch(/set\s+processing_status\s*=\s*'processing'/);
    expect(definition).toContain('top-up worker selector did not receive an owned claim');
  });

  it('caps provider attempts at eight and dead-letters durably', () => {
    const definition = functionDefinition('claim_next_due_stripe_platform_top_up_event');
    expect(definition).toContain('v_event.attempt_count >= 8');
    expect(definition).toContain("last_error = 'projection_retry_attempt_limit'");
    expect(definition).toContain("'failed_terminal'::text");
    // A dead letter must carry no projection evidence.
    expect(definition).toContain('projection_schema_version = null');
    expect(definition).toContain('projection_result = null');
  });

  it('never converts an impossible received-at-limit row straight to failed', () => {
    // The append-only transition guard forbids received -> failed.
    const definition = functionDefinition('claim_next_due_stripe_platform_top_up_event');
    expect(definition).toContain("(e.processing_status <> 'received' or e.attempt_count < 8)");
  });

  it('re-selects only an expired lease or a due retry', () => {
    const definition = functionDefinition('claim_next_due_stripe_platform_top_up_event');
    expect(definition).toContain('e.projection_lease_expires_at <= pg_catalog.now()');
    expect(definition).toContain('e.next_attempt_at <= pg_catalog.now()');
  });

  it('verifies the immutable envelope before claiming', () => {
    const definition = functionDefinition('claim_next_due_stripe_platform_top_up_event');
    expect(definition).toContain('e.payload_sha256 = pg_catalog.encode(');
    expect(definition).toContain("e.payload #>> '{scope}' = 'platform_top_up'");
    expect(definition).toContain("e.payload #>> '{data_object,object}' = 'checkout.session'");
    for (const type of PLATFORM_TOP_UP_EVENT_TYPES) {
      expect(definition, `${type} must be selectable`).toContain(`'${type}'`);
    }
  });

  it('requires no purchase binding, unlike the connected-payment selector', () => {
    // A base-plan subscription checkout lands on the same endpoint. Refusing to
    // claim it would leave it received forever; it has to be claimed so the
    // projector can terminate it as top_up_not_a_purchase.
    const definition = functionDefinition('claim_next_due_stripe_platform_top_up_event');
    expect(definition).not.toContain('billing_payment_operations');
    expect(definition).not.toContain('public.payments');
    // And the workspace is not resolved yet: the inbox leaves it null on purpose.
    expect(definition).not.toContain('e.account_id is not null');
  });

  it('binds to the platform, never a connected account', () => {
    const definition = functionDefinition('claim_next_due_stripe_platform_top_up_event');
    expect(definition).toContain('e.provider_account_id is null');
    expect(definition).toContain("e.payload #> '{event,account}' = 'null'::jsonb");
  });

  it('indexes exactly the queue it scans', () => {
    expect(compact).toContain('create index if not exists billing_events_top_up_projection_ready_idx');
    expect(compact).toContain("where provider = 'stripe' and event_scope = 'platform_top_up'");
    expect(compact).toContain("processing_status in ('received', 'failed', 'processing')");
  });

  it('is pinned, schema-qualified, and service-role only', () => {
    const definition = functionDefinition('claim_next_due_stripe_platform_top_up_event');
    expect(definition).toContain('security definer');
    expect(definition).toContain("set search_path = ''");
    expect(definition).toContain("set timezone to 'utc'");

    const qualified = 'public.claim_next_due_stripe_platform_top_up_event()';
    expect(compact).toContain(`revoke all on function ${qualified} from public, anon, authenticated, service_role`);
    expect(compact).toContain(`grant execute on function ${qualified} to service_role`);
    expect(compact).not.toContain(`grant execute on function ${qualified} to authenticated`);
  });

  it('proves the outcome rather than assuming it', () => {
    expect(compact).toContain('top-up worker selector was not created');
    expect(compact).toContain('top-up worker selector is reachable by a client role');
  });
});

describe('the top-up projection cron', () => {
  const route = read('src/app/api/cron/top-up-projection/route.ts');
  const vercel = JSON.parse(read('vercel.json')) as { crons: Array<{ path: string; schedule: string }> };

  it('is dark before it reads a secret, a client, or the queue', () => {
    expect(route).toContain('if (!stripeTopUpProjectionWorkerEnabled())');
    // The flag check must precede the authenticated handler.
    expect(route.indexOf('stripeTopUpProjectionWorkerEnabled()'))
      .toBeLessThan(route.indexOf('return authenticatedGET(request)'));
    expect(route).toContain('new NextResponse(null, { status: 404 })');
    expect(route).toContain("export const dynamic = 'force-dynamic'");
    expect(route).toContain("export const runtime = 'nodejs'");
  });

  it('is registered on the same cadence as the other projection workers', () => {
    const paths = vercel.crons.map((cron) => cron.path);
    expect(paths).toContain('/api/cron/top-up-projection');
    const topUp = vercel.crons.find((cron) => cron.path === '/api/cron/top-up-projection');
    const connected = vercel.crons.find((cron) => cron.path === '/api/cron/connected-payment-projection');
    expect(topUp?.schedule).toBe(connected?.schedule);
  });

  it('names the job the same way in the route and the schedule', () => {
    expect(route).toContain("cronRoute('top-up-projection'");
  });
});

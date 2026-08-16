import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(new URL(
  '../migrations/20260816070134_stripe_billing_subscription_projection_worker.sql',
  import.meta.url,
));
const sql = readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase();
const compact = sql.replace(/\s+/g, ' ');

describe('dark Stripe Billing subscription projection worker migration', () => {
  it('stays dark and delegates the one claim transition to the existing RPC', () => {
    expect(compact.startsWith('-- dark bounded worker selector')).toBe(true);
    expect(compact).toContain(
      'create function public.claim_next_due_stripe_billing_subscription_event()',
    );
    expect(compact).toContain(
      'from public.claim_stripe_billing_subscription_event(v_event_id) c',
    );
    expect(compact).not.toContain('cron.schedule');
    expect(compact).not.toContain('net.http');
    expect(compact).not.toContain('create policy');
    expect(compact).not.toMatch(/update public\.billing_events/);
    expect(compact).not.toMatch(/insert into public\.billing_events/);
  });

  it('selects one due event deterministically with non-blocking ownership', () => {
    expect(compact).toContain(
      'order by e.provider_created_at, e.received_at, e.id limit 1 for update of e skip locked',
    );
    expect(compact).toContain("e.processing_status = 'received'");
    expect(compact).toContain(
      "e.processing_status = 'failed' and e.next_attempt_at is not null and e.next_attempt_at <= pg_catalog.now()",
    );
    expect(compact).toContain(
      "e.processing_status = 'processing' and e.projection_lease_expires_at is not null and e.projection_lease_expires_at <= pg_catalog.now()",
    );
    expect(compact).not.toMatch(
      /e\.processing_status = 'failed'\s+and e\.next_attempt_at is null/,
    );
  });

  it('matches the exact redacted platform event and mode contract before claiming', () => {
    for (const guard of [
      "e.provider = 'stripe'",
      "e.event_scope = 'platform_subscription'",
      'e.provider_account_id is null',
      "e.payload #>> '{schema}' = 'lgq.stripe-event-inbox.v1'",
      "e.payload #>> '{scope}' = 'platform_subscription'",
      "e.payload #>> '{event,id}' = e.provider_event_id",
      "e.payload #>> '{event,type}' = e.event_type",
      "e.payload #> '{event,livemode}' = pg_catalog.to_jsonb(e.livemode)",
      "e.payload #>> '{data_object,object}' = 'subscription'",
      "e.payload #>> '{data_object,object}' = 'invoice'",
    ]) {
      expect(compact).toContain(guard);
    }
    expect(compact).toContain("v_claim.claim_status is distinct from 'claimed'");
    expect(compact).toContain('v_claim.billing_event_id is distinct from v_event_id');
    expect(compact).toContain('v_claim.claim_token is null');
  });

  it('uses a partial ready-queue index and service-role-only execution', () => {
    expect(compact).toContain(
      'create index if not exists billing_events_subscription_projection_ready_idx',
    );
    expect(compact).toContain(
      "where provider = 'stripe' and event_scope = 'platform_subscription' and provider_account_id is null and processing_status in ('received', 'failed')",
    );
    expect(compact).toContain(
      'revoke all on function public.claim_next_due_stripe_billing_subscription_event() from public, anon, authenticated, service_role',
    );
    expect(compact).toContain(
      'grant execute on function public.claim_next_due_stripe_billing_subscription_event() to service_role',
    );
    expect(sql.match(/set search_path = pg_catalog, pg_temp/g)).toHaveLength(1);
    expect(sql.match(/set timezone to 'utc'/g)).toHaveLength(1);
  });

  it('returns only PII-free event identity and lease ownership fields', () => {
    const signature = compact.match(
      /returns table \((.*?)\) language plpgsql/,
    )?.[1] ?? '';
    for (const field of [
      'billing_event_id uuid',
      'claim_token uuid',
      'attempt_count integer',
      'provider_event_id text',
      'event_type text',
      'provider_object_id text',
      'provider_object_type text',
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

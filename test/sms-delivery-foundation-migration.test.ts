import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(new URL(
  '../migrations/20260821180506_sms_delivery_foundation.sql',
  import.meta.url,
));
const sql = readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase();
const compact = sql.replace(/\s+/g, ' ');

function definition(name: string): string {
  const start = compact.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} must be defined`).toBeGreaterThanOrEqual(0);
  const next = compact.indexOf('create or replace function public.', start + 1);
  return compact.slice(start, next < 0 ? compact.length : next);
}

function table(name: string): string {
  const start = compact.indexOf(`create table if not exists public.${name} (`);
  expect(start, `${name} must be defined`).toBeGreaterThanOrEqual(0);
  const end = compact.indexOf(');', start);
  return compact.slice(start, end + 2);
}

describe('durable SMS delivery foundation migration', () => {
  it('is transactional, re-runnable, and dark', () => {
    expect(compact.startsWith('-- durable, provider-neutral sms delivery foundation.')).toBe(true);
    expect(compact).toContain('begin;');
    expect(compact.trimEnd().endsWith('commit;')).toBe(true);
    for (const forbidden of [
      'cron.schedule', 'net.http', 'http_post', 'create trigger enqueue_',
      'signalwire.com/api', 'api.twilio.com', 'vercel.json',
    ]) {
      expect(compact).not.toContain(forbidden);
    }
    expect(compact).not.toMatch(/(?<!or replace )create function public\./);
  });

  it('stores only non-secret sender provisioning metadata', () => {
    const sender = table('sms_sender_numbers');
    for (const required of [
      'provider text not null', 'e164_number text not null', 'provider_number_id text',
      'purpose text not null', 'account_id uuid', 'brand_id text', 'campaign_id text',
      'assignment_state text', 'inbound_resource_id text', 'inbound_webhook_url text',
      'provisioning_status text', 'inbound_ready boolean',
    ]) {
      expect(sender).toContain(required);
    }
    for (const secret of ['api_token', 'auth_token', 'signing_key', 'password', 'secret']) {
      expect(sender).not.toContain(secret);
    }
    expect(sender).toContain("purpose = 'contractor_dedicated' and account_id is not null");
    expect(sender).toContain("purpose in ('lgq_shared', 'lgq_dispatch') and account_id is null");
    expect(compact).toContain('sms_sender_numbers_one_active_dedicated_uidx');
  });

  it('extends the ledger with stable identity and monotonic lifecycle evidence', () => {
    for (const required of [
      'provider text', 'sender_number_id uuid', 'idempotency_key text',
      'message_kind text', 'billing_category text', 'sender_purpose text',
      'queued_at timestamptz', 'send_started_at timestamptz',
      'provider_accepted_at timestamptz', 'delivered_at timestamptz',
      'failed_at timestamptz', 'indeterminate_at timestamptz',
      'cancelled_at timestamptz',
    ]) {
      expect(compact).toContain(`alter table public.sms_events add column if not exists ${required}`);
    }
    expect(compact).toContain('sms_events_idempotency_uidx');
    expect(compact).toContain('sms_events_provider_message_uidx');
    expect(compact).toContain("provider_id <> 'simulated'");
    expect(compact).toContain("'queued', 'sending', 'sent', 'delivered', 'failed'");
  });

  it('enforces one task per event and immutable attempt identity', () => {
    const task = table('sms_delivery_tasks');
    expect(task).toContain('sms_event_id uuid primary key');
    expect(task).toContain('claim_token uuid');
    expect(task).toContain('lease_expires_at timestamptz');
    expect(task).toContain('attempt_count integer not null default 0');
    expect(task).toContain('request_started_at timestamptz');
    expect(task).toContain('sms_delivery_tasks_state_shape');
    const attempt = table('sms_delivery_attempts');
    expect(attempt).toContain('claim_token uuid not null unique');
    expect(attempt).toContain('unique (sms_event_id, attempt_number)');
    expect(compact).toContain('sms_delivery_attempts_one_open_uidx');
    expect(definition('prevent_sms_delivery_attempt_mutation')).toContain('attempts are append-only');
  });

  it('atomically creates an event and task and rejects idempotency drift', () => {
    const enqueue = definition('enqueue_sms_delivery');
    expect(enqueue).toContain('insert into public.sms_events');
    expect(enqueue).toContain('on conflict (idempotency_key) where idempotency_key is not null do nothing');
    expect(enqueue).toContain('insert into public.sms_delivery_tasks');
    expect(enqueue).toContain('idempotency key was reused with a different payload');
    expect(enqueue).toContain('event exists without its delivery task');
  });

  it('uses short, bounded SKIP LOCKED claims and conservative lease recovery', () => {
    const claim = definition('claim_sms_delivery_tasks');
    expect(claim).toContain('p_batch_size not between 1 and 25');
    expect(claim).toContain('for update skip locked');
    expect(claim).toContain("v_lease := v_now + interval '5 minutes'");
    expect(claim).toContain("v_task.request_started_at is not null");
    expect(claim).toContain("set status = 'indeterminate'");
    expect(claim).toContain('sms_delivery_unknown_after_lease_expiry');
    expect(claim).toContain("set task_state = 'queued'");
  });

  it('rechecks current consent and an individually assigned ready sender', () => {
    const stage = definition('stage_sms_delivery');
    for (const guard of [
      "c.status = 'opted_in'", 'c.consented_at is not null',
      'c.opted_out_at is null', "provisioning_status = 'active'",
      "assignment_state = 'assigned'", 's.inbound_ready',
      's.suspended_at is null', 'sms_consent_not_current',
      "'blocked_sender'::text", 'sms_sender_keyword_preferences',
      "p.status = 'opted_out'", 'sms_sender_opted_out',
    ]) {
      expect(stage).toContain(guard);
    }
  });

  it('marks the no-return boundary before egress and never retries uncertainty', () => {
    const started = definition('mark_sms_delivery_request_started');
    expect(started).toContain('request_started_at = v_now');
    expect(started).toContain("set status = 'sending'");
    const failed = definition('fail_sms_delivery');
    expect(failed).toContain('if v_task.request_started_at is not null then');
    expect(failed).toContain("set status = 'indeterminate'");
    expect(failed).toContain("set task_state = 'indeterminate'");
    expect(failed.indexOf('if v_task.request_started_at is not null then'))
      .toBeLessThan(failed.indexOf('if p_retryable and v_task.attempt_count < 8 then'));
  });

  it('separates a confirmed provider rejection from an unknown started request', () => {
    const rejected = definition('record_sms_delivery_provider_rejection');
    expect(rejected).toContain("v_task.request_started_at is null");
    expect(rejected).toContain("v_event.status <> 'sending'");
    expect(rejected).toContain('if p_retryable and v_task.attempt_count < 8 then');
    expect(rejected).toContain("set status = 'queued', send_started_at = null");
    expect(rejected).toContain('request_started_at = null');
    expect(rejected).toContain("outcome = 'provider_rejected_retryable'");
    expect(rejected).toContain("set status = 'failed'");
    expect(rejected).toContain("outcome = 'provider_rejected_terminal'");
    expect(rejected).not.toContain("set status = 'indeterminate'");
  });

  it('finalizes through claim-token compare-and-set and mirrors the exact accepted body', () => {
    const complete = definition('complete_sms_delivery');
    expect(complete).toContain('t.claim_token = p_claim_token');
    expect(complete).toContain('t.request_started_at is not null');
    expect(complete).toContain("set status = 'sent', provider_id = p_provider_id");
    expect(complete).toContain('insert into public.sms_messages');
    expect(complete).toContain('v_event.body, p_provider_id');
    expect(complete).toContain('on conflict (id) do nothing');
  });

  it('forces RLS and exposes only narrow service-role RPCs', () => {
    for (const name of [
      'sms_sender_numbers',
      'sms_sender_keyword_preferences',
      'sms_delivery_tasks',
      'sms_delivery_attempts',
    ]) {
      expect(compact).toContain(`alter table public.${name} enable row level security`);
      expect(compact).toContain(`alter table public.${name} force row level security`);
      expect(compact).toContain(`revoke all on table public.${name} from public, anon, authenticated, service_role`);
      expect(compact).toContain(`grant select on table public.${name} to service_role`);
    }
    expect(compact).toContain('drop policy if exists sms_event_all on public.sms_events');
    expect(compact).toContain('for select to authenticated');
    for (const name of [
      'enqueue_sms_delivery', 'claim_sms_delivery_tasks', 'stage_sms_delivery',
      'mark_sms_delivery_request_started', 'complete_sms_delivery',
      'fail_sms_delivery', 'record_sms_delivery_provider_rejection',
      'defer_sms_delivery',
    ]) {
      expect(compact).toMatch(new RegExp(`grant execute on function public\\.${name}\\(`));
    }
  });
});

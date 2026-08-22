import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../migrations/20260821192000_sms_inbound_action_outbox.sql', import.meta.url),
  'utf8',
);

describe('durable inbound SMS action migration', () => {
  it('creates one receipt-keyed task in the same ingest transaction', () => {
    expect(migration).toMatch(/webhook_receipt_id uuid not null unique/i);
    expect(migration).toMatch(/after insert or update on public\.sms_webhook_receipts[\s\S]*enqueue_sms_inbound_action_task/i);
    expect(migration).toMatch(/new\.disposition = 'routed'[\s\S]*insert into public\.sms_inbound_action_tasks/i);
  });

  it('leases work and can reclaim expired processing without two owners', () => {
    expect(migration).toContain('create or replace function public.claim_sms_inbound_action');
    expect(migration).toMatch(/for update skip locked[\s\S]*lease_expires_at = v_now \+ interval '2 minutes'/i);
    expect(migration).toMatch(/task_state = 'processing' and v_task\.lease_expires_at > v_now[\s\S]*'busy'/i);
  });

  it('stores a domain effect and exact reply intent before egress', () => {
    expect(migration).toMatch(/effect_applied_at timestamptz[\s\S]*outcome jsonb/i);
    expect(migration).toMatch(/if v_task\.effect_applied_at is not null then[\s\S]*return v_task\.outcome/i);
    expect(migration).toMatch(/jsonb_build_object\([\s\S]*'reply_kind'[\s\S]*'reply_body'/i);
    expect(migration).toMatch(/set effect_applied_at = v_now, outcome = v_task\.outcome/i);
  });

  it('never chooses newest when more than one pending question is compatible', () => {
    expect(migration).toMatch(/select pg_catalog\.count\(\*\)::integer[\s\S]*from \([\s\S]*estimate[\s\S]*reschedule[\s\S]*appointment[\s\S]*subcontractor/i);
    expect(migration).toMatch(/v_candidate_count > 1[\s\S]*v_kind := 'ambiguous'/i);
    expect(migration).not.toMatch(/order by[\s\S]{0,100}(sent_at|created_at)[\s\S]{0,100}limit 1/i);
  });

  it('serializes candidate writes per account and recipient', () => {
    for (const table of ['estimate_offers', 'reschedule_offers', 'jobs', 'subcontractor_offers', 'sms_events']) {
      expect(migration).toMatch(new RegExp(`${table}_sms_inbound_recipient_lock[\\s\\S]*on public\\.${table}`, 'i'));
    }
    expect(migration).toMatch(/job_feed_sms_inbound_recipient_lock[\s\S]*on public\.job_feed/i);
    expect(migration).toMatch(/pg_advisory_xact_lock[\s\S]*sms_inbound_recipient_lock_key/i);
  });

  it('makes accepted estimate booking replay-safe', () => {
    expect(migration).toMatch(/source_sms_webhook_receipt_id uuid/i);
    expect(migration).toMatch(/unique index[\s\S]*route_stops_sms_webhook_receipt_uidx/i);
    expect(migration).toMatch(/on conflict \(source_sms_webhook_receipt_id\)[\s\S]*do update/i);
  });

  it('forces RLS and exposes only narrow service-role RPCs', () => {
    expect(migration).toMatch(/alter table public\.sms_inbound_action_tasks force row level security/i);
    expect(migration).toMatch(/revoke all on table public\.sms_inbound_action_tasks[\s\S]*from public, anon, authenticated, service_role/i);
    for (const signature of [
      'claim_sms_inbound_action\\(uuid\\)',
      'claim_sms_inbound_action_batch\\(integer\\)',
      'apply_sms_inbound_action\\(uuid,uuid\\)',
      'complete_sms_inbound_action\\(uuid,uuid,uuid,uuid\\)',
      'fail_sms_inbound_action\\(uuid,uuid,text\\)',
    ]) {
      expect(migration).toMatch(new RegExp(`grant execute on function public\\.${signature}[\\s\\S]*to service_role`, 'i'));
    }
    expect(migration).not.toMatch(/grant execute[\s\S]{0,250}to (anon|authenticated)/i);
  });
});

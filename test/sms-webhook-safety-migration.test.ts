import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../migrations/20260821182355_sms_webhook_safety.sql', import.meta.url),
  'utf8',
);

describe('SMS webhook safety migration', () => {
  it('deduplicates logical callbacks inside a provider and webhook kind', () => {
    expect(migration).toMatch(/unique \(provider, webhook_kind, receipt_key\)/i);
    expect(migration).toMatch(/on conflict \(provider, webhook_kind, receipt_key\) do nothing/gi);
    expect(migration).toMatch(/carrier retry must never produce a second keyword auto-reply/i);
    expect(migration).toMatch(/select 'duplicate'::text, v_existing\.id/i);
  });

  it('accepts only byte-and-identity-identical receipt-key replays', () => {
    for (const code of ['P5120', 'P5121', 'P5122']) {
      expect(migration).toContain(`using errcode = '${code}'`);
    }
    expect(migration).toMatch(/v_existing\.body_sha256 is distinct from p_body_sha256/gi);
    expect(migration).toMatch(/v_existing\.provider_event_id is distinct from p_provider_event_id/gi);
    expect(migration).toMatch(/v_existing\.from_number is distinct from p_from_number[\s\S]*v_existing\.to_number is distinct from p_to_number/i);
    expect(migration).toMatch(/v_existing\.provider_status is distinct from pg_catalog\.lower\(p_provider_status\)/i);
  });

  it('prevents browser sessions from manufacturing provider identity', () => {
    expect(migration).toMatch(/select e\.id, e\.provider, e\.sender_number_id[\s\S]*into new\.sms_event_id, new\.provider, new\.sender_number_id/i);
    expect(migration).toMatch(/current_user in \('anon', 'authenticated'\)/i);
    expect(migration).toMatch(/new\.direction <> 'outbound'[\s\S]*new\.provider_id is not null[\s\S]*new\.sender_number_id is not null/i);
    expect(migration).toMatch(/Browser sessions can only update SMS read state/i);
  });

  it('routes only by the authenticated provider and exact active To number', () => {
    expect(migration).toMatch(/s\.provider = p_provider[\s\S]*s\.e164_number = p_to_number/i);
    expect(migration).toMatch(/s\.provisioning_status = 'active'[\s\S]*s\.assignment_state = 'assigned'[\s\S]*s\.inbound_ready/i);
    expect(migration).not.toMatch(/order by[\s\S]{0,100}(created_at|updated_at)[\s\S]{0,100}limit 1/i);
  });

  it('starts partial rollouts fail-closed before the later consent-scope router', () => {
    expect(migration).toContain("v_sender.purpose <> 'contractor_dedicated'");
    expect(migration).toContain("'shared_destination_unroutable'");
    expect(migration).toMatch(/insert into public\.sms_operator_review_items/i);
  });

  it('records STOP and START against the exact sender-number scope', () => {
    expect(migration).toMatch(/primary key \(sender_number_id, phone_number\)/i);
    expect(migration).toMatch(/on conflict \(sender_number_id, phone_number\) do update/i);
    expect(migration).toMatch(/where c\.account_id = v_routed_account_id[\s\S]*c\.phone_number = p_from_number/i);
    expect(migration).not.toMatch(/update public\.sms_consent c[\s\S]{0,500}where c\.phone_number = p_from_number/i);
  });

  it('associates shared-number keywords only from one exact durable sender/contact history', () => {
    expect(migration).toMatch(/v_sender\.purpose = 'lgq_shared'[\s\S]*select distinct e\.account_id/i);
    expect(migration).toMatch(/e\.sender_number_id = v_sender\.id[\s\S]*e\.phone_number = p_from_number/i);
    expect(migration).toMatch(/e\.status in \('sent', 'delivered'\)[\s\S]*e\.provider_id is not null/i);
    expect(migration).toMatch(/case when pg_catalog\.count\(\*\) = 1[\s\S]*array_agg\(candidate\.account_id\)/i);
    expect(migration).not.toMatch(/order by[\s\S]{0,100}(sent_at|created_at|updated_at)[\s\S]{0,100}limit 1/i);
  });

  it('uses provider plus provider ID when projecting status', () => {
    expect(migration).toMatch(/where e\.provider = p_provider[\s\S]*e\.provider_id = p_provider_event_id/i);
    expect(migration).not.toMatch(/where e\.provider_id = p_provider_event_id\s*;/i);
  });

  it('can safely reconcile an unmatched stored receipt after provider identity appears', () => {
    expect(migration).toMatch(/v_existing\.disposition = 'unmatched_status'[\s\S]*v_reconciling := true/i);
    expect(migration).toMatch(/Reconciliation always projects the immutable stored receipt/i);
    expect(migration).toMatch(/v_status := coalesce\(v_receipt\.provider_status/i);
    expect(migration).toMatch(/reason = 'unmatched_status'[\s\S]*review_state = 'open'/i);
    expect(migration).toMatch(/resolve_sms_operator_review_item[\s\S]*public\.apply_sms_delivery_status_webhook\(/i);
  });

  it('manually binds only an open unmatched receipt to an indeterminate event', () => {
    expect(migration).toContain('create or replace function public.reconcile_sms_unmatched_status');
    expect(migration).toMatch(/receipt -> review -> event -> task/i);
    expect(migration).toMatch(/v_review\.review_state <> 'open'[\s\S]*v_review\.reason <> 'unmatched_status'/i);
    expect(migration).toMatch(/v_event\.provider is distinct from v_receipt\.provider/i);
    expect(migration).toMatch(/v_event\.provider_id is not null[\s\S]*already has provider identity/i);
    expect(migration).toMatch(/v_event\.status <> 'indeterminate'[\s\S]*v_task\.task_state <> 'indeterminate'/i);
  });

  it('projects only the immutable stored status and never retries the send', () => {
    const start = migration.indexOf('create or replace function public.reconcile_sms_unmatched_status');
    const end = migration.indexOf('\n$$;', start);
    const fn = migration.slice(start, end);
    expect(fn).toContain('public.apply_sms_delivery_status_webhook(');
    expect(fn).toContain('v_receipt.provider_status');
    expect(fn).toContain('v_receipt.provider_error_code');
    expect(fn).not.toMatch(/claim_sms_delivery|enqueue_sms_delivery|stage_sms_delivery|sendProvider|task_state\s*=\s*'queued'/i);
  });

  it('durably records the exact operator and note on successful recovery', () => {
    expect(migration).toContain('resolution_actor text');
    expect(migration).toContain('resolution_note = pg_catalog.btrim(p_resolution_note)');
    expect(migration).toContain('resolution_actor = pg_catalog.btrim(p_resolution_actor)');
  });

  it('prevents delivery state regressions and keeps terminal outcomes terminal', () => {
    expect(migration).toMatch(/v_target_rank <= v_current_rank[\s\S]*ignored_stale/i);
    expect(migration).toMatch(/v_event\.status in \('delivered', 'failed', 'opted_out', 'cancelled', 'suppressed'\)/i);
    expect(migration).toContain("v_event.status <> 'indeterminate'");
    expect(migration).toMatch(/v_target in \('queued', 'sending'\)[\s\S]*v_event\.provider_id is not null[\s\S]*ignored_stale/i);
  });

  it('closes indeterminate queue tasks only from authoritative terminal facts', () => {
    expect(migration).toMatch(/v_event\.status = 'indeterminate'[\s\S]*v_target in \('sent', 'delivered'\)[\s\S]*set task_state = 'completed'/i);
    expect(migration).toMatch(/v_target = 'failed'[\s\S]*set task_state = 'failed'/i);
    expect(migration).toMatch(/where t\.sms_event_id = v_event\.id[\s\S]*t\.task_state = 'indeterminate'/i);
  });

  it('forces RLS and exposes only service-role reads plus narrow RPC execution', () => {
    for (const table of [
      'sms_webhook_receipts',
      'sms_operator_review_items',
      'sms_sender_keyword_preferences',
    ]) {
      expect(migration).toMatch(new RegExp(`alter table public\\.${table} force row level security`, 'i'));
      expect(migration).toMatch(new RegExp(`revoke all on table public\\.${table}[\\s\\S]*?from public, anon, authenticated, service_role`, 'i'));
    }
    expect(migration).toMatch(/grant execute on function public\.ingest_sms_inbound_webhook[\s\S]*to service_role/i);
    expect(migration).toMatch(/revoke all on function public\.resolve_sms_operator_review_item\(uuid,text,text\)[\s\S]*from public, anon, authenticated, service_role/i);
    expect(migration).toMatch(/grant execute on function public\.resolve_sms_operator_review_item\(uuid,text,text\)[\s\S]*to service_role/i);
    expect(migration).toMatch(/revoke all on function public\.reconcile_sms_unmatched_status\(uuid,uuid,text,text\)[\s\S]*from public, anon, authenticated, service_role/i);
    expect(migration).toMatch(/grant execute on function public\.reconcile_sms_unmatched_status\(uuid,uuid,text,text\)[\s\S]*to service_role/i);
    expect(migration).not.toMatch(/grant execute[\s\S]{0,300}to (anon|authenticated)/i);
  });
});

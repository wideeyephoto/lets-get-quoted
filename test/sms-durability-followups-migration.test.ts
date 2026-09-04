import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'migrations/20260821210000_sms_durability_followups.sql', 'utf8',
);

describe('SMS durability follow-up migration', () => {
  it('is safe to reapply and keeps explicit durable-table postconditions', () => {
    expect(migration).toContain('create table if not exists public.payment_sms_producer_tasks');
    expect(migration).toContain('create table if not exists public.sms_missed_call_receipts');
    expect(migration).toContain('create unique index if not exists payment_sms_producer_claim_uidx');
    expect(migration).toContain('create index if not exists sms_missed_call_receipts_account_idx');
    expect(migration).toContain('drop constraint if exists payment_sms_producer_outcome_check');
    expect(migration).toContain('add constraint payment_sms_producer_outcome_check');
    expect(migration).toContain('drop constraint if exists payment_sms_producer_task_shape');
  });

  it('suppresses stale payment intents and rechecks them at the no-return boundary', () => {
    expect(migration).toContain("outcome = 'superseded'");
    expect(migration).toContain("t.event_type = 'payment_failed' and p.status::text = 'failed'");
    expect(migration).toContain("v_event.event_type in ('payment_paid', 'payment_failed', 'payment_refunded')");
    expect(migration).toContain('for share;');
    expect(migration).toContain("using errcode = 'P5105'");
    expect(migration).toContain('payment_requested is intentionally untouched');
  });

  it('authorizes inbox replies from immutable receipt/thread evidence in the enqueue transaction', () => {
    expect(migration).toContain('create table if not exists public.sms_consent_scopes');
    expect(migration).toContain("check (consent_scope in ('customer', 'crew', 'owner'))");
    expect(migration).toContain('establish_sms_consent_scope_from_source');
    expect(migration).toContain("when new.source in ('crew_added', 'subcontractor_added') then 'crew'");
    expect(migration).toContain("when new.source = 'owner_alerts' then 'owner'");
    expect(migration).toContain('create or replace function public.ensure_sms_consent_baseline_scope');
    expect(migration).toContain("p_source in ('crew_added', 'subcontractor_added')");
    expect(migration).toContain("'portal_link_request', 'missed_call_text_back'");
    expect(migration).toContain('baseline_sms_consent_from_inbound_receipt');
    expect(migration).toContain("new.webhook_kind = 'inbound'");
    expect(migration).toContain("new.processing_state = 'processed'");
    expect(migration).toContain("new.disposition = 'routed'");
    expect(migration).toContain("s.purpose = 'contractor_dedicated'");
    const inboundScopeFunction = migration.slice(
      migration.indexOf('create or replace function public.baseline_sms_consent_from_inbound_receipt'),
      migration.indexOf('drop trigger if exists sms_inbound_receipt_consent_baseline'),
    );
    expect(inboundScopeFunction).not.toContain("new.disposition in ('keyword_stop'");
    expect(migration).toMatch(/stage_sms_delivery[\s\S]*v_required_scope[\s\S]*sms_consent_scope_not_current/);
    expect(migration).toContain('create or replace function public.enqueue_authorized_inbox_message');
    expect(migration).toContain("using errcode = 'P5110'");
    expect(migration).toContain("using errcode = 'P5111'");
    expect(migration).toContain("s.consent_scope = 'customer'");
    expect(migration).toContain("using errcode = 'P5112'");
    expect(migration).toContain('for share of r, m');
    expect(migration).toContain('from public.enqueue_sms_delivery(');
  });
  it('queues payment transition intent in the same transaction as the payment row', () => {
    expect(migration).toContain('create table if not exists public.payment_sms_producer_tasks');
    expect(migration).toContain('after insert or update of status on public.payments');
    expect(migration).toContain('on conflict (payment_id, event_type) do nothing');
    expect(migration).toContain('for update skip locked');
    expect(migration).toContain('producer_lease_expired');
  });

  it('makes missed-call receipt, lead and SMS enqueue one RPC transaction', () => {
    const start = migration.indexOf('create or replace function public.ingest_sms_missed_call');
    const end = migration.indexOf('-- -------------------------------------------------------------------------', start + 80);
    const body = migration.slice(start, end);
    expect(body).toContain('pg_advisory_xact_lock');
    expect(body).toContain('insert into public.sms_missed_call_receipts');
    expect(body).toContain('insert into public.leads');
    expect(body).toContain('public.enqueue_sms_delivery');
    expect(body).not.toContain('exception when');
    expect(body).toContain("using errcode = 'P5123'");
    expect(body).toContain('v_receipt.dial_status is distinct from p_dial_status');
    expect(body).toContain('v_receipt.body_sha256 is distinct from p_body_sha256');
  });

  it('admits specialized indeterminate tasks without adding a resend path', () => {
    expect(migration).toContain("v_direct_task.sms_status <> 'indeterminate'");
    expect(migration).toContain('project_direct_payment_sms_terminal_fact');
    expect(migration).toContain("t.task_state = 'dead_letter'");
    expect(migration).not.toContain("set task_state = 'ready'");
  });

  it('hands new direct-payment receipts to the generic SMS queue in a single transaction', () => {
    const start = migration.indexOf(
      'create or replace function public.enqueue_direct_payment_settlement_sms',
    );
    const end = migration.indexOf(
      'create or replace function public.project_direct_payment_sms_terminal_fact',
      start,
    );
    const body = migration.slice(start, end);
    expect(body).toContain('public.enqueue_sms_delivery');
    expect(body).toContain("sms_status = 'queued'");
    expect(body).toContain("set outcome_status = 'completed'");
    expect(body).toContain("'payment:' || v_task.payment_id::text || ':payment_paid'");
    expect(body).not.toContain('sendProviderMessage');
    expect(body).not.toContain('provider_id');
    expect(migration).toContain(
      'drop function if exists public.defer_direct_payment_settlement_task(uuid,uuid,text,integer)',
    );
  });

  it('excludes provider-started reservations from expiry and still permits commit', () => {
    expect(migration).toContain('sms_delivery_request_reservation_lock');
    expect(migration).toContain("using errcode = 'P5104'");
    expect(migration).toMatch(/expire_usage_reservations[\s\S]*not exists \([\s\S]*request_started_at is not null/);
    expect(migration).toMatch(/commit_usage_reservation[\s\S]*v_provider_started[\s\S]*not v_provider_started/);
  });

  it('keeps policy deferrals outside the provider-attempt budget', () => {
    expect(migration).toContain('add column if not exists lease_sequence');
    expect(migration).toContain('advance_sms_delivery_lease_sequence');
    expect(migration).toContain('assign_sms_delivery_attempt_sequence');
    expect(migration).toContain("attempt_count = t.attempt_count - 1");
    expect(migration).toContain("set outcome = 'deferred'");
    expect(migration).toContain("check (task_state <> 'queued' or attempt_count < 8)");
    expect(migration).toContain("a.outcome is distinct from 'deferred'");
  });

  it('dead-letters inbound actions after eight attempts without erasing an applied effect', () => {
    expect(migration).toContain("task_state in ('pending', 'processing', 'failed', 'completed', 'dead_letter')");
    expect(migration).toContain("select 'exhausted'::text");
    expect(migration).toMatch(/v_task\.attempt_count >= 8[\s\S]*task_state = 'dead_letter'/i);
    expect(migration).toMatch(/fail_sms_inbound_action[\s\S]*case when v_task\.attempt_count >= 8[\s\S]*then 'dead_letter'/i);
    expect(migration).not.toMatch(/fail_sms_inbound_action[\s\S]*set[\s\S]{0,300}(effect_applied_at|outcome)\s*=\s*null/i);
  });

  it('audits synchronous compliance egress by exact inbound receipt', () => {
    expect(migration).toContain('create table if not exists public.sms_compliance_reply_results');
    expect(migration).toContain('create or replace function public.record_sms_compliance_reply_result');
    expect(migration).toContain("v_receipt.disposition is distinct from ('keyword_' || p_keyword)");
    expect(migration).toContain('return true;');
    expect(migration).toContain('return false;');
    expect(migration).toContain('The first committed result wins');
    expect(migration).not.toContain(
      'v_result.egress_result is distinct from p_egress_result',
    );
  });

  it('makes zero-refund overage settlement unambiguous and exactly replayable', () => {
    expect(migration).toContain('create table if not exists public.workspace_overage_event_settlements');
    expect(migration).toContain('create or replace function public.settle_usage_overage_result');
    expect(migration).toContain('return query select false, 0::bigint, false');
    expect(migration).toContain('return query select true, v_result.refunded_millicents, true');
    expect(migration).toContain("using errcode = 'P5125'");
    expect(migration).toMatch(/workspace_overage_accruals a[\s\S]*for update/);
    expect(migration).toContain('a.units >= v_units_refund');
    expect(migration).toContain('a.millicents >= v_refund');
    expect(migration).toContain("get diagnostics v_updated = row_count");
    expect(migration).not.toContain('greatest(a.units -');
    expect(migration).not.toContain('greatest(a.millicents -');
  });

  it('keeps every new table and RPC service-only', () => {
    expect(migration).toContain('alter table public.payment_sms_producer_tasks force row level security');
    expect(migration).toContain('alter table public.sms_missed_call_receipts force row level security');
    expect(migration).toContain('alter table public.sms_consent_scopes force row level security');
    expect(migration).toContain('create policy sms_consent_scopes_owner_read');
    expect(migration).toContain('for select to authenticated');
    expect(migration).toContain('revoke all on table public.sms_consent_scopes');
    for (const fn of [
      'claim_payment_sms_producer_tasks(integer)',
      'complete_payment_sms_producer_task(uuid,uuid,text,uuid)',
      'fail_payment_sms_producer_task(uuid,uuid,text,boolean)',
      'ingest_sms_missed_call(text,text,uuid,text,text,text)',
      'record_sms_compliance_reply_result(uuid,text,text,text)',
      'settle_usage_overage_result(uuid,text,bigint)',
      'ensure_sms_consent_baseline_scope(uuid,text,text)',
      'enqueue_direct_payment_settlement_sms(uuid,uuid,text,text)',
    ]) {
      expect(migration).toContain(`revoke all on function public.${fn}`);
      expect(migration).toContain(`grant execute on function public.${fn}`);
    }
  });
});

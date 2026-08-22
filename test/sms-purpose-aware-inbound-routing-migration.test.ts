import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationName = '20260821210500_sms_purpose_aware_inbound_routing.sql';
const migration = readFileSync(
  new URL(`../migrations/${migrationName}`, import.meta.url),
  'utf8',
);
const inboundActions = readFileSync(
  new URL('../migrations/20260821192000_sms_inbound_action_outbox.sql', import.meta.url),
  'utf8',
);

describe('purpose-aware inbound SMS routing migration', () => {
  it('runs only after audience consent scopes and the inbound outbox exist', () => {
    expect(migrationName.localeCompare('20260821210000_sms_durability_followups.sql')).toBeGreaterThan(0);
    expect(migration).toContain('public.sms_consent_scopes');
    expect(migration).toContain('public.sms_inbound_recipient_lock_key');
  });

  it('maps shared replies only through one current owner scope', () => {
    expect(migration).toMatch(/when 'lgq_shared' then 'owner'/i);
    expect(migration).toMatch(/join public\.sms_consent_scopes scope[\s\S]*scope\.consent_scope = case v_sender\.purpose/i);
    expect(migration).toMatch(/c\.status = 'opted_in'[\s\S]*c\.consented_at is not null[\s\S]*c\.opted_out_at is null/i);
    expect(migration).toMatch(/account\.high_value_sms_enabled is true/i);
    expect(migration).toMatch(/sms_normalize_recipient_phone\(account\.alert_phone\)[\s\S]*= p_from_number/i);
  });

  it('maps dispatch replies only through one current crew scope', () => {
    expect(migration).toMatch(/when 'lgq_dispatch' then 'crew'/i);
    expect(migration).toMatch(/v_sender\.purpose in \('lgq_shared', 'lgq_dispatch'\)[\s\S]*select pg_catalog\.count\(\*\)/i);
    expect(migration).toMatch(/from public\.crew member[\s\S]*member\.active[\s\S]*member\.deleted_at is null[\s\S]*sms_normalize_recipient_phone\(member\.phone\)[\s\S]*= p_from_number/i);
  });

  it('uses an exact-one aggregate and never guesses by recency', () => {
    expect(migration).toMatch(/case when pg_catalog\.count\(\*\) = 1[\s\S]*array_agg\(candidate\.account_id\)/i);
    const scopeStart = migration.indexOf("if p_keyword = 'other'");
    const reviewStart = migration.indexOf("if v_routed_account_id is null", scopeStart);
    const scopeRoute = migration.slice(scopeStart, reviewStart);
    expect(scopeRoute).not.toMatch(/order by|limit\s+1/i);
    expect(migration).toMatch(/v_routed_account_count > 1 then 'ambiguous_destination'/i);
    expect(migration).toMatch(/then 'shared_destination_unroutable'/i);
  });

  it('binds exact-one transcripts to the recipient lock and existing action outbox', () => {
    expect(migration).toMatch(/pg_advisory_xact_lock\([\s\S]*sms_inbound_recipient_lock_key\(v_routed_account_id, p_from_number\)/i);
    expect(migration).toMatch(/insert into public\.sms_messages[\s\S]*v_routed_account_id, p_from_number, 'inbound'/i);
    expect(migration).toMatch(/disposition = 'routed'[\s\S]*account_id = v_routed_account_id[\s\S]*sms_message_id = v_message_id/i);
    expect(inboundActions).toMatch(/new\.disposition = 'routed'[\s\S]*insert into public\.sms_inbound_action_tasks/i);
  });

  it('allows domain mutations only on the matching inbound sender lane', () => {
    for (const kind of ['estimate', 'reschedule', 'appointment']) {
      expect(migration).toMatch(new RegExp(
        `select '${kind}'[\\s\\S]*?where v_sender_purpose = 'contractor_dedicated'`,
        'i',
      ));
    }
    expect(migration).toMatch(/select 'subcontractor'[\s\S]*?where v_sender_purpose = 'lgq_dispatch'/i);
    expect(migration).not.toMatch(/where v_sender_purpose = 'lgq_shared'[\s\S]{0,300}(update|insert into) public\./i);
  });

  it('requires one exact provider-accepted outbound question before mutation', () => {
    expect(migration).toMatch(/with accepted_question_events as materialized \([\s\S]*e\.account_id = v_task\.account_id[\s\S]*e\.phone_number = v_receipt\.from_number/i);
    expect(migration).toMatch(/e\.sender_number_id = v_task\.sender_number_id[\s\S]*e\.sender_purpose = v_sender_purpose/i);
    expect(migration).toMatch(/e\.provider = v_receipt\.provider[\s\S]*btrim\(e\.provider_id\)[\s\S]*e\.provider_id <> 'simulated'/i);
    expect(migration).toMatch(/e\.status in \('sent', 'delivered'\)[\s\S]*e\.queued_at is not null[\s\S]*e\.send_started_at is not null[\s\S]*e\.provider_accepted_at is not null[\s\S]*e\.sent_at is not null/i);
    expect(migration).toMatch(/e\.created_at <= e\.queued_at[\s\S]*e\.queued_at <= e\.send_started_at[\s\S]*e\.send_started_at <= e\.provider_accepted_at[\s\S]*e\.provider_accepted_at <= e\.sent_at/i);
    expect(migration).toMatch(/e\.provider_accepted_at <= v_receipt\.received_at[\s\S]*e\.sent_at <= v_receipt\.received_at/i);
  });

  it('uses only the domain record exact event reference', () => {
    expect(migration).toMatch(/meta->>'source' = 'estimate_offer'[\s\S]*meta->>'offer_id' = e\.id::text/i);
    expect(migration).toMatch(/meta->>'source' = 'reschedule_offer'[\s\S]*meta->>'offer_id' = o\.id::text/i);
    expect(migration).toMatch(/question\.id::text = f\.meta->>'sms_event_id'/i);
    expect(migration).toMatch(/join accepted_question_events question on question\.id = o\.sms_event_id/i);
    expect(migration).toMatch(/o\.status in \('sent','delivered','viewed'\)/i);
  });

  it('keeps ambiguous dispatch START blocked and creates review work', () => {
    expect(migration).toMatch(/p_keyword = 'start'[\s\S]*v_sender\.purpose = 'lgq_dispatch'[\s\S]*v_routed_account_id is null/i);
    expect(migration).toMatch(/v_sender\.id, p_from_number, 'opted_out', 'inbound_start'/i);
    expect(migration).toMatch(/processing_state = 'review'[\s\S]*return query select 'review'/i);
  });

  it('updates both sender and account ledgers for uniquely routed keywords', () => {
    expect(migration).toMatch(/insert into public\.sms_sender_keyword_preferences[\s\S]*on conflict \(sender_number_id, phone_number\) do update/i);
    expect(migration).toMatch(/if v_routed_account_id is not null then[\s\S]*insert into public\.sms_consent[\s\S]*on conflict \(account_id, phone_number\) do update/i);
    expect(migration).toMatch(/elsif v_sender\.purpose = 'lgq_dispatch'[\s\S]*insert into public\.sms_operator_review_items/i);
  });

  it('keeps sender-scoped keyword ordering and immutable receipt dedupe', () => {
    expect(migration).toMatch(/on conflict \(provider, webhook_kind, receipt_key\) do nothing/i);
    expect(migration).toContain("using errcode = 'P5120'");
    expect(migration).toMatch(/sms-sender-consent:[\s\S]*if p_keyword in \('stop', 'start'\)/i);
    expect(migration).toMatch(/on conflict \(sender_number_id, phone_number\) do update/i);
    expect(migration).toContain("if p_keyword = 'help' then");
  });

  it('keeps the RPC service-only with a hardened search path', () => {
    expect(migration).toMatch(/security definer[\s\S]*set search_path = pg_catalog, pg_temp/i);
    expect(migration).toMatch(/revoke all on function public\.ingest_sms_inbound_webhook\([\s\S]*from public, anon, authenticated, service_role/i);
    expect(migration).toMatch(/grant execute on function public\.ingest_sms_inbound_webhook\([\s\S]*to service_role/i);
  });
});

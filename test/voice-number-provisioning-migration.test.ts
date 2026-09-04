import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'migrations', '20260903231235_ai_voice_number_provisioning.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

function definition(name: string): string {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} must exist`).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf('\n$fn$;', start);
  expect(end, `${name} must use the $fn$ boundary`).toBeGreaterThan(start);
  return migration.slice(start, end + '\n$fn$;'.length);
}

const authorize = definition('authorize_voice_number_purchase');
const observeCandidate = definition('record_voice_number_candidate_observation');
const authorizeRetry = definition('authorize_voice_number_operation_retry');
const reserveCleanup = definition('reserve_voice_number_identity_cleanup');
const enumerateCleanup = definition('enumerate_pending_voice_number_identity_cleanups');
const enumeratePurchaseCleanup = definition('enumerate_purchase_voice_number_cleanup_anchors');
const finalizeCleanup = definition('finalize_voice_number_identity_cleanup');
const voiceIdentityConflict = definition('unresolved_voice_number_identity_conflict');
const messagingIdentityConflict = definition('unresolved_messaging_number_identity_conflict');
const preventMessagingIdentityConflict = definition('prevent_messaging_operation_voice_identity_conflict');
const preventVoiceIdentityConflict = definition('prevent_voice_operation_identity_conflict');
const claim = definition('claim_voice_number_operation');
const begin = definition('begin_voice_number_operation');
const applySuccess = definition('apply_voice_number_operation_success');
const recordObservation = definition('record_voice_number_reconciliation_observation');
const recoverStale = definition('recover_stale_voice_number_operations');
const reconcile = definition('resolve_voice_number_operation');
const applyVerification = definition('apply_voice_number_provider_verification');
const recordCheck = definition('record_voice_number_provider_check_attempt');
const claimCall = definition('claim_voice_call_admission_v2');
const finalizeCall = definition('finalize_voice_call_admission');

describe('AI Voice number provisioning migration', () => {
  it('keeps voice inventory and spend state separate from all SMS sender rails', () => {
    for (const table of [
      'voice_number_inventory',
      'voice_number_spend_policies',
      'voice_number_candidate_observations',
      'voice_number_purchase_authorizations',
      'voice_number_provisioning_operations',
      'voice_number_provisioning_attempts',
      'voice_number_operation_retry_authorizations',
      'voice_number_identity_cleanup_reservations',
      'voice_provider_terminal_call_tombstones',
    ]) {
      expect(migration).toContain(`create table if not exists public.${table}`);
    }
    expect(migration).not.toMatch(/(?:insert|update|alter table)\s+(?:into\s+)?public\.sms_sender_numbers/i);
    expect(migration).not.toContain("purpose = 'contractor_dedicated'");
  });

  it('is dark by default and requires a fresh exact-price one-time authorization', () => {
    const ddlBeforePolicyRpc = migration.slice(
      0,
      migration.indexOf('create or replace function public.set_voice_number_spend_policy('),
    );
    expect(ddlBeforePolicyRpc).not.toMatch(/insert into public\.voice_number_spend_policies/i);
    expect(migration).toContain('purchase_enabled boolean not null default false');
    expect(observeCandidate).toContain("p_price_evidence_source is distinct from 'signalwire_dashboard'");
    expect(observeCandidate).toContain("v_now + interval '15 minutes'");
    expect(authorize).toMatch(/from public\.voice_number_spend_policies[\s\S]*for share/i);
    expect(authorize).toMatch(/from public\.voice_number_candidate_observations[\s\S]*for share/i);
    expect(authorize).toMatch(/not v_policy\.purchase_enabled/i);
    expect(authorize).toMatch(/p_monthly_unit_price_cents is distinct from v_policy\.monthly_unit_price_cents/i);
    expect(authorize).toMatch(/p_spend_policy_revision is distinct from v_policy\.revision/i);
    expect(authorize).toContain("v_now + interval '15 minutes'");

    expect(claim).toMatch(/v_authorization\.state <> 'authorized'/i);
    expect(claim).toMatch(/v_authorization\.expires_at <= v_now/i);
    expect(claim).toMatch(/v_authorization\.candidate_number is distinct from \(p_request_payload->>'number'\)/i);
    expect(claim).toMatch(/set state = 'consumed', consumed_operation_id = v_operation\.id/i);
    expect(claim).toMatch(/v_committed_spend \+ v_policy\.monthly_unit_price_cents[\s\S]*v_policy\.aggregate_monthly_ceiling_cents/i);
    expect(begin).toContain("'purchase_policy_changed'");
    expect(begin).toContain("'candidate_observation_expired'");
    expect(begin).toContain("'sms_rail_already_references_number'");
    expect(claim).toMatch(
      /perform 1 from public\.sms_sender_numbers s\s+where[\s\S]*?s\.e164_number = \(p_request_payload->>'number'\);/i,
    );
    expect(begin).toMatch(
      /perform 1 from public\.sms_sender_numbers s\s+where[\s\S]*?s\.e164_number = \(v_operation\.request_payload->>'number'\);/i,
    );
    expect(claim).not.toMatch(
      /s\.e164_number = \(p_request_payload->>'number'\)\s+for update/i,
    );
    expect(begin).not.toMatch(
      /s\.e164_number = \(v_operation\.request_payload->>'number'\)\s+for update/i,
    );
  });

  it('uses leased idempotent operations and quarantines uncertain provider writes', () => {
    expect(migration).toContain("'pending', 'claimed', 'request_started', 'succeeded', 'failed'");
    expect(migration).toContain("'indeterminate', 'cancelled'");
    expect(migration).toContain('voice_number_operations_one_unresolved_account_uidx');
    expect(claim).toMatch(/request_fingerprint is distinct from p_request_fingerprint/i);
    expect(claim).toMatch(/request_payload is distinct from p_request_payload/i);
    expect(claim).toMatch(/p_request_payload->>'provider' is distinct from 'signalwire'/i);
    expect(claim).toMatch(/p_request_payload->>'provider_number_id' is distinct from v_inventory\.provider_number_id/i);
    expect(claim).toMatch(/p_request_payload->>'number' is distinct from v_inventory\.e164_number/i);
    expect(claim).toMatch(/state = 'request_started'[\s\S]*state = 'indeterminate'/i);
    expect(claim).toContain("'needs_reconciliation'::text");
    expect(claim).toContain("'attempts_exhausted_before_request'");
    expect(recoverStale).toContain("recovery_status := 'needs_reconciliation'");
    expect(recoverStale).toContain("recovery_status := 'terminal_failed'");
    expect(begin).toContain("state = 'request_started'");
    expect(authorizeRetry).toContain("v_failed.operation_type not in ('configure_voice', 'release_number')");
    expect(claim).toMatch(/v_retry_authorization\.recovery_token_hmac is distinct from p_recovery_token_hmac/i);
    expect(recordObservation).toContain("v_operation.state <> 'indeterminate'");
    expect(reconcile).toMatch(/v_operation\.state <> 'indeterminate'/i);
    expect(reconcile).toMatch(/p_resolution not in \('succeeded', 'failed'\)/i);
  });

  it('reserves every cleanup identity across SMS and voice before provider deletion', () => {
    expect(migration).toContain('create table if not exists public.voice_number_identity_cleanup_reservations');
    expect(migration).toContain('voice_number_cleanup_reserved_provider_id_uidx');
    expect(migration).toContain('voice_number_cleanup_reserved_e164_idx');
    expect(migration).toContain('sms_sender_numbers_voice_cleanup_reservation_guard');
    expect(migration).toContain('voice_number_inventory_cleanup_reservation_guard');
    expect(reserveCleanup).toContain('from public.sms_sender_numbers s');
    expect(reserveCleanup).toContain('from public.voice_number_inventory i');
    const ownershipProbes = reserveCleanup.slice(
      reserveCleanup.indexOf('perform 1\n    from public.sms_sender_numbers s'),
      reserveCleanup.indexOf('if public.unresolved_voice_number_identity_conflict('),
    );
    expect(ownershipProbes).not.toContain('for update');
    expect(reserveCleanup).toMatch(/pg_advisory_xact_lock\(1280265031, 2108\)[\s\S]*voice-cleanup-id:[\s\S]*voice-cleanup-number:/i);
    expect(reserveCleanup).toContain("v_now + interval '5 minutes'");
    expect(reserveCleanup).toContain("'reclaimed'::text");
    expect(reserveCleanup).toContain("'busy'::text");
    expect(reserveCleanup).toMatch(/'busy'::text,\s*null::uuid, v_reservation\.lease_expires_at/i);
    expect(reserveCleanup).not.toContain("'existing'::text");
    expect(reserveCleanup).toContain('v_reservation.state, v_reservation.finalized_at');
    expect(reserveCleanup).toContain("p_identity_kind not in ('expected', 'observed', 'discovered')");
    expect(reserveCleanup).toContain("anchor.identity_kind in ('expected', 'observed')");
    expect(reserveCleanup).toContain('anchor.state = \'reserved\'');
    expect(reserveCleanup).toContain('r.operation_id <> v_operation.id');
    expect(reserveCleanup).toMatch(/p_identity_kind = 'discovered'[\s\S]*pg_catalog\.count\(\*\)[\s\S]*>= 10/i);
    expect(reserveCleanup).toContain('Pending discovered cleanup reservation limit reached');
    expect(reserveCleanup).toContain('Purchase cleanup anchor safety limit reached');
    expect(reserveCleanup).toContain('Voice cleanup identity lifetime safety limit reached');
    expect(reserveCleanup).toContain(") >= 11 then");
    expect(reserveCleanup).toContain("v_operation.operation_type <> 'purchase_number'");
    expect(reserveCleanup).toContain('Cleanup cannot begin while another SignalWire purchase response is in flight');
    expect(reserveCleanup).toContain('public.unresolved_voice_number_identity_conflict(');
    expect(reserveCleanup).toContain('public.unresolved_messaging_number_identity_conflict(');
    expect(reserveCleanup).not.toContain('v_reservation.authorized_by is distinct from');
    expect(reserveCleanup.indexOf("'finalized'::text")).toBeLessThan(
      reserveCleanup.indexOf('Cleanup identity is still referenced by the SMS rail'),
    );
    expect(finalizeCleanup).toContain("p_disposition not in ('released', 'confirmed_absent')");
    expect(finalizeCleanup).toContain("p_finalization_evidence->'cleanup_confirmed' is distinct from 'true'::jsonb");
    expect(finalizeCleanup).toContain("v_reservation.identity_kind in ('expected', 'observed')");
    expect(finalizeCleanup).toMatch(/pending\.identity_kind = 'discovered'[\s\S]*pending\.state = 'reserved'/i);
    expect(finalizeCleanup).toContain('Voice number cleanup anchor cannot finalize while discovered cleanup remains reserved');
    expect(enumerateCleanup).toContain('p_limit not between 1 and 10');
    expect(enumerateCleanup).toMatch(/pg_advisory_xact_lock[\s\S]*voice-cleanup-operation:/i);
    expect(enumerateCleanup).toContain("v_operation.state <> 'indeterminate'");
    expect(enumerateCleanup).toContain('p_anchor_reservation_id uuid');
    expect(enumerateCleanup).toContain('anchor.id = p_anchor_reservation_id');
    expect(enumerateCleanup).toContain("v_operation.operation_type = 'purchase_number'");
    expect(enumerateCleanup).toContain("v_operation.operation_type = 'release_number'");
    expect(enumerateCleanup).toContain("anchor.identity_kind = 'expected'");
    expect(enumerateCleanup).toContain("anchor.identity_kind = 'observed'");
    expect(enumerateCleanup).toContain("anchor.state = 'reserved'");
    expect(enumerateCleanup).toContain("r.identity_kind = 'discovered'");
    expect(enumerateCleanup).toContain("r.state = 'reserved'");
    expect(enumerateCleanup).toContain('if v_pending_count > p_limit then');
    expect(enumeratePurchaseCleanup).toContain("v_operation.operation_type <> 'purchase_number'");
    expect(enumeratePurchaseCleanup).toContain("anchor.identity_kind = 'expected'");
    expect(enumeratePurchaseCleanup).toContain("anchor.e164_number = v_expected_number");
    expect(reconcile).toContain('Expected provider identity cleanup lacks a finalized exact reservation');
    expect(reconcile).toContain('Observed provider identity cleanup lacks a finalized exact reservation');
    expect(reconcile).toContain('AI Voice reconciliation still has an active identity cleanup reservation');
    expect(reconcile).toContain('Every discovered provider identity must have terminal cleanup evidence');
    expect(reconcile).toContain('Retained provider identity contradicts terminal exact cleanup evidence');
  });

  it('serializes both provider rails and preserves conflicting response evidence for quarantine', () => {
    for (const helper of [voiceIdentityConflict, messagingIdentityConflict]) {
      expect(helper).toContain("state in ('pending', 'claimed', 'request_started', 'indeterminate')");
      expect(helper).toContain("request_payload->>'provider_number_id'");
      expect(helper).toContain("request_payload->>'number'");
      expect(helper).toContain("provider_result->>'id'");
      expect(helper).toContain("provider_result->>'number'");
    }
    expect(voiceIdentityConflict).toContain('observed_provider_object_id');
    expect(voiceIdentityConflict).toContain("observed_provider_result->>'number'");
    expect(messagingIdentityConflict).toContain('application.provider_number_id');
    expect(messagingIdentityConflict).toContain('application.purchased_number');

    for (const guard of [preventMessagingIdentityConflict, preventVoiceIdentityConflict]) {
      expect(guard).toContain('pg_catalog.pg_advisory_xact_lock(1280265031, 2108)');
      expect(guard).toMatch(/1280265031, 2108[\s\S]*voice-cleanup-id:[\s\S]*voice-cleanup-number:/i);
      expect(guard).toContain("old.state = 'request_started'");
      expect(guard).toContain("new.state = 'indeterminate'");
      expect(guard).toContain("old.state = 'indeterminate'");
      expect(guard).toContain("new.state = 'indeterminate'");
    }
    expect(preventVoiceIdentityConflict).toContain("old.state = 'claimed'");
    expect(preventVoiceIdentityConflict).toContain("new.state = 'cancelled'");
    expect(preventVoiceIdentityConflict).toContain("old.provider_object_id is null");
    expect(preventVoiceIdentityConflict).toContain("new.provider_object_id is null");
    expect(preventMessagingIdentityConflict).toContain(
      'Messaging purchase cannot begin while AI Voice identity cleanup is active',
    );
    expect(preventMessagingIdentityConflict).not.toContain('observed_provider_object_id');
    expect(preventMessagingIdentityConflict).not.toContain('observed_provider_result');
    expect(preventVoiceIdentityConflict).toContain(
      'AI Voice purchase cannot begin while provider identity cleanup is active',
    );
    expect(migration).toContain('voice_number_operations_one_unresolved_purchase_number_uidx');
  });

  it('persists terminal calls before admission and prevents terminal finalization replay', () => {
    expect(migration).toContain('create table if not exists public.voice_provider_terminal_call_tombstones');
    expect(migration).toContain("expires_at = terminal_at + interval '7 days'");
    expect(claimCall).toContain("'signalwire:' || p_provider_call_id, 63190215");
    expect(claimCall).toContain("'call_terminal'::text");
    expect(claimCall).toContain('v_existing.provider_terminal_at is not null');
    expect(finalizeCall).toContain("'signalwire:' || p_provider_call_id, 63190215");
    expect(finalizeCall).toContain('a.provider_terminal_at is null');
  });

  it('makes provider proof expire and records every reconciliation attempt', () => {
    expect(migration).toContain('last_provider_check_attempt_at timestamptz');
    expect(migration).toContain("provider_readiness_state in ('unverified', 'ready', 'drifted', 'missing')");
    expect(claimCall).toContain("v.provider_readiness_state = 'ready'");
    expect(claimCall).toContain("v.provider_verified_at >= pg_catalog.clock_timestamp() - interval '6 hours'");
    expect(claimCall).toContain("v.provider_verified_at <= pg_catalog.clock_timestamp() + interval '5 minutes'");
    expect(claimCall).toContain("v.last_provider_sync_at >= pg_catalog.clock_timestamp() - interval '6 hours'");
    expect(claimCall).toContain("v.last_provider_sync_at <= pg_catalog.clock_timestamp() + interval '5 minutes'");
    expect(applyVerification).toContain('last_provider_check_attempt_at = v_now');
    expect(recordCheck).toContain("p_check_outcome not in ('read_error', 'apply_error', 'skipped_nonactive')");
    expect(recordCheck).not.toMatch(/provider_readiness_state\s*=/i);
  });

  it('activates only an exact voice-capable production POST route', () => {
    expect(migration).toContain("purpose text not null default 'ai_voice' check (purpose = 'ai_voice')");
    expect(migration).toContain("call_request_url ~ '^https://[^[:space:]]+/api/voice/ai$'");
    expect(migration).toContain("call_status_callback_url ~ '^https://[^[:space:]]+/api/voice/provider-status$'");
    expect(migration).toContain("call_status_callback_method = 'POST'");
    expect(applySuccess).toContain("p_provider_result->'voice_capable' is distinct from 'true'::jsonb");
    expect(applySuccess).toMatch(/call_handler = 'laml_webhooks'[\s\S]*call_request_method = 'POST'[\s\S]*call_status_callback_method = 'POST'/i);
    expect(applySuccess).toMatch(/update public\.accounts[\s\S]*set call_tracking_number = v_inventory\.e164_number/i);
    expect(applySuccess).toMatch(/set lifecycle_state = 'released'[\s\S]*set call_tracking_number = null/i);
  });

  it('moves new call admission authority to voice inventory while preserving legacy history', () => {
    expect(migration).toContain('add column if not exists voice_number_id uuid');
    expect(migration).toContain('foreign key (voice_number_id) references public.voice_number_inventory(id)');
    expect(migration).toContain('pg_catalog.num_nonnulls(sender_number_id, voice_number_id) = 1');
    expect(claimCall).toMatch(/join public\.voice_number_inventory v/i);
    expect(claimCall).not.toContain('sms_sender_numbers');
    expect(claimCall).toMatch(/v_existing\.voice_number_id is distinct from v_voice_number_id/i);
    expect(claimCall).toMatch(/sender_number_id, voice_number_id[\s\S]*'claimed', null, v_voice_number_id/i);
    expect(migration).toContain('drop function if exists public.claim_voice_call_admission(uuid, text, text, integer)');
  });

  it('keeps all state service-read/RPC-write only and covers new foreign keys', () => {
    for (const table of [
      'voice_number_spend_policies',
      'voice_number_inventory',
      'voice_number_candidate_observations',
      'voice_number_purchase_authorizations',
      'voice_number_provisioning_operations',
      'voice_number_provisioning_attempts',
      'voice_number_operation_retry_authorizations',
    ]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(`alter table public.${table} force row level security`);
      expect(migration).toMatch(new RegExp(
        `revoke all on table public\\.${table}[\\s\\S]{0,100}from public, anon, authenticated, service_role`,
        'i',
      ));
      expect(migration).toContain(`grant select on table public.${table} to service_role`);
    }
    for (const table of [
      'voice_number_identity_cleanup_reservations',
      'voice_provider_terminal_call_tombstones',
    ]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(`alter table public.${table} force row level security`);
      expect(migration).toMatch(new RegExp(
        `revoke all on table public\\.${table}[\\s\\S]{0,100}from public, anon, authenticated, service_role`,
        'i',
      ));
      expect(migration).not.toContain(`grant select on table public.${table} to service_role`);
    }
    expect(migration).not.toMatch(/grant (?:insert|update|delete|all)[^;]*voice_number_[^;]*to service_role/i);
    expect(migration).not.toMatch(/grant execute[^;]*to (?:anon|authenticated)/i);
    expect(migration).toContain(
      'revoke all on function public.enumerate_pending_voice_number_identity_cleanups(uuid,uuid,integer)',
    );
    expect(migration).toContain(
      'grant execute on function public.enumerate_pending_voice_number_identity_cleanups(uuid,uuid,integer)',
    );
    expect(migration).toContain(
      'revoke all on function public.enumerate_purchase_voice_number_cleanup_anchors(uuid,integer)',
    );
    expect(migration).toContain(
      'grant execute on function public.enumerate_purchase_voice_number_cleanup_anchors(uuid,integer)',
    );
    for (const helper of [
      'unresolved_voice_number_identity_conflict(uuid,text,text)',
      'unresolved_messaging_number_identity_conflict(uuid,text,text)',
      'prevent_messaging_operation_voice_identity_conflict()',
      'prevent_voice_operation_identity_conflict()',
    ]) {
      expect(migration).toContain(`revoke all on function public.${helper}`);
      expect(migration).not.toContain(`grant execute on function public.${helper}`);
    }
    expect(migration).toContain('create index if not exists voice_tool_actions_target_job_idx');
    expect(migration).toContain('create index if not exists voice_tool_actions_target_lead_idx');
    expect(migration).toContain('voice_number_purchase_authorizations_consumed_operation_uidx');
    expect(migration).toContain('voice_number_operations_purchase_authorization_uidx');
    expect(migration).toContain('voice_number_purchase_authorizations_consumed_operation_uidx');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationName = '20260903172223_owner_shared_field_command_routing.sql';
const migration = readFileSync(
  new URL(`../migrations/${migrationName}`, import.meta.url),
  'utf8',
);
const latestIngress = readFileSync(
  new URL('../migrations/20260830120000_crew_field_intake.sql', import.meta.url),
  'utf8',
);
const providerIdentityMigration = readFileSync(
  new URL('../migrations/20260821182355_sms_webhook_safety.sql', import.meta.url),
  'utf8',
);

describe('platform SMS customer-inbox visibility migration', () => {
  it('runs after the latest shared-number ingress and adds a safe visible default', () => {
    expect(migrationName.localeCompare('20260830120000_crew_field_intake.sql')).toBeGreaterThan(0);
    expect(migration).toMatch(/add column if not exists inbox_visible boolean/i);
    expect(migration).toMatch(/alter column inbox_visible set default true/i);
    expect(migration).toMatch(/alter column inbox_visible set not null/i);
  });

  it('derives visibility from the exact sender row, never from a reusable phone number', () => {
    const visibilityBoundary = migration.slice(
      0,
      migration.indexOf('-- PostgreSQL ORs permissive policies.'),
    );
    expect(visibilityBoundary).toMatch(/where s\.id = m\.sender_number_id[\s\S]*s\.purpose in \('lgq_shared', 'lgq_dispatch'\)/i);
    expect(visibilityBoundary).toMatch(/where s\.id = new\.sender_number_id/i);
    expect(visibilityBoundary).toMatch(/v_sender_purpose not in \('lgq_shared', 'lgq_dispatch'\)/i);
    expect(visibilityBoundary).not.toMatch(/alert_phone|client_phone|from_number|phone_number\s*=/i);
  });

  it('replaces permissive legacy policies with command-specific hidden-row guards', () => {
    expect(migration).toMatch(/drop policy if exists sms_messages_all on public\.sms_messages/i);
    expect(migration).toMatch(/drop policy if exists sms_messages_modify on public\.sms_messages/i);
    expect(migration).not.toMatch(/create policy\s+\S+\s+on public\.sms_messages\s+for all/i);
    expect(migration).toMatch(/create policy sms_messages_select[\s\S]*for select[\s\S]*inbox_visible = true[\s\S]*messages\.read/i);
    expect(migration).toMatch(/create policy sms_messages_insert[\s\S]*for insert[\s\S]*messages\.send/i);
    expect(migration).toMatch(/create policy sms_messages_update[\s\S]*for update[\s\S]*inbox_visible = true[\s\S]*messages\.send/i);
    expect(migration).toMatch(/create policy sms_messages_delete[\s\S]*for delete[\s\S]*inbox_visible = true[\s\S]*messages\.send/i);
  });

  it('authorizes the exact live owner binding before delegating the atomic action', () => {
    expect(migration).toMatch(/create or replace function public\.apply_authorized_sms_field_action[\s\S]*security definer[\s\S]*set search_path = pg_catalog, pg_temp/i);
    expect(migration).toMatch(/from public\.sms_inbound_action_tasks t[\s\S]*for update/i);
    expect(migration).toMatch(/v_receipt\.sender_number_id is distinct from v_task\.sender_number_id[\s\S]*v_receipt\.sms_message_id is distinct from v_task\.sms_message_id/i);
    expect(migration).toMatch(/from public\.sms_messages m[\s\S]*m\.provider_id = v_receipt\.provider_event_id[\s\S]*m\.direction = 'inbound'[\s\S]*for share/i);
    expect(migration).toMatch(/s\.purpose = 'lgq_shared'[\s\S]*s\.suspended_at is null[\s\S]*for share/i);
    expect(migration).toMatch(/a\.suspended_at is null[\s\S]*v_is_owner := v_account\.high_value_sms_enabled is true[\s\S]*sms_normalize_recipient_phone\(v_account\.alert_phone\) = v_receipt\.from_number/i);
    expect(migration).toMatch(/cr\.access_revoked_at is null[\s\S]*v_crew_match_count <> 1[\s\S]*p_intent <> 'no_action'/i);
    expect(migration).toMatch(/scope\.consent_scope = v_required_scope[\s\S]*for share/i);
    expect(migration).toMatch(/p_intent = 'complete_job_task'[\s\S]*exact task ID/i);
    expect(migration).toMatch(/jsonb_typeof\(p_params->'amount'\) is distinct from 'number'[\s\S]*v_cost_amount > 1000000[\s\S]*v_cost_type not in/i);
    expect(migration).toMatch(/return public\.apply_owner_field_action\(/i);
    expect(migration).toMatch(/revoke all on function public\.apply_authorized_sms_field_action[\s\S]*grant execute[\s\S]*to service_role/i);
  });

  it('backfills platform rows hidden while preserving dedicated and legacy/null rows', () => {
    expect(migration).toMatch(/set inbox_visible = not exists \([\s\S]*s\.purpose in \('lgq_shared', 'lgq_dispatch'\)/i);
    expect(migration).toMatch(/coalesce\([\s\S]*v_sender_purpose not in[\s\S]*true[\s\S]*\)/i);
  });

  it('centralizes the invariant after provider identity hydration', () => {
    expect(migration).toContain('create or replace function public.derive_sms_message_inbox_visibility()');
    expect(migration).toMatch(/security definer[\s\S]*set search_path = pg_catalog, pg_temp/i);
    expect(migration).toMatch(/create trigger sms_messages_visibility_from_sender_guard[\s\S]*before insert or update of sender_number_id, sms_event_id, inbox_visible/i);
    expect(migration).toMatch(/revoke all on function public\.derive_sms_message_inbox_visibility\(\)[\s\S]*from public, anon, authenticated, service_role/i);
  });

  it('orders the visibility guard after the existing sender-identity guard', () => {
    const identityGuard = 'sms_messages_provider_identity_guard';
    const visibilityGuard = 'sms_messages_visibility_from_sender_guard';
    expect(providerIdentityMigration).toMatch(/create trigger sms_messages_provider_identity_guard[\s\S]*before insert or update on public\.sms_messages/i);
    expect(identityGuard.localeCompare(visibilityGuard)).toBeLessThan(0);
  });

  it('adds partial indexes for visible conversation reads and unread counts', () => {
    expect(migration).toMatch(/sms_messages_visible_recent_idx[\s\S]*\(account_id, created_at desc\)[\s\S]*where inbox_visible = true/i);
    expect(migration).toMatch(/sms_messages_visible_unread_idx[\s\S]*\(account_id\)[\s\S]*where inbox_visible = true[\s\S]*direction = 'inbound'[\s\S]*read_at is null/i);
  });

  it('extends only the live field claim beyond the worker deadline', () => {
    expect(migration).toMatch(/create or replace function public\.extend_sms_inbound_action_field_lease\(\s*p_task_id uuid,\s*p_claim_token uuid\s*\)/i);
    expect(migration).toMatch(/task_state = 'processing'[\s\S]*claim_token is not distinct from p_claim_token[\s\S]*lease_expires_at > v_now/i);
    expect(migration).toMatch(/v_now \+ interval '6 minutes'/i);
    expect(migration).toMatch(/revoke all on function public\.extend_sms_inbound_action_field_lease\(uuid,uuid\)[\s\S]*grant execute[\s\S]*to service_role/i);
  });

  it('keeps ingress bound to authenticated sender identity and the durable action task FK', () => {
    expect(latestIngress).toMatch(/insert into public\.sms_messages[\s\S]*provider, sender_number_id[\s\S]*p_provider, v_sender\.id/i);
    expect(latestIngress).toMatch(/disposition = 'routed'[\s\S]*sms_message_id = v_message_id/i);
    expect(migration).not.toMatch(/delete from public\.sms_messages|sms_message_id\s*=\s*null/i);
    expect(migration).not.toMatch(/alter table public\.sms_inbound_action_tasks|claim_sms_inbound_action/i);
  });

  it('retains the snake_case parameter contract of apply_owner_field_action', () => {
    expect(latestIngress).toMatch(/\(p_params->>'job_id'\)::uuid/i);
    expect(latestIngress).toMatch(/p_params->>'cost_type'/i);
    expect(latestIngress).toMatch(/p_params->>'client_name'/i);
    expect(latestIngress).toMatch(/p_params->>'client_phone'/i);
    expect(latestIngress).not.toMatch(/p_params->>'jobId'|p_params->>'clientName'|p_params->>'clientPhone'|p_params->>'costType'/i);
  });
});

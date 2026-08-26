import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(join(process.cwd(), 'migrations', '20260821182357_signalwire_dedicated_number_provisioning.sql'), 'utf8').replace(/\r\n/g, '\n');
const actions = readFileSync(join(process.cwd(), 'src', 'app', 'dashboard', 'messages', 'actions.ts'), 'utf8');
const setup = readFileSync(join(process.cwd(), 'src', 'app', 'dashboard', 'messages', 'MessagingSetup.tsx'), 'utf8');
const adminRegistrationActions = readFileSync(join(process.cwd(), 'src', 'app', 'admin', 'messaging', 'registrations', 'actions.ts'), 'utf8');
const ownerRegistrationAction = readFileSync(join(process.cwd(), 'src', 'app', 'dashboard', 'messages', 'dedicated-number', 'actions.ts'), 'utf8');
const ownerRegistrationPage = readFileSync(join(process.cwd(), 'src', 'app', 'dashboard', 'messages', 'dedicated-number', 'page.tsx'), 'utf8');
const adminRegistrationPage = readFileSync(join(process.cwd(), 'src', 'app', 'admin', 'messaging', 'registrations', 'page.tsx'), 'utf8');
const provisioning = readFileSync(join(process.cwd(), 'src', 'lib', 'messaging-number-provisioning.ts'), 'utf8');

describe('dedicated-number provisioning migration', () => {
  it('creates durable applications, append-only events, leased operations, and attempts', () => {
    for (const table of [
      'messaging_registration_applications',
      'messaging_compliance_verifications',
      'messaging_registration_events',
      'messaging_number_provisioning_operations',
      'messaging_number_provisioning_attempts',
    ]) expect(migration).toContain(`create table if not exists public.${table}`);
    expect(migration).toContain("state = 'request_started'");
    expect(migration).toContain("state = 'indeterminate'");
    expect(migration).toContain("outcome = 'lease_expired'");
    expect(migration).toContain('An indeterminate provider operation blocks later provisioning work');
    expect(migration).toContain("interval '5 minutes'");
    expect(migration).toContain('create trigger messaging_registration_events_append_only');
    expect(migration).toContain('create trigger messaging_number_attempts_append_only');
  });

  it('keeps every provisioning write service-only while owners receive select-only RLS', () => {
    expect(migration).toContain('alter table public.messaging_registration_applications force row level security');
    expect(migration).toContain('create policy messaging_registration_applications_owner_read');
    expect(migration).toContain('grant select on table public.messaging_registration_applications to authenticated');
    expect(migration).not.toMatch(/grant\s+(insert|update|delete)[^;]*messaging_registration_applications\s+to\s+authenticated/i);
    expect(migration).toContain('grant execute on function public.claim_messaging_number_operation');
    expect(migration).toContain('to service_role');
    expect(migration).toContain('alter table public.messaging_compliance_verifications force row level security');
    expect(migration).toContain('grant select on table public.messaging_compliance_verifications to service_role');
    expect(migration).not.toMatch(/grant\s+select[^;]*messaging_compliance_verifications\s+to\s+(authenticated|anon|public)/i);
    expect(migration).not.toMatch(/grant\s+(insert|update|delete)[^;]*messaging_compliance_verifications/i);
    expect(migration).toContain('grant execute on function public.record_messaging_compliance_verification(uuid,text,text,text)');
  });

  it('captures carrier registration evidence while isolating EIN verification', () => {
    for (const column of [
      'authorized_contact_name', 'authorized_contact_title', 'authorized_contact_email', 'authorized_contact_phone',
      'messaging_support_email', 'messaging_support_phone', 'opt_in_evidence_url',
    ]) {
      expect(migration).toContain(column);
      expect(provisioning).toContain(`p_${column}`);
    }
    expect(migration).not.toMatch(/\b(full_?ein|ein\s+text|tax_id\s+text)\b/i);
    expect(migration).toContain("ein_last_four ~ '^[0-9]{4}$'");
    expect(migration).toContain('application_revision = v_application.revision');
    expect(migration).toContain('Approval requires tax identity verification for the current application revision');
    expect(migration).toContain("'ein_last_four_recorded', true");
    expect(migration).not.toContain("'ein_last_four', p_ein_last_four");
  });

  it('requires an MFA-audited admin action to record compliance verification', () => {
    const action = adminRegistrationActions.slice(
      adminRegistrationActions.indexOf('export async function recordMessagingComplianceVerificationAction'),
      adminRegistrationActions.indexOf('export async function searchMessagingNumberCandidateAction'),
    );
    expect(action).toContain("requireMfaPermission('ops.manage')");
    expect(action).toContain('recordMessagingComplianceVerification');
    expect(action).toContain("action: 'messaging_compliance_verification_record'");
    expect(action).toContain('logAdminAction');
    expect(action).not.toMatch(/from\(['"]messaging_compliance_verifications['"]\)\.(insert|update|upsert)/);
  });

  it('collects contact/support/opt-in evidence and EIN securely with last-four compliance retention', () => {
    for (const field of [
      'authorizedContactName', 'authorizedContactTitle', 'authorizedContactEmail', 'authorizedContactPhone',
      'messagingSupportEmail', 'messagingSupportPhone', 'optInEvidenceUrl',
    ]) {
      expect(ownerRegistrationAction).toContain(`formData.get('${field}')`);
      expect(ownerRegistrationPage).toContain(`name="${field}"`);
    }
    expect(ownerRegistrationPage).toContain('name="ein"');
    expect(ownerRegistrationPage).toContain('stores only the verified last four digits');
    for (const field of [
      'selected.authorizedContactName', 'selected.authorizedContactTitle', 'selected.authorizedContactEmail',
      'selected.authorizedContactPhone', 'selected.messagingSupportEmail', 'selected.messagingSupportPhone',
      'selected.optInEvidenceUrl',
    ]) expect(adminRegistrationPage).toContain(field);
    expect(adminRegistrationPage).toContain('Approval will fail closed');
    expect(adminRegistrationPage).toContain('disabled={!complianceCurrent || !mutationsReady}');
  });

  it('enforces approval, candidate expiry, and the one-hour post-purchase hold before carrier spend/assignment', () => {
    expect(migration).toContain("v_application.status <> 'approved'");
    expect(migration).toContain("candidate_expires_at = v_now + interval '15 minutes'");
    expect(migration).toContain("v_application.purchased_at > v_now - interval '1 hour'");
    expect(migration).toContain('purchase is less than one hour old');
  });

  it('never treats an order-level processed state as activation', () => {
    const assignmentFunction = migration.slice(migration.indexOf('create or replace function public.record_messaging_number_assignment_state'));
    expect(assignmentFunction).toContain("when v_state = 'complete' then 'complete'");
    expect(assignmentFunction).toContain("provisioning_status = case when v_normalized = 'complete' then 'active'");
    expect(assignmentFunction).not.toContain("v_state = 'processed'");
    expect(migration).toContain("provider_assignment_state = 'complete'");
  });

  it('requires provider confirmation of the exact inbound route before readiness', () => {
    const completion = migration.slice(migration.indexOf('create or replace function public.complete_messaging_number_operation'));
    expect(completion).toContain("p_provider_result->>'message_request_url' is distinct from v_inbound_url");
    expect(completion).toContain("v_inbound_handler <> 'laml_webhooks'");
    expect(completion).toContain("v_operation.request_payload->>'message_handler'");
    expect(completion.indexOf("p_provider_result->>'message_request_url' is distinct from v_inbound_url"))
      .toBeLessThan(completion.indexOf('set inbound_webhook_url = v_inbound_url, inbound_configured_at = v_now'));
  });

  it('never rebinds an existing sender on an E.164 collision', () => {
    const completion = migration.slice(migration.indexOf('create or replace function public.complete_messaging_number_operation'));
    expect(completion).toContain('on conflict (provider, e164_number) do nothing');
    expect(completion).toContain("v_sender.purpose is distinct from 'contractor_dedicated'");
    expect(completion).toContain('v_sender.account_id is distinct from v_application.account_id');
    expect(completion).toContain('v_sender.provisioning_application_id is distinct from v_application.id');
    expect(completion).toContain('v_sender.provider_number_id is distinct from v_provider_number_id');
    expect(completion).not.toContain('set provider_number_id = excluded.provider_number_id');
  });

  it('orders MFA, exact confirmation, and the dark gate before purchase client construction', () => {
    const purchase = adminRegistrationActions.slice(
      adminRegistrationActions.indexOf('export async function purchaseMessagingNumberAction'),
      adminRegistrationActions.indexOf('export async function configureMessagingInboundAction'),
    );
    expect(purchase.indexOf("requireMfaPermission('ops.manage')")).toBeGreaterThanOrEqual(0);
    expect(purchase.indexOf('confirmation !== expectedConfirmation'))
      .toBeGreaterThan(purchase.indexOf("requireMfaPermission('ops.manage')"));
    expect(purchase.indexOf('await purchaseMessagingNumber'))
      .toBeGreaterThan(purchase.indexOf('confirmation !== expectedConfirmation'));
    expect(purchase.indexOf('requireProvisioningMutationEnabled()'))
      .toBeGreaterThan(purchase.indexOf('confirmation !== expectedConfirmation'));
    expect(purchase.indexOf('await purchaseMessagingNumber'))
      .toBeGreaterThan(purchase.indexOf('requireProvisioningMutationEnabled()'));
    expect(purchase).not.toContain('SignalWireNumberProvisioningClient.fromEnvironment');

    const execute = provisioning.slice(
      provisioning.indexOf('async function executeProviderMutation'),
      provisioning.indexOf('export async function searchAndRecordMessagingNumberCandidate'),
    );
    expect(execute.indexOf("process.env.LGQ_SIGNALWIRE_PROVISIONING_ENABLED !== '1'"))
      .toBeLessThan(execute.indexOf('input.runtime ?? defaultRuntime()'));
  });

  it('does not introduce pricing or an included dedicated-number allowance', () => {
    expect(migration).not.toMatch(/dedicated_business_numbers\s*[=:]\s*[1-9]/i);
    expect(migration).not.toMatch(/price|amount_cents|stripe_price/i);
  });

  it('gates owner compose and reply before enqueue and states the shared-number boundary', () => {
    expect((actions.match(/requireActiveDedicatedMessagingSender\(accountId\)/g) ?? [])).toHaveLength(2);
    expect(actions.indexOf('requireActiveDedicatedMessagingSender(accountId)')).toBeLessThan(actions.indexOf('await sendInboxReplySms'));
    expect(setup).toContain('shared numbers are reserved for LGQ account, billing, support');
    expect(setup).toContain('carrier-approved');
  });
});

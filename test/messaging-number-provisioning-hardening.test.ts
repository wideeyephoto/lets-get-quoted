import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'migrations', '20260821195147_signalwire_dedicated_number_hardening.sql'),
  'utf8',
).replace(/\r\n/g, '\n');
const adversarialMigration = readFileSync(
  join(process.cwd(), 'migrations', '20260821204404_signalwire_dedicated_number_adversarial_hardening.sql'),
  'utf8',
).replace(/\r\n/g, '\n');
const provisioning = readFileSync(join(process.cwd(), 'src', 'lib', 'messaging-number-provisioning.ts'), 'utf8');
const adapter = readFileSync(join(process.cwd(), 'src', 'lib', 'signalwire-number-provisioning.ts'), 'utf8');
const actions = readFileSync(join(process.cwd(), 'src', 'app', 'admin', 'messaging', 'registrations', 'actions.ts'), 'utf8');
const page = readFileSync(join(process.cwd(), 'src', 'app', 'admin', 'messaging', 'registrations', 'page.tsx'), 'utf8');

describe('dedicated-number provisioning hardening', () => {
  it('requires exact POST inbound evidence before either application or sender can activate', () => {
    expect(migration).toContain('add column if not exists inbound_request_method text');
    expect(migration).toContain("message_request_method', ''))) <> 'POST'");
    expect(migration).toContain("set inbound_request_method = 'POST'");
    expect(migration).toContain("v_application.inbound_request_method <> 'POST'");
    expect(migration).toContain("v_sender.inbound_request_method <> 'POST'");
    expect(adapter).toContain("updated.messageRequestMethod?.toUpperCase() !== 'POST'");
    expect(provisioning).toContain("message_request_method: 'POST'");
    expect(provisioning).toContain('requireExactSignalWireInboundWebhook');
    expect(provisioning).toContain("`${productionAppOrigin()}/api/sms/inbound`");
  });

  it('binds approval and assignment to carrier-complete brand, campaign, business, website, and EIN suffix', () => {
    for (const value of [
      'provider_brand_state',
      'provider_campaign_state',
      'provider_verified_at',
      'p_verified_legal_business_name',
      'p_verified_dba_name',
      'p_verified_website_host',
      'p_verified_ein_last_four',
    ]) expect(migration).toContain(value);
    expect(adapter).toContain('campaignBelongsToBrand');
    expect(adapter).toContain('/registry/beta/brands/${encodeURIComponent(input.brandId)}/campaigns');
    expect(provisioning).toContain('brand.companyName');
    expect(provisioning).toContain('brand.companyWebsite');
    expect(provisioning).toContain("brand.ein.replace(/\\D/g, '')");
    expect(provisioning).toContain('await input.store.recordCampaignVerification');
    expect(migration).toContain("v_application.provider_verified_at < v_now - interval '10 minutes'");
  });

  it('refuses unknown carrier pricing and enforces an aggregate monthly ceiling in the database', () => {
    expect(provisioning).toContain('LGQ_SIGNALWIRE_NUMBER_MONTHLY_PRICE_CENTS');
    expect(provisioning).toContain('LGQ_SIGNALWIRE_NUMBER_MONTHLY_SPEND_CEILING_CENTS');
    expect(actions).toContain('Purchase is blocked until an operator-reviewed monthly carrier price and aggregate spend ceiling are configured.');
    expect(migration).toContain("p_request_payload->>'monthly_price_cents'");
    expect(migration).toContain("p_request_payload->>'monthly_spend_ceiling_cents'");
    expect(migration).toContain('pg_catalog.pg_advisory_xact_lock');
    expect(migration).toContain("o.state in ('pending', 'claimed', 'request_started', 'indeterminate')");
    expect(migration).toContain('(v_purchased_count + v_reserved_count + v_additional_count) * v_monthly_price > v_monthly_ceiling');
    expect(page).toContain('Configured carrier price');
    expect(page).toContain('Aggregate dedicated-number ceiling');
  });

  it('preserves provider success evidence and offers only verified import or confirmed-absence recovery', () => {
    expect(provisioning).toContain('providerValue?.id ?? null');
    expect(provisioning).toContain('providerResult,');
    expect(migration).toContain('mark_messaging_number_operation_indeterminate_v2');
    expect(migration).toContain('provider_object_id = coalesce(p_provider_object_id, provider_object_id)');
    expect(migration).toContain("p_resolution not in ('confirmed_absent', 'confirmed_succeeded')");
    expect(migration).toContain('perform public.complete_messaging_number_operation_v2');
    expect(actions).toContain('resolveIndeterminateMessagingNumberOperation');
    expect(actions).toContain('`ABSENT ${operationId}`');
    expect(actions).toContain('`IMPORT ${operationId} ${providerObjectId}`');
    expect(page).toContain('Neither path issues a replacement purchase or update.');
    expect(adapter).toContain('findOwnedPhoneNumber');
    expect(adapter).toContain('filter_number: number');
    expect(provisioning).toContain('client.findOwnedPhoneNumber(expectedNumber)');
    expect(provisioning).toContain('Import that success; do not retry the purchase.');
  });

  it('compares the exact provider phone resource during reconciliation and activation', () => {
    expect(provisioning).toContain('assignment.providerNumberId !== input.expectedProviderNumberId');
    expect(provisioning).toContain('p_provider_number_id: activationEvidence?.providerNumberId ?? assignment.providerNumberId');
    expect(migration).toContain('p_provider_number_id is distinct from v_application.provider_number_id');
    expect(migration).toContain('p_provider_number_id is distinct from v_sender.provider_number_id');
  });

  it('retires bypassable RPCs and gates all activation-capable admin actions before client construction', () => {
    expect(migration).toMatch(/revoke all on function public\.claim_messaging_number_operation\([^;]+from public, anon, authenticated, service_role;/s);
    expect(migration).toMatch(/revoke all on function public\.record_messaging_number_assignment_state\([^;]+from public, anon, authenticated, service_role;/s);
    expect(migration).toContain('grant execute on function public.claim_messaging_number_operation_v2');
    expect(migration).toContain('grant execute on function public.record_messaging_number_assignment_state_v2');
    for (const actionName of [
      'purchaseMessagingNumberAction',
      'configureMessagingInboundAction',
      'assignMessagingCampaignAction',
      'reconcileMessagingAssignmentAction',
      'resolveMessagingNumberOperationAction',
    ]) {
      const start = actions.indexOf(`export async function ${actionName}`);
      expect(start).toBeGreaterThanOrEqual(0);
      const next = actions.indexOf('export async function ', start + 1);
      const action = actions.slice(start, next === -1 ? undefined : next);
      expect(action).toContain("requireMfaPermission('ops.manage')");
      expect(action).toContain('requireProvisioningMutationEnabled()');
    }
    expect(page).toContain('disabled={!mutationsReady}>Verify campaign and create assignment order');
    const approval = actions.slice(
      actions.indexOf('export async function reviewMessagingApplicationAction'),
      actions.indexOf('export async function recordMessagingComplianceVerificationAction'),
    );
    expect(approval.indexOf("confirmation !== `APPROVE ${id}`")).toBeGreaterThanOrEqual(0);
    expect(approval.indexOf('requireProvisioningMutationEnabled()')).toBeGreaterThan(approval.indexOf("confirmation !== `APPROVE ${id}`"));
    expect(approval.indexOf('requireSignalWireProviderProvisioningReadiness')).toBeGreaterThan(approval.indexOf('requireProvisioningMutationEnabled()'));
    expect(approval.indexOf('SignalWireNumberProvisioningClient.fromEnvironment()')).toBeGreaterThan(approval.indexOf('requireSignalWireProviderProvisioningReadiness'));
  });

  it('separates dark provider provisioning from the full live owner-egress lane', () => {
    for (const value of [
      'signalWireProviderProvisioningReadiness',
      'trustedProviderCallbackOrigin',
      'normalizeSignalWireSpaceOrigin',
      'SIGNALWIRE_PROJECT_ID',
      'SIGNALWIRE_API_TOKEN',
      'SIGNALWIRE_SIGNING_KEY',
      'requireSignalWireProviderProvisioningReadiness',
    ]) expect(provisioning).toContain(value);
    for (const value of [
      'signalWireMessagingLaneReadiness',
      'LGQ_SMS_DELIVERY_WORKER_ENABLED',
      'provider_lane_not_signalwire',
      'outboundSmsLaneSuppression',
      'outside_canary',
      'contractor_lane_disabled',
    ]) expect(provisioning).toContain(value);
    expect(provisioning).toContain(".eq('purpose', 'contractor_dedicated')");
    expect(provisioning).toContain(".eq('inbound_ready', true)");
    expect(provisioning).toContain("inboundMethod !== 'POST'");
    expect(page).toContain("const mutationsReady = gateEnabled && providerProvisioningReadiness?.kind === 'ready'");
    expect(page).toContain('customer texting remains dark');
  });

  it('does not grant a dedicated-number entitlement or create sellable pricing', () => {
    expect(migration).not.toMatch(/dedicated_business_numbers\s*[=:]\s*[1-9]/i);
    expect(migration).not.toMatch(/stripe_price|price_id|subscription_item/i);
    expect(page).toContain('allowance remains zero and unpriced');
  });

  it('quarantines legacy active inventory before adding validated final-proof constraints', () => {
    expect(adversarialMigration).toContain("set status = 'suspended'");
    expect(adversarialMigration).toContain("set provisioning_status = 'suspended'");
    expect(adversarialMigration).toContain("'legacy_active_inventory_quarantined'");
    expect(adversarialMigration).toContain('drop constraint if exists messaging_registration_application_verified_activation_shape');
    expect(adversarialMigration).toContain('drop constraint if exists sms_sender_numbers_activation_shape');
    expect(adversarialMigration).toContain('provider_phone_verified_at is not null');
    expect(adversarialMigration).toContain('provider_sms_capable is true');
    expect(adversarialMigration).toContain("inbound_request_method is not distinct from 'POST'");
    expect(adversarialMigration).toContain("pg_catalog.lower(coalesce(inbound_message_handler, '')) = 'laml_webhooks'");
    expect(adversarialMigration).not.toMatch(/add constraint messaging_registration_application_verified_activation_shape[\s\S]+?not valid;/i);
  });

  it('makes approved compliance immutable and stores carrier downgrades before suspension', () => {
    expect(adversarialMigration).toContain("v_application.status not in ('submitted', 'under_review', 'action_required', 'rejected')");
    expect(adversarialMigration).toContain('Approved or provisioned compliance evidence is immutable');
    expect(adversarialMigration).toContain('v_application.provider_brand_id is not null');
    expect(adversarialMigration).toContain('v_application.provider_campaign_id is not null');
    expect(adversarialMigration).toContain('v_application.provider_number_id is not null');
    expect(adversarialMigration).toContain("case when v_is_complete then 'provider_campaign_verified' else 'provider_campaign_downgraded' end");
    expect(adversarialMigration).toContain('provider_brand_state = v_brand_state');
    expect(adversarialMigration).toContain('provider_campaign_state = v_campaign_state');
    expect(adversarialMigration).toContain("else 'suspended'");
    expect(adversarialMigration).toContain("v_application.status_detail = 'SignalWire reports that the registered brand or campaign is no longer carrier-complete.'");
    expect(adversarialMigration).toContain("when v_restore_pre_purchase_approval then 'approved'");
  });

  it('blocks bound resubmission and post-approval review while preserving unbound preapproval edits', () => {
    expect(adversarialMigration).toContain('create or replace function public.prevent_bound_messaging_application_resubmission');
    expect(adversarialMigration).toContain('create trigger messaging_registration_applications_bound_resubmission_guard');
    expect(adversarialMigration).toContain('new.revision is distinct from old.revision');
    expect(adversarialMigration).toContain('old.provider_brand_id is not null');
    expect(adversarialMigration).toContain('o.application_id = old.id');
    expect(adversarialMigration).toContain("v_application.status not in ('submitted', 'under_review', 'action_required', 'rejected')");
    expect(adversarialMigration).toContain('An approved or carrier-bound messaging application is immutable in the review RPC');
    expect(adversarialMigration).toContain('revoke all on function public.prevent_bound_messaging_application_resubmission()');
  });

  it('uses one authoritative persisted spend policy and immutable per-operation snapshots', () => {
    expect(adversarialMigration).toContain('create table if not exists public.messaging_number_spend_policies');
    expect(adversarialMigration).toContain('create or replace function public.set_messaging_number_spend_policy');
    expect(adversarialMigration).toContain("from public.messaging_number_spend_policies");
    expect(adversarialMigration).toContain("p_request_payload->>'monthly_price_cents'");
    expect(adversarialMigration).toContain('<> v_policy.monthly_unit_price_cents');
    expect(adversarialMigration).toContain('<> v_policy.aggregate_monthly_ceiling_cents');
    expect(adversarialMigration).toContain('pg_catalog.sum(o.monthly_unit_price_cents)');
    expect(adversarialMigration).not.toContain('(v_purchased_count + v_reserved_count + v_additional_count) * v_monthly_price');
    expect(adversarialMigration).toContain('grant select on table public.messaging_number_spend_policies to service_role');
    expect(adversarialMigration).not.toMatch(/grant (insert|update|delete|all).*messaging_number_spend_policies/i);
    expect(provisioning).toContain(".from('messaging_number_spend_policies')");
    expect(provisioning).toContain('The database snapshot is the sole purchase authority');
    expect(actions).toContain('loadMessagingNumberPurchasePolicy(ctx.admin)');
    expect(actions).toContain('setMessagingNumberPurchasePolicy');
    expect(page).toContain('This database policy—not environment configuration—is snapshotted');
  });

  it('standardizes app-before-operation locks and requires exact normal-completion identity', () => {
    const completion = adversarialMigration.slice(
      adversarialMigration.indexOf('create or replace function public.complete_messaging_number_operation('),
      adversarialMigration.indexOf('create or replace function public.complete_messaging_number_operation_v2('),
    );
    const recovery = adversarialMigration.slice(
      adversarialMigration.indexOf('create or replace function public.resolve_messaging_number_operation_v2('),
      adversarialMigration.indexOf('-- -------------------------------------------------------------------------\n-- 8.'),
    );
    for (const body of [completion, recovery]) {
      const applicationLock = body.indexOf('select * into strict v_application');
      const operationLock = body.indexOf('select * into strict v_operation');
      expect(applicationLock).toBeGreaterThanOrEqual(0);
      expect(operationLock).toBeGreaterThan(applicationLock);
    }
    expect(adversarialMigration).toContain("p_provider_result->>'id' is distinct from p_provider_object_id");
    expect(adversarialMigration).toContain('Provider result identity does not match the completed provider object');
  });

  it('defers SMS capability to the final live-phone activation boundary', () => {
    const completionV2 = adversarialMigration.slice(
      adversarialMigration.indexOf('create or replace function public.complete_messaging_number_operation_v2('),
      adversarialMigration.indexOf('-- -------------------------------------------------------------------------\n-- 7.'),
    );
    expect(completionV2).not.toContain("p_provider_result->'capabilities'");
    expect(adversarialMigration).toContain('create or replace function public.record_messaging_number_assignment_state_v3');
    expect(adversarialMigration).toContain('p_sms_capable is distinct from true');
    expect(adversarialMigration).toContain('p_verified_number is distinct from v_application.purchased_number');
    expect(adversarialMigration).toContain("p_verified_inbound_method, ''))) <> 'POST'");
    expect(adversarialMigration).toContain('revoke all on function public.record_messaging_number_assignment_state_v2');
    expect(adversarialMigration).toContain('grant execute on function public.record_messaging_number_assignment_state_v3');
  });
});

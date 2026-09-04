import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function read(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
}

const page = () => read('src', 'app', 'admin', 'voice', 'numbers', 'page.tsx');
const actions = () => read('src', 'app', 'admin', 'voice', 'numbers', 'actions.ts');

function actionSource(name: string): string {
  const source = actions();
  const start = source.indexOf(`export async function ${name}`);
  const next = source.indexOf('export async function ', start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  return source.slice(start, next === -1 ? undefined : next);
}

describe('AI Voice number provisioning admin surface', () => {
  it('keeps the voice-only inventory and operator path separate from SMS/10DLC', () => {
    expect(page()).toContain(".from('voice_number_inventory')");
    expect(page()).not.toContain(".from('sms_sender_numbers')");
    expect(page()).toContain('This page never reclassifies or configures the shared messaging number.');
    expect(read('src', 'app', 'admin', 'messaging', 'registrations', 'page.tsx'))
      .toContain('AI Voice uses a separate voice-only inventory and purchase authorization rail.');
    expect(read('src', 'app', 'admin', 'AdminNav.tsx'))
      .toContain("{ href: '/admin/voice/numbers', label: 'AI Voice numbers' }");
  });

  it('renders distinct inbound and number-level status targets', () => {
    expect(page()).toContain('`${callbackOrigin}/api/voice/ai`');
    expect(page()).toContain('`${callbackOrigin}/api/voice/provider-status`');
    expect(page()).not.toContain('`${callbackOrigin}/api/voice/ai/status`');
    expect(page()).toContain('Number-level lifecycle events must');
    expect(page()).toContain('call_status_callback_method');
    expect(page()).toContain("inventory.call_status_callback_method ?? '—'");
  });

  it('makes search, dashboard-price evidence, one-time authorization, and purchase separate explicit steps', () => {
    const source = page();
    const policy = source.indexOf('1. Recurring-spend policy');
    const search = source.indexOf('2. Search voice-only inventory');
    const observation = source.indexOf('3. Record fresh dashboard price evidence');
    const authorize = source.indexOf('4. Authorize exact recurring charge');
    const purchase = source.indexOf('5. Purchase provider number');
    expect(policy).toBeGreaterThanOrEqual(0);
    expect(search).toBeGreaterThan(policy);
    expect(observation).toBeGreaterThan(search);
    expect(authorize).toBeGreaterThan(observation);
    expect(purchase).toBeGreaterThan(authorize);
    expect(source).toContain('SignalWire search API does not');
    expect(source).toContain('SignalWire dashboard (operator-observed)');
    expect(source).toContain('name="candidateObservationId"');
    expect(source).toContain('This is the only action on this page that may create a new recurring carrier charge.');
    expect(source).toContain('name="authorizationId"');
    expect(source).toContain('name="confirmation"');
  });

  it('fails closed on dark gates, missing policy evidence, and indeterminate outcomes', () => {
    const source = page();
    expect(source).toContain('const mutationEnabled = voiceNumberProvisioningMutationEnabled()');
    expect(source).toContain('&& mutationEnabled');
    expect(source).toContain('&& Boolean(policy?.purchase_enabled)');
    expect(source).toContain('&& authorizationCurrent');
    expect(source).toContain('&& !indeterminate');
    expect(source).toContain('&& unavailable.length === 0');
    expect(source).toContain('disabled={!purchaseReady}');
    expect(source).toContain('No automatic retry was issued.');
    expect(source).toContain('New purchase or configuration is');
    expect(source).toContain('quarantined until an operator performs');
  });

  it('has no client-side auto-submit or provider mutation request', () => {
    const source = page();
    expect(source).not.toContain("'use client'");
    expect(source).not.toMatch(/useEffect|useTransition|requestSubmit|\.submit\(|setInterval|setTimeout/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toContain('SignalWireNumberProvisioningClient');
  });

  it('requires fresh ops MFA on every action and the dark mutation gate on every mutation', () => {
    const actionNames = [
      'searchVoiceNumberCandidateAction',
      'recordVoiceNumberCandidateObservationAction',
      'setVoiceNumberSpendPolicyAction',
      'authorizeVoiceNumberPurchaseAction',
      'purchaseVoiceNumberAction',
      'configureVoiceNumberAction',
      'releaseVoiceNumberAction',
      'retryVoiceNumberOperationAction',
      'reconcileVoiceNumberAction',
    ];
    for (const name of actionNames) {
      expect(actionSource(name)).toContain("await requireMfaPermission('ops.manage')");
    }
    for (const name of actionNames.slice(1, 6)) {
      expect(actionSource(name)).toContain('requireVoiceNumberProvisioningMutationEnabled()');
    }
    expect(actionSource('releaseVoiceNumberAction')).not.toContain('requireVoiceNumberProvisioningMutationEnabled()');
    expect(actionSource('reconcileVoiceNumberAction')).not.toContain('requireVoiceNumberProvisioningMutationEnabled()');
    expect(actionSource('releaseVoiceNumberAction')).toContain('requireVoiceNumberRecoveryEnabled()');
    expect(actionSource('retryVoiceNumberOperationAction')).toContain('requireVoiceNumberRecoveryEnabled()');
    expect(actionSource('reconcileVoiceNumberAction')).toContain('requireVoiceNumberRecoveryEnabled()');
    expect(actionSource('searchVoiceNumberCandidateAction'))
      .toContain('searchVoiceNumberCandidates({ areaCode, region, maxResults: 10 })');
    expect(actionSource('searchVoiceNumberCandidateAction'))
      .not.toContain('requireVoiceNumberProvisioningMutationEnabled()');
  });

  it('keeps exact MFA-gated release and reconciliation available while acquisition is dark', () => {
    const source = page();
    const release = actionSource('releaseVoiceNumberAction');
    expect(source).toContain('The separate AI Voice recovery gate is dark. Exact-number release');
    expect(source).toContain('Type <code>RELEASE {inventory.e164_number}</code>');
    expect(source).toContain('action={releaseVoiceNumberAction}');
    expect(release).toContain('const expected = `RELEASE ${number}`');
    expect(release).toContain('await releaseVoiceNumber({');
    expect(release).not.toContain('requireVoiceNumberProvisioningMutationEnabled()');
    expect(actionSource('reconcileVoiceNumberAction')).not.toContain('requireVoiceNumberProvisioningMutationEnabled()');
  });

  it('re-searches the exact voice candidate and records separately typed dashboard-price evidence', () => {
    const observation = actionSource('recordVoiceNumberCandidateObservationAction');
    expect(observation).toContain('searchVoiceNumberCandidates({ areaCode, region, maxResults: 20 })');
    expect(actions()).toContain('I CHECKED SIGNALWIRE DASHBOARD');
    expect(observation).toContain('observationConfirmation(number, monthlyPriceCents)');
    expect(observation).toContain('recordVoiceNumberCandidateObservation({');
    expect(observation).toContain('priceEvidenceSource: observation.priceEvidenceSource');
    expect(page()).toContain(".from('voice_number_candidate_observations')");
    expect(page()).toContain('observed_at');
    expect(page()).toContain('price_evidence_source');
  });

  it('re-loads authoritative pricing and checks a second exact phrase before purchase', () => {
    const purchase = actionSource('purchaseVoiceNumberAction');
    const loadPolicy = purchase.indexOf('loadVoiceNumberPurchasePolicy(ctx.admin)');
    const expected = purchase.indexOf('voiceNumberPurchaseConfirmation(number, policy)');
    const comparison = purchase.indexOf('confirmation !== expected');
    const gate = purchase.indexOf('requireVoiceNumberProvisioningMutationEnabled()');
    const providerMutation = purchase.indexOf('await purchaseVoiceNumber({');
    expect(loadPolicy).toBeGreaterThanOrEqual(0);
    expect(expected).toBeGreaterThan(loadPolicy);
    expect(comparison).toBeGreaterThan(expected);
    expect(gate).toBeGreaterThan(comparison);
    expect(providerMutation).toBeGreaterThan(gate);
    expect(purchase).not.toContain("formData.get('monthlyPriceCents')");
    expect(purchase).not.toContain("formData.get('policyRevision')");
    expect(purchase).not.toContain('SignalWireNumberProvisioningClient');
  });

  it('never guesses an indeterminate outcome or issues a replacement purchase', () => {
    const reconcile = actionSource('reconcileVoiceNumberAction');
    expect(reconcile).toContain("'confirmed_absent' | 'confirmed_succeeded'");
    expect(reconcile).toContain('`RECONCILE ${operationId} CLEANUP AND IMPORT`');
    expect(reconcile).toContain('`RECONCILE ${operationId} CLEANUP AND MARK ABSENT`');
    expect(reconcile).toContain('resolveIndeterminateVoiceNumberOperation({');
    expect(reconcile).not.toContain('purchaseVoiceNumber({');
    expect(reconcile).not.toContain('configureVoiceNumberInbound({');
  });

  it('keeps retry recovery tokens server-only and exposes only an explicit bounded generation action', () => {
    const retry = actionSource('retryVoiceNumberOperationAction');
    expect(page()).toContain('Explicit operator retry generation');
    expect(page()).toContain('Nothing retries automatically.');
    expect(retry).toContain('retryFailedVoiceNumberOperation({');
    expect(retry).not.toMatch(/rawToken|recoveryTokenHmac|VOICE_NUMBER_RECOVERY_HMAC_SECRET/);
    expect(page()).not.toMatch(/rawToken|recoveryTokenHmac|VOICE_NUMBER_RECOVERY_HMAC_SECRET/);
  });
});

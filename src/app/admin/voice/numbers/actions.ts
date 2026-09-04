'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { logAdminAction } from '@/lib/admin';
import { requireMfaPermission } from '@/lib/auth';
import { redactMessagingRegistrationFailureMessage } from '@/lib/messaging-registration-action-failure';
import { normalizeUsPhone } from '@/lib/phone';
import {
  authorizeVoiceNumberPurchase,
  configureVoiceNumberInbound,
  loadVoiceNumberPurchasePolicy,
  purchaseVoiceNumber,
  recordVoiceNumberCandidateObservation,
  releaseVoiceNumber,
  requireVoiceNumberRecoveryEnabled,
  requireVoiceNumberProvisioningMutationEnabled,
  resolveIndeterminateVoiceNumberOperation,
  retryFailedVoiceNumberOperation,
  searchVoiceNumberCandidates,
  setVoiceNumberPurchasePolicy,
  voiceNumberPurchaseConfirmation,
} from '@/lib/voice/number-provisioning';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AREA_CODE = /^[2-9][0-9]{2}$/;

type VoiceNumberAction =
  | 'search_candidate'
  | 'record_candidate_observation'
  | 'set_spend_policy'
  | 'authorize_purchase'
  | 'purchase_number'
  | 'configure_number'
  | 'release_number'
  | 'retry_operation'
  | 'reconcile_operation';

function completed(accountId: string, done: string, extra: Record<string, string> = {}): never {
  const query = new URLSearchParams({ account: accountId, done, ...extra });
  redirect(`/admin/voice/numbers?${query}`);
}

function failed(
  accountId: string | null,
  action: VoiceNumberAction,
  fallbackCode: string,
  error: unknown,
): never {
  const correlationId = randomUUID();
  const providerCode = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';
  const errorCode = /^[a-z0-9][a-z0-9_.-]{0,63}$/i.test(providerCode)
    ? providerCode.toLowerCase()
    : fallbackCode;
  const safeMessage = redactMessagingRegistrationFailureMessage(
    error instanceof Error ? error.message : 'AI Voice number action failed.',
  );
  console.error({
    event: 'voice_number_admin_action_failed',
    correlationId,
    accountId,
    action,
    errorCode,
    safeMessage,
  });
  const query = new URLSearchParams({ error: '1', correlation: correlationId });
  if (accountId) query.set('account', accountId);
  redirect(`/admin/voice/numbers?${query}`);
}

function uuidField(formData: FormData, name: string, action: VoiceNumberAction): string {
  const value = String(formData.get(name) ?? '').trim().toLowerCase();
  if (!UUID.test(value)) failed(null, action, `invalid_${name}`, `${name} is missing or malformed.`);
  return value;
}

function phoneField(formData: FormData, name: string, accountId: string, action: VoiceNumberAction): string {
  const value = normalizeUsPhone(String(formData.get(name) ?? ''));
  if (!value || !/^\+1[2-9][0-9]{9}$/.test(value)) {
    failed(accountId, action, `invalid_${name}`, `${name} is missing or malformed.`);
  }
  return value;
}

function positiveCents(formData: FormData, name: string, label: string): number {
  const raw = String(formData.get(name) ?? '').trim();
  if (!/^[1-9][0-9]{0,8}$/.test(raw)) throw new Error(`${label} must be a positive whole number of cents.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new Error(`${label} is too large.`);
  return value;
}

function policyConfirmation(price: number, ceiling: number, enabled: boolean): string {
  return `SET VOICE POLICY USD ${(price / 100).toFixed(2)}/MO LIMIT USD ${(ceiling / 100).toFixed(2)}/MO ${enabled ? 'ENABLED' : 'DISABLED'}`;
}

function observationConfirmation(number: string, monthlyPriceCents: number): string {
  return `I CHECKED SIGNALWIRE DASHBOARD ${number} USD ${(monthlyPriceCents / 100).toFixed(2)}/MO`;
}

function refresh(): void {
  revalidatePath('/admin/voice/numbers');
  revalidatePath('/admin/health');
  revalidatePath('/dashboard/voice-calls');
}

async function requireAccount(
  accountId: string,
  action: VoiceNumberAction,
  admin: Awaited<ReturnType<typeof requireMfaPermission>>['admin'],
): Promise<{ id: string; businessName: string }> {
  const { data, error } = await admin
    .from('accounts')
    .select('id, business_name')
    .eq('id', accountId)
    .maybeSingle();
  if (error) failed(accountId, action, 'account_read_failed', error);
  if (!data || data.id !== accountId) failed(accountId, action, 'account_not_found', 'The workspace does not exist.');
  return {
    id: accountId,
    businessName: String(data.business_name ?? '').trim() || 'Contractor',
  };
}

export async function searchVoiceNumberCandidateAction(formData: FormData): Promise<void> {
  const action = 'search_candidate' satisfies VoiceNumberAction;
  const ctx = await requireMfaPermission('ops.manage');
  const accountId = uuidField(formData, 'accountId', action);
  await requireAccount(accountId, action, ctx.admin);
  const areaCode = String(formData.get('areaCode') ?? '').trim();
  const region = String(formData.get('region') ?? '').trim().toUpperCase();
  if (!AREA_CODE.test(areaCode) || !/^[A-Z]{2}$/.test(region)) {
    failed(accountId, action, 'invalid_search_market', 'Enter a valid US area code and two-letter region.');
  }
  let candidate: string;
  try {
    const candidates = await searchVoiceNumberCandidates({ areaCode, region, maxResults: 10 });
    const selected = candidates[0];
    if (!selected) throw new Error('SignalWire returned no voice-capable number for that market.');
    candidate = selected.number;
    await logAdminAction(ctx.admin, ctx, {
      action: 'voice_number_candidate_search',
      accountId,
      targetType: 'account',
      targetId: accountId,
      meta: { areaCode, region, candidateNumber: candidate, resultCount: candidates.length },
    });
  } catch (error) {
    failed(accountId, action, 'candidate_search_failed', error);
  }
  completed(accountId, 'candidate', { area: areaCode, region, candidate });
}

export async function recordVoiceNumberCandidateObservationAction(formData: FormData): Promise<void> {
  const action = 'record_candidate_observation' satisfies VoiceNumberAction;
  const ctx = await requireMfaPermission('ops.manage');
  const accountId = uuidField(formData, 'accountId', action);
  await requireAccount(accountId, action, ctx.admin);
  const number = phoneField(formData, 'candidateNumber', accountId, action);
  const areaCode = String(formData.get('areaCode') ?? '').trim();
  const region = String(formData.get('region') ?? '').trim().toUpperCase();
  if (!AREA_CODE.test(areaCode) || !/^[A-Z]{2}$/.test(region)) {
    failed(accountId, action, 'invalid_search_market', 'The exact candidate search market is missing or malformed.');
  }
  let monthlyPriceCents: number;
  try {
    monthlyPriceCents = positiveCents(formData, 'monthlyPriceCents', 'SignalWire dashboard monthly price');
  } catch (error) {
    failed(accountId, action, 'invalid_dashboard_price', error);
  }
  const expected = observationConfirmation(number, monthlyPriceCents);
  const confirmation = String(formData.get('confirmation') ?? '').trim();
  if (confirmation !== expected) {
    failed(accountId, action, 'confirmation_mismatch', `Type ${expected} exactly. No price evidence was recorded.`);
  }
  let observationId: string;
  try {
    requireVoiceNumberProvisioningMutationEnabled();
    // Re-run the provider search in the same request as the operator's price
    // attestation. The search proves only current availability/capability; the
    // typed cents are separately observed in SignalWire's dashboard.
    const candidates = await searchVoiceNumberCandidates({ areaCode, region, maxResults: 20 });
    const candidate = candidates.find((value) => normalizeUsPhone(value.number) === number && value.capabilities.voice);
    if (!candidate) {
      throw new Error('SignalWire no longer lists the exact candidate as available and voice capable.');
    }
    const observation = await recordVoiceNumberCandidateObservation({
      candidate,
      monthlyPriceCents,
      actorReference: ctx.adminEmail,
      admin: ctx.admin,
    });
    observationId = observation.id;
    await logAdminAction(ctx.admin, ctx, {
      action: 'voice_number_candidate_price_observed',
      accountId,
      targetType: 'voice_number_candidate_observation',
      targetId: observation.id,
      reason: confirmation,
      after: {
        number: observation.number,
        searchFingerprint: observation.searchFingerprint,
        monthlyPriceCents: observation.monthlyPriceCents,
        policyRevision: observation.policyRevision,
        priceEvidenceSource: observation.priceEvidenceSource,
        observedAt: observation.observedAt,
        expiresAt: observation.expiresAt,
      },
    });
  } catch (error) {
    failed(accountId, action, 'candidate_observation_failed', error);
  }
  refresh();
  completed(accountId, 'observed', {
    area: areaCode,
    region,
    candidate: number,
    observation: observationId,
  });
}

export async function setVoiceNumberSpendPolicyAction(formData: FormData): Promise<void> {
  const action = 'set_spend_policy' satisfies VoiceNumberAction;
  const ctx = await requireMfaPermission('ops.manage');
  const accountId = uuidField(formData, 'accountId', action);
  await requireAccount(accountId, action, ctx.admin);
  let monthlyPriceCents: number;
  let monthlySpendCeilingCents: number;
  try {
    monthlyPriceCents = positiveCents(formData, 'monthlyPriceCents', 'Monthly unit price');
    monthlySpendCeilingCents = positiveCents(formData, 'monthlySpendCeilingCents', 'Aggregate monthly ceiling');
  } catch (error) {
    failed(accountId, action, 'invalid_spend_policy', error);
  }
  if (monthlySpendCeilingCents < monthlyPriceCents) {
    failed(accountId, action, 'invalid_spend_policy_range', 'The aggregate ceiling cannot be lower than one monthly number price.');
  }
  const purchaseEnabled = formData.get('purchaseEnabled') === 'yes';
  const expected = policyConfirmation(monthlyPriceCents, monthlySpendCeilingCents, purchaseEnabled);
  const confirmation = String(formData.get('confirmation') ?? '').trim();
  if (confirmation !== expected) {
    failed(accountId, action, 'confirmation_mismatch', `Type ${expected} exactly. The policy was not changed.`);
  }
  try {
    requireVoiceNumberProvisioningMutationEnabled();
    const policy = await setVoiceNumberPurchasePolicy({
      monthlyPriceCents,
      monthlySpendCeilingCents,
      purchaseEnabled,
      actorReference: ctx.adminEmail,
      admin: ctx.admin,
    });
    await logAdminAction(ctx.admin, ctx, {
      action: 'voice_number_spend_policy_set',
      accountId,
      targetType: 'voice_number_spend_policy',
      targetId: policy.provider,
      reason: confirmation,
      after: {
        revision: policy.revision,
        purchaseEnabled: policy.purchaseEnabled,
        monthlyPriceCents: policy.monthlyPriceCents,
        monthlySpendCeilingCents: policy.monthlySpendCeilingCents,
      },
    });
  } catch (error) {
    failed(accountId, action, 'spend_policy_update_failed', error);
  }
  refresh();
  completed(accountId, 'policy');
}

export async function authorizeVoiceNumberPurchaseAction(formData: FormData): Promise<void> {
  const action = 'authorize_purchase' satisfies VoiceNumberAction;
  const ctx = await requireMfaPermission('ops.manage');
  const accountId = uuidField(formData, 'accountId', action);
  await requireAccount(accountId, action, ctx.admin);
  const number = phoneField(formData, 'candidateNumber', accountId, action);
  const candidateObservationId = uuidField(formData, 'candidateObservationId', action);
  const confirmation = String(formData.get('confirmation') ?? '').trim();
  try {
    requireVoiceNumberProvisioningMutationEnabled();
    const authorization = await authorizeVoiceNumberPurchase({
      accountId,
      number,
      candidateObservationId,
      confirmation,
      actorReference: ctx.adminEmail,
      admin: ctx.admin,
    });
    await logAdminAction(ctx.admin, ctx, {
      action: 'voice_number_purchase_authorized',
      accountId,
      targetType: 'voice_number_purchase_authorization',
      targetId: authorization.id,
      reason: confirmation,
      after: {
        number: authorization.number,
        candidateObservationId: authorization.candidateObservationId,
        policyRevision: authorization.policyRevision,
        monthlyPriceCents: authorization.monthlyPriceCents,
        monthlySpendCeilingCents: authorization.monthlySpendCeilingCents,
        priceEvidenceSource: authorization.priceEvidenceSource,
        priceObservedAt: authorization.priceObservedAt,
        expiresAt: authorization.expiresAt,
      },
    });
  } catch (error) {
    failed(accountId, action, 'purchase_authorization_failed', error);
  }
  refresh();
  completed(accountId, 'authorized', { candidate: number, observation: candidateObservationId });
}

export async function purchaseVoiceNumberAction(formData: FormData): Promise<void> {
  const action = 'purchase_number' satisfies VoiceNumberAction;
  const ctx = await requireMfaPermission('ops.manage');
  const accountId = uuidField(formData, 'accountId', action);
  await requireAccount(accountId, action, ctx.admin);
  const authorizationId = uuidField(formData, 'authorizationId', action);
  const number = phoneField(formData, 'candidateNumber', accountId, action);
  let policy: Awaited<ReturnType<typeof loadVoiceNumberPurchasePolicy>>;
  try {
    policy = await loadVoiceNumberPurchasePolicy(ctx.admin);
  } catch (error) {
    failed(accountId, action, 'purchase_policy_read_failed', error);
  }
  if (!policy || !policy.purchaseEnabled) {
    failed(accountId, action, 'purchase_policy_disabled', 'The authoritative AI Voice number purchase policy is missing or disabled.');
  }
  const expected = voiceNumberPurchaseConfirmation(number, policy);
  const confirmation = String(formData.get('confirmation') ?? '').trim();
  if (confirmation !== expected) {
    failed(accountId, action, 'confirmation_mismatch', `Type ${expected} exactly. Nothing was purchased.`);
  }
  try {
    // This gate executes before the service constructs provider credentials or
    // claims the one-time authorization. The service and SQL repeat it.
    requireVoiceNumberProvisioningMutationEnabled();
    const result = await purchaseVoiceNumber({
      accountId,
      number,
      authorizationId,
      purchasePolicy: policy,
    });
    await logAdminAction(ctx.admin, ctx, {
      action: 'voice_number_purchase',
      accountId,
      targetType: 'voice_number_purchase_authorization',
      targetId: authorizationId,
      reason: confirmation,
      after: {
        number,
        providerNumberId: result.providerObjectId,
        policyRevision: policy.revision,
        monthlyPriceCents: policy.monthlyPriceCents,
        monthlySpendCeilingCents: policy.monthlySpendCeilingCents,
        replay: result.replay,
      },
    });
  } catch (error) {
    failed(accountId, action, 'purchase_failed', error);
  }
  refresh();
  completed(accountId, 'purchased');
}

export async function configureVoiceNumberAction(formData: FormData): Promise<void> {
  const action = 'configure_number' satisfies VoiceNumberAction;
  const ctx = await requireMfaPermission('ops.manage');
  const accountId = uuidField(formData, 'accountId', action);
  const account = await requireAccount(accountId, action, ctx.admin);
  const inventoryId = uuidField(formData, 'inventoryId', action);
  const { data, error } = await ctx.admin
    .from('voice_number_inventory')
    .select('id, account_id, provider_number_id, e164_number, lifecycle_state')
    .eq('id', inventoryId)
    .eq('account_id', accountId)
    .maybeSingle();
  if (error) failed(accountId, action, 'inventory_read_failed', error);
  if (!data || data.lifecycle_state === 'released') {
    failed(accountId, action, 'inventory_not_configurable', 'The exact unreleased AI Voice inventory row was not found.');
  }
  const number = normalizeUsPhone(String(data.e164_number ?? ''));
  if (!number || !/^\+1[2-9][0-9]{9}$/.test(number)) {
    failed(accountId, action, 'invalid_inventory_number', 'The inventoried AI Voice number is invalid.');
  }
  const providerNumberId = String(data.provider_number_id ?? '').trim().toLowerCase();
  if (!UUID.test(providerNumberId)) {
    failed(accountId, action, 'invalid_provider_number_id', 'The SignalWire provider object identity is invalid.');
  }
  const expected = `CONFIGURE ${number} FOR AI VOICE`;
  const confirmation = String(formData.get('confirmation') ?? '').trim();
  if (confirmation !== expected) {
    failed(accountId, action, 'confirmation_mismatch', `Type ${expected} exactly. The provider number was not changed.`);
  }
  try {
    requireVoiceNumberProvisioningMutationEnabled();
    const result = await configureVoiceNumberInbound({
      accountId,
      voiceNumberId: inventoryId,
      providerNumberId,
      number,
      friendlyName: `LGQ ${account.businessName} AI Voice`,
    });
    await logAdminAction(ctx.admin, ctx, {
      action: 'voice_number_routes_configure',
      accountId,
      targetType: 'voice_number_inventory',
      targetId: inventoryId,
      reason: confirmation,
      after: { number, providerNumberId: result.providerObjectId, replay: result.replay },
    });
  } catch (operationError) {
    failed(accountId, action, 'configuration_failed', operationError);
  }
  refresh();
  completed(accountId, 'configured');
}

export async function releaseVoiceNumberAction(formData: FormData): Promise<void> {
  const action = 'release_number' satisfies VoiceNumberAction;
  const ctx = await requireMfaPermission('ops.manage');
  const accountId = uuidField(formData, 'accountId', action);
  await requireAccount(accountId, action, ctx.admin);
  const inventoryId = uuidField(formData, 'inventoryId', action);
  const { data, error } = await ctx.admin
    .from('voice_number_inventory')
    .select('id, account_id, provider_number_id, e164_number, lifecycle_state')
    .eq('id', inventoryId)
    .eq('account_id', accountId)
    .maybeSingle();
  if (error) failed(accountId, action, 'inventory_read_failed', error);
  if (!data || data.lifecycle_state === 'released') {
    failed(accountId, action, 'inventory_not_releasable', 'The exact unreleased AI Voice inventory row was not found.');
  }
  const number = normalizeUsPhone(String(data.e164_number ?? ''));
  if (!number || !/^\+1[2-9][0-9]{9}$/.test(number)) {
    failed(accountId, action, 'invalid_inventory_number', 'The inventoried AI Voice number is invalid.');
  }
  const providerNumberId = String(data.provider_number_id ?? '').trim().toLowerCase();
  if (!UUID.test(providerNumberId)) {
    failed(accountId, action, 'invalid_provider_number_id', 'The SignalWire provider object identity is invalid.');
  }
  const expected = `RELEASE ${number}`;
  const confirmation = String(formData.get('confirmation') ?? '').trim();
  if (confirmation !== expected) {
    failed(accountId, action, 'confirmation_mismatch', `Type ${expected} exactly. The provider number was not released.`);
  }
  try {
    // Release uses a separate, short-lived operational recovery gate. It can
    // stay available while new acquisition is dark without being always-on.
    requireVoiceNumberRecoveryEnabled();
    const result = await releaseVoiceNumber({
      accountId,
      voiceNumberId: inventoryId,
      providerNumberId,
      number,
    });
    await logAdminAction(ctx.admin, ctx, {
      action: 'voice_number_release',
      accountId,
      targetType: 'voice_number_inventory',
      targetId: inventoryId,
      reason: confirmation,
      before: { number, providerNumberId, lifecycleState: data.lifecycle_state },
      after: { number, providerNumberId: result.providerObjectId, released: true, replay: result.replay },
    });
  } catch (operationError) {
    failed(accountId, action, 'release_failed', operationError);
  }
  refresh();
  completed(accountId, 'released');
}

export async function retryVoiceNumberOperationAction(formData: FormData): Promise<void> {
  const action = 'retry_operation' satisfies VoiceNumberAction;
  const ctx = await requireMfaPermission('ops.manage');
  const accountId = uuidField(formData, 'accountId', action);
  await requireAccount(accountId, action, ctx.admin);
  const operationId = uuidField(formData, 'operationId', action);
  const { data, error } = await ctx.admin
    .from('voice_number_provisioning_operations')
    .select('id, account_id, operation_type, state, request_payload')
    .eq('id', operationId)
    .eq('account_id', accountId)
    .maybeSingle();
  if (error) failed(accountId, action, 'operation_read_failed', error);
  if (!data || data.state !== 'failed' || !['configure_voice', 'release_number'].includes(data.operation_type)) {
    failed(accountId, action, 'operation_not_retryable', 'Only an exact failed AI Voice configuration or release can be retried.');
  }
  const payload = data.request_payload && typeof data.request_payload === 'object' && !Array.isArray(data.request_payload)
    ? data.request_payload as Record<string, unknown>
    : null;
  if (!payload) failed(accountId, action, 'operation_payload_invalid', 'The failed operation payload is unavailable.');
  const number = normalizeUsPhone(String(payload.number ?? ''));
  if (!number || !/^\+1[2-9][0-9]{9}$/.test(number)) {
    failed(accountId, action, 'operation_number_invalid', 'The failed operation number is invalid.');
  }
  const verb = data.operation_type === 'configure_voice' ? 'CONFIGURE' : 'RELEASE';
  const expected = `RETRY ${verb} ${number} AFTER ${operationId}`;
  const confirmation = String(formData.get('confirmation') ?? '').trim();
  if (confirmation !== expected) {
    failed(accountId, action, 'confirmation_mismatch', `Type ${expected} exactly. No retry was authorized.`);
  }
  try {
    requireVoiceNumberRecoveryEnabled();
    const result = await retryFailedVoiceNumberOperation({
      accountId,
      failedOperationId: operationId,
      actorReference: ctx.adminEmail,
      reason: confirmation,
      admin: ctx.admin,
    });
    await logAdminAction(ctx.admin, ctx, {
      action: 'voice_number_operation_retry',
      accountId,
      targetType: 'voice_number_provisioning_operation',
      targetId: operationId,
      reason: confirmation,
      after: {
        retryAuthorizationId: result.retryAuthorizationId,
        retryGeneration: result.retryGeneration,
        providerObjectId: result.providerObjectId,
        replay: result.replay,
      },
    });
  } catch (operationError) {
    failed(accountId, action, 'retry_failed', operationError);
  }
  refresh();
  completed(accountId, 'retried');
}

export async function reconcileVoiceNumberAction(formData: FormData): Promise<void> {
  const action = 'reconcile_operation' satisfies VoiceNumberAction;
  const ctx = await requireMfaPermission('ops.manage');
  const accountId = uuidField(formData, 'accountId', action);
  await requireAccount(accountId, action, ctx.admin);
  const operationId = uuidField(formData, 'operationId', action);
  const resolution = String(formData.get('resolution') ?? '') as 'confirmed_absent' | 'confirmed_succeeded';
  if (!['confirmed_absent', 'confirmed_succeeded'].includes(resolution)) {
    failed(accountId, action, 'invalid_resolution', 'Choose a valid provider reconciliation outcome.');
  }
  const expected = resolution === 'confirmed_succeeded'
    ? `RECONCILE ${operationId} CLEANUP AND IMPORT`
    : `RECONCILE ${operationId} CLEANUP AND MARK ABSENT`;
  const confirmation = String(formData.get('confirmation') ?? '').trim();
  if (confirmation !== expected) {
    failed(accountId, action, 'confirmation_mismatch', `Type ${expected} exactly. The quarantined operation was not changed.`);
  }
  try {
    requireVoiceNumberRecoveryEnabled();
    await resolveIndeterminateVoiceNumberOperation({
      accountId,
      operationId,
      resolution,
      actorReference: ctx.adminEmail,
      admin: ctx.admin,
    });
    await logAdminAction(ctx.admin, ctx, {
      action: 'voice_number_operation_reconcile',
      accountId,
      targetType: 'voice_number_provisioning_operation',
      targetId: operationId,
      reason: confirmation,
      after: { resolution },
    });
  } catch (error) {
    failed(accountId, action, 'reconciliation_failed', error);
  }
  refresh();
  completed(accountId, 'reconciled');
}

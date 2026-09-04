import 'server-only';

import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { trustedProviderCallbackOrigin } from '@/lib/app-origin';
import { createAdminClient } from '@/lib/auth';
import { normalizeUsPhone } from '@/lib/phone';
import {
  SignalWireNumberProvisioningClient,
  SignalWireProvisioningError,
  type SignalWireNumberCandidate,
  type SignalWirePhoneNumber,
} from '@/lib/signalwire-number-provisioning';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX_64 = /^[a-f0-9]{64}$/;
const VOICE_PROVISIONING_FLAG = 'LGQ_SIGNALWIRE_VOICE_PROVISIONING_ENABLED';
const VOICE_RECOVERY_FLAG = 'LGQ_SIGNALWIRE_VOICE_RECOVERY_ENABLED';

type RpcError = Readonly<{ code?: string; message?: string }> | null;

function rpcFailure(label: string, error: RpcError): Error {
  return new Error(`${label}: ${error?.message?.trim() || error?.code?.trim() || 'unknown database error'}`);
}

function oneRow(value: unknown, label: string): Record<string, unknown> {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`${label} returned no row.`);
  return row as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is missing.`);
  return value.trim();
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requiredUuid(value: unknown, label: string): string {
  const candidate = requiredString(value, label);
  if (!UUID.test(candidate)) throw new Error(`${label} is invalid.`);
  return candidate.toLowerCase();
}

function safeInteger(value: unknown, label: string): number {
  const parsed = typeof value === 'number' ? value : Number(String(value));
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} is invalid.`);
  return parsed;
}

function canonicalVoiceNumber(value: string): string {
  const number = normalizeUsPhone(value);
  if (!number || !/^\+1[2-9][0-9]{9}$/.test(number)) {
    throw new Error('AI Voice number must be a valid US E.164 number.');
  }
  return number;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${canonical(row[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function operationFingerprint(value: unknown): string {
  return createHash('sha256').update(canonical(value), 'utf8').digest('hex');
}

function centsLabel(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export type VoiceNumberPurchasePolicy = Readonly<{
  monthlyPriceCents: number;
  monthlySpendCeilingCents: number;
  confirmationSuffix: string;
  monthlyPriceLabel: string;
  monthlySpendCeilingLabel: string;
}>;

export type StoredVoiceNumberPurchasePolicy = VoiceNumberPurchasePolicy & Readonly<{
  provider: 'signalwire';
  purchaseEnabled: boolean;
  revision: number;
  updatedAt: string;
}>;

function purchasePolicyValue(
  monthlyPriceCents: number,
  monthlySpendCeilingCents: number,
): VoiceNumberPurchasePolicy {
  if (
    !Number.isSafeInteger(monthlyPriceCents)
    || !Number.isSafeInteger(monthlySpendCeilingCents)
    || monthlyPriceCents < 1
    || monthlySpendCeilingCents < monthlyPriceCents
  ) {
    throw new Error('Stored AI Voice number spend policy is invalid. Purchase remains blocked.');
  }
  return Object.freeze({
    monthlyPriceCents,
    monthlySpendCeilingCents,
    confirmationSuffix: `USD ${(monthlyPriceCents / 100).toFixed(2)}/MO`,
    monthlyPriceLabel: `${centsLabel(monthlyPriceCents)}/month`,
    monthlySpendCeilingLabel: `${centsLabel(monthlySpendCeilingCents)}/month`,
  });
}

export function voiceNumberPurchaseConfirmation(
  number: string,
  policy: VoiceNumberPurchasePolicy,
): string {
  return `PURCHASE ${canonicalVoiceNumber(number)} ${policy.confirmationSuffix}`;
}

export async function loadVoiceNumberPurchasePolicy(
  admin: SupabaseClient = createAdminClient(),
): Promise<StoredVoiceNumberPurchasePolicy | null> {
  const { data, error } = await admin
    .from('voice_number_spend_policies')
    .select('provider, currency, monthly_unit_price_cents, aggregate_monthly_ceiling_cents, purchase_enabled, revision, updated_at')
    .eq('provider', 'signalwire')
    .maybeSingle();
  if (error) throw rpcFailure('Unable to load the authoritative AI Voice number spend policy', error);
  if (!data) return null;
  const row = data as unknown as Record<string, unknown>;
  if (row.provider !== 'signalwire' || row.currency !== 'USD') {
    throw new Error('Stored AI Voice number spend policy provider or currency is invalid.');
  }
  const revision = safeInteger(row.revision, 'Stored AI Voice spend policy revision');
  if (revision < 1) throw new Error('Stored AI Voice spend policy revision is invalid.');
  if (typeof row.purchase_enabled !== 'boolean') {
    throw new Error('Stored AI Voice number purchase-enabled state is invalid.');
  }
  return Object.freeze({
    provider: 'signalwire' as const,
    purchaseEnabled: row.purchase_enabled,
    revision,
    updatedAt: requiredString(row.updated_at, 'Stored AI Voice spend policy update time'),
    ...purchasePolicyValue(
      safeInteger(row.monthly_unit_price_cents, 'Stored monthly AI Voice number price'),
      safeInteger(row.aggregate_monthly_ceiling_cents, 'Stored monthly AI Voice number ceiling'),
    ),
  });
}

export async function setVoiceNumberPurchasePolicy(input: Readonly<{
  monthlyPriceCents: number;
  monthlySpendCeilingCents: number;
  purchaseEnabled: boolean;
  actorReference: string;
  admin?: SupabaseClient;
}>): Promise<StoredVoiceNumberPurchasePolicy> {
  requireVoiceNumberProvisioningMutationEnabled();
  purchasePolicyValue(input.monthlyPriceCents, input.monthlySpendCeilingCents);
  const actorReference = input.actorReference.trim().slice(0, 320);
  if (actorReference.length < 3) throw new Error('AI Voice spend-policy actor is invalid.');
  const admin = input.admin ?? createAdminClient();
  const { data, error } = await admin.rpc('set_voice_number_spend_policy', {
    p_provider: 'signalwire',
    p_monthly_unit_price_cents: input.monthlyPriceCents,
    p_aggregate_monthly_ceiling_cents: input.monthlySpendCeilingCents,
    p_purchase_enabled: input.purchaseEnabled,
    p_actor_reference: actorReference,
  });
  if (error) throw rpcFailure('Unable to set the authoritative AI Voice number spend policy', error);
  const row = oneRow(data, 'AI Voice number spend policy');
  if (row.provider !== 'signalwire' || row.currency !== 'USD') {
    throw new Error('AI Voice number spend policy update returned an invalid provider or currency.');
  }
  if (typeof row.purchase_enabled !== 'boolean') {
    throw new Error('AI Voice number spend policy update returned an invalid purchase-enabled state.');
  }
  return Object.freeze({
    provider: 'signalwire' as const,
    purchaseEnabled: row.purchase_enabled,
    revision: safeInteger(row.revision, 'AI Voice number spend policy revision'),
    updatedAt: requiredString(row.updated_at, 'AI Voice number spend policy update time'),
    ...purchasePolicyValue(
      safeInteger(row.monthly_unit_price_cents, 'AI Voice monthly number price'),
      safeInteger(row.aggregate_monthly_ceiling_cents, 'AI Voice monthly number ceiling'),
    ),
  });
}

export type VoiceNumberPurchaseAuthorization = Readonly<{
  id: string;
  candidateObservationId: string;
  accountId: string;
  number: string;
  policyRevision: number;
  monthlyPriceCents: number;
  monthlySpendCeilingCents: number;
  priceEvidenceSource: 'signalwire_dashboard';
  priceObservedAt: string;
  authorizedAt: string;
  expiresAt: string;
}>;

export type VoiceNumberCandidateObservation = Readonly<{
  id: string;
  number: string;
  searchFingerprint: string;
  monthlyPriceCents: number;
  policyRevision: number;
  priceEvidenceSource: 'signalwire_dashboard';
  observedAt: string;
  expiresAt: string;
}>;

function candidateProviderResult(candidate: SignalWireNumberCandidate): Record<string, unknown> {
  const number = canonicalVoiceNumber(candidate.number);
  if (!candidate.capabilities.voice) {
    throw new Error('SignalWire search did not prove that the candidate is voice capable.');
  }
  return Object.freeze({
    provider: 'signalwire',
    number,
    voice_capable: true,
    region: candidate.region?.trim().toUpperCase() || null,
    city: candidate.city?.trim().slice(0, 160) || null,
    capabilities: Object.freeze({
      voice: true,
      sms: Boolean(candidate.capabilities.sms),
      mms: Boolean(candidate.capabilities.mms),
      fax: Boolean(candidate.capabilities.fax),
    }),
  });
}

export async function recordVoiceNumberCandidateObservation(input: Readonly<{
  candidate: SignalWireNumberCandidate;
  monthlyPriceCents: number;
  actorReference: string;
  observationNonce?: string;
  admin?: SupabaseClient;
}>): Promise<VoiceNumberCandidateObservation> {
  requireVoiceNumberProvisioningMutationEnabled();
  const actorReference = input.actorReference.trim().slice(0, 320);
  if (actorReference.length < 3) throw new Error('AI Voice dashboard-price observer is invalid.');
  const admin = input.admin ?? createAdminClient();
  const policy = await loadVoiceNumberPurchasePolicy(admin);
  if (!policy?.purchaseEnabled) {
    throw new Error('AI Voice number purchases are disabled by the authoritative spend policy.');
  }
  if (!Number.isSafeInteger(input.monthlyPriceCents) || input.monthlyPriceCents !== policy.monthlyPriceCents) {
    throw new Error('The operator-observed SignalWire dashboard price does not match the current spend policy.');
  }
  const providerResult = candidateProviderResult(input.candidate);
  const number = requiredString(providerResult.number, 'SignalWire candidate number');
  const observationNonce = input.observationNonce?.trim() || randomUUID();
  if (!/^[A-Za-z0-9][A-Za-z0-9:._/-]{7,249}$/.test(observationNonce)) {
    throw new Error('AI Voice candidate observation nonce is invalid.');
  }
  const searchFingerprint = operationFingerprint({
    providerResult,
    monthlyPriceCents: policy.monthlyPriceCents,
    policyRevision: policy.revision,
    priceEvidenceSource: 'signalwire_dashboard',
    observationNonce,
  });
  const { data, error } = await admin.rpc('record_voice_number_candidate_observation', {
    p_provider: 'signalwire',
    p_candidate_number: number,
    p_voice_capable: true,
    p_search_fingerprint: searchFingerprint,
    p_provider_result: providerResult,
    p_monthly_unit_price_cents: policy.monthlyPriceCents,
    p_spend_policy_revision: policy.revision,
    p_price_evidence_source: 'signalwire_dashboard',
    p_actor_reference: actorReference,
  });
  if (error) throw rpcFailure('Unable to record the AI Voice candidate and dashboard-price observation', error);
  const row = oneRow(data, 'AI Voice candidate and dashboard-price observation');
  const returnedPrice = safeInteger(row.monthly_unit_price_cents, 'Observed AI Voice monthly price');
  const returnedRevision = safeInteger(row.spend_policy_revision, 'Observed AI Voice policy revision');
  if (returnedPrice !== policy.monthlyPriceCents || returnedRevision !== policy.revision) {
    throw new Error('AI Voice candidate observation did not preserve the exact reviewed price revision.');
  }
  if (row.price_evidence_source !== 'signalwire_dashboard') {
    throw new Error('AI Voice candidate observation returned an invalid price-evidence source.');
  }
  return Object.freeze({
    id: requiredUuid(row.observation_id, 'AI Voice candidate observation ID'),
    number,
    searchFingerprint,
    monthlyPriceCents: returnedPrice,
    policyRevision: returnedRevision,
    priceEvidenceSource: 'signalwire_dashboard' as const,
    observedAt: requiredString(row.observed_at, 'AI Voice dashboard-price observation time'),
    expiresAt: requiredString(row.expires_at, 'AI Voice dashboard-price observation expiry'),
  });
}

export async function authorizeVoiceNumberPurchase(input: Readonly<{
  accountId: string;
  number: string;
  candidateObservationId: string;
  confirmation: string;
  confirmationKey?: string;
  actorReference: string;
  admin?: SupabaseClient;
}>): Promise<VoiceNumberPurchaseAuthorization> {
  requireVoiceNumberProvisioningMutationEnabled();
  const accountId = requiredUuid(input.accountId, 'AI Voice account ID');
  const number = canonicalVoiceNumber(input.number);
  const candidateObservationId = requiredUuid(input.candidateObservationId, 'AI Voice candidate observation ID');
  const actorReference = input.actorReference.trim().slice(0, 320);
  if (actorReference.length < 3) throw new Error('AI Voice purchase authorizer is invalid.');
  const admin = input.admin ?? createAdminClient();
  const policy = await loadVoiceNumberPurchasePolicy(admin);
  if (!policy) throw new Error('No authoritative AI Voice number price is configured. Purchase remains blocked.');
  if (!policy.purchaseEnabled) throw new Error('AI Voice number purchases are disabled by the authoritative spend policy.');
  const expected = voiceNumberPurchaseConfirmation(number, policy);
  if (input.confirmation !== expected) {
    throw new Error(`Type ${expected} exactly to authorize this recurring charge.`);
  }
  const confirmationKey = input.confirmationKey?.trim() || `voice-auth:${randomUUID()}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9:._/+\-]{15,249}$/.test(confirmationKey)) {
    throw new Error('AI Voice purchase confirmation key is invalid.');
  }
  const { data, error } = await admin.rpc('authorize_voice_number_purchase', {
    p_account_id: accountId,
    p_provider: 'signalwire',
    p_candidate_number: number,
    p_candidate_observation_id: candidateObservationId,
    p_monthly_unit_price_cents: policy.monthlyPriceCents,
    p_aggregate_monthly_ceiling_cents: policy.monthlySpendCeilingCents,
    p_spend_policy_revision: policy.revision,
    p_confirmation_key: confirmationKey,
    p_actor_reference: actorReference,
  });
  if (error) throw rpcFailure('Unable to authorize the AI Voice number purchase', error);
  const row = oneRow(data, 'AI Voice number purchase authorization');
  const returnedRevision = safeInteger(row.spend_policy_revision, 'Authorized AI Voice policy revision');
  if (returnedRevision !== policy.revision) {
    throw new Error('AI Voice purchase authorization did not preserve the exact reviewed policy revision.');
  }
  const returnedObservationId = requiredUuid(row.candidate_observation_id, 'Authorized AI Voice candidate observation ID');
  if (returnedObservationId !== candidateObservationId) {
    throw new Error('AI Voice purchase authorization did not preserve the exact candidate observation.');
  }
  if (row.price_evidence_source !== 'signalwire_dashboard') {
    throw new Error('AI Voice purchase authorization returned an invalid price-evidence source.');
  }
  return Object.freeze({
    id: requiredUuid(row.authorization_id, 'AI Voice purchase authorization ID'),
    candidateObservationId: returnedObservationId,
    accountId,
    number,
    policyRevision: returnedRevision,
    monthlyPriceCents: policy.monthlyPriceCents,
    monthlySpendCeilingCents: policy.monthlySpendCeilingCents,
    priceEvidenceSource: 'signalwire_dashboard' as const,
    priceObservedAt: requiredString(row.price_observed_at, 'Authorized AI Voice dashboard-price observation time'),
    authorizedAt: requiredString(row.authorized_at, 'AI Voice purchase authorization time'),
    expiresAt: requiredString(row.expires_at, 'AI Voice purchase authorization expiry'),
  });
}

export class VoiceNumberProvisioningGateError extends Error {
  constructor() {
    super(`AI Voice number provisioning is dark. Set ${VOICE_PROVISIONING_FLAG}=1 only after staging and operator review pass.`);
    this.name = 'VoiceNumberProvisioningGateError';
  }
}

export class VoiceNumberRecoveryGateError extends Error {
  constructor() {
    super(`AI Voice number recovery is dark. Set ${VOICE_RECOVERY_FLAG}=1 only for a reviewed release, reconciliation, or explicit retry generation.`);
    this.name = 'VoiceNumberRecoveryGateError';
  }
}

export function voiceNumberProvisioningMutationEnabled(): boolean {
  return process.env[VOICE_PROVISIONING_FLAG] === '1';
}

export function requireVoiceNumberProvisioningMutationEnabled(): void {
  if (!voiceNumberProvisioningMutationEnabled()) throw new VoiceNumberProvisioningGateError();
}

export function voiceNumberRecoveryEnabled(): boolean {
  return process.env[VOICE_RECOVERY_FLAG] === '1';
}

export function requireVoiceNumberRecoveryEnabled(): void {
  if (!voiceNumberRecoveryEnabled()) throw new VoiceNumberRecoveryGateError();
}

export function requireExactSignalWireVoiceInboundWebhook(raw: string): string {
  const origin = trustedProviderCallbackOrigin();
  if (!origin) {
    throw new Error('NEXT_PUBLIC_APP_URL must be a trusted bare production HTTPS origin before AI Voice number provisioning.');
  }
  const expected = `${origin}/api/voice/ai`;
  if (raw.trim() !== expected) throw new Error(`AI Voice inbound webhook must exactly match ${expected}.`);
  return expected;
}

export function requireExactSignalWireVoiceProviderStatusCallback(raw: string): string {
  const origin = trustedProviderCallbackOrigin();
  if (!origin) {
    throw new Error('NEXT_PUBLIC_APP_URL must be a trusted bare production HTTPS origin before AI Voice number provisioning.');
  }
  const expected = `${origin}/api/voice/provider-status`;
  if (raw.trim() !== expected) {
    throw new Error(`AI Voice provider status callback must exactly match ${expected}.`);
  }
  return expected;
}

export type VoiceNumberProvisioningClaim = Readonly<{
  status: 'claimed' | 'succeeded' | 'terminal' | 'in_progress' | 'needs_reconciliation';
  operationId: string;
  claimToken: string | null;
  providerObjectId: string | null;
  providerResult: Record<string, unknown> | null;
}>;

export type VoiceNumberOperationType = 'purchase_number' | 'configure_voice' | 'release_number';

export interface VoiceNumberOperationStore {
  claim(input: Readonly<{
    accountId: string;
    operationType: VoiceNumberOperationType;
    idempotencyKey: string;
    fingerprint: string;
    payload: Record<string, unknown>;
    purchaseAuthorizationId?: string | null;
    retryAuthorizationId?: string | null;
    recoveryTokenHmac?: string | null;
  }>): Promise<VoiceNumberProvisioningClaim>;
  begin(operationId: string, claimToken: string): Promise<boolean>;
  complete(
    operationId: string,
    claimToken: string,
    providerObjectId: string,
    result: Record<string, unknown>,
  ): Promise<void>;
  reject(operationId: string, claimToken: string, errorCode: string, detail: string): Promise<void>;
  indeterminate(
    operationId: string,
    claimToken: string,
    errorCode: string,
    detail: string,
    providerObjectId?: string | null,
    providerResult?: Record<string, unknown> | null,
  ): Promise<void>;
}

export class SupabaseVoiceNumberOperationStore implements VoiceNumberOperationStore {
  constructor(private readonly admin: SupabaseClient = createAdminClient()) {}

  async claim(input: Parameters<VoiceNumberOperationStore['claim']>[0]): Promise<VoiceNumberProvisioningClaim> {
    const { data, error } = await this.admin.rpc('claim_voice_number_operation', {
      p_account_id: input.accountId,
      p_operation_type: input.operationType,
      p_idempotency_key: input.idempotencyKey,
      p_request_fingerprint: input.fingerprint,
      p_request_payload: input.payload,
      p_purchase_authorization_id: input.purchaseAuthorizationId ?? null,
      p_retry_authorization_id: input.retryAuthorizationId ?? null,
      p_recovery_token_hmac: input.recoveryTokenHmac ?? null,
    });
    if (error) throw rpcFailure('Unable to claim the AI Voice number operation', error);
    const row = oneRow(data, 'AI Voice number operation claim');
    const status = requiredString(row.claim_status, 'AI Voice number claim status') as VoiceNumberProvisioningClaim['status'];
    if (!['claimed', 'succeeded', 'terminal', 'in_progress', 'needs_reconciliation'].includes(status)) {
      throw new Error('AI Voice number claim status is invalid.');
    }
    const providerResult = row.provider_result;
    return Object.freeze({
      status,
      operationId: requiredUuid(row.operation_id, 'AI Voice number operation ID'),
      claimToken: optionalString(row.claim_token),
      providerObjectId: optionalString(row.provider_object_id),
      providerResult: providerResult && typeof providerResult === 'object' && !Array.isArray(providerResult)
        ? providerResult as Record<string, unknown>
        : null,
    });
  }

  async begin(operationId: string, claimToken: string): Promise<boolean> {
    const { data, error } = await this.admin.rpc('begin_voice_number_operation', {
      p_operation_id: operationId,
      p_claim_token: claimToken,
    });
    if (error) throw rpcFailure('Unable to begin the AI Voice number provider request', error);
    return data === true;
  }

  async complete(
    operationId: string,
    claimToken: string,
    providerObjectId: string,
    result: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await this.admin.rpc('complete_voice_number_operation', {
      p_operation_id: operationId,
      p_claim_token: claimToken,
      p_provider_object_id: providerObjectId,
      p_provider_result: result,
    });
    if (error) throw rpcFailure('Unable to complete the AI Voice number operation', error);
  }

  async reject(operationId: string, claimToken: string, errorCode: string, detail: string): Promise<void> {
    const { error } = await this.admin.rpc('reject_voice_number_operation', {
      p_operation_id: operationId,
      p_claim_token: claimToken,
      p_error_code: errorCode,
      p_error_detail: detail,
    });
    if (error) throw rpcFailure('Unable to record the SignalWire AI Voice rejection', error);
  }

  async indeterminate(
    operationId: string,
    claimToken: string,
    errorCode: string,
    detail: string,
    providerObjectId: string | null = null,
    providerResult: Record<string, unknown> | null = null,
  ): Promise<void> {
    const { error } = await this.admin.rpc('mark_voice_number_operation_indeterminate', {
      p_operation_id: operationId,
      p_claim_token: claimToken,
      p_error_code: errorCode,
      p_error_detail: detail,
      p_observed_provider_object_id: providerObjectId,
      p_observed_provider_result: providerResult,
    });
    if (error) throw rpcFailure('Unable to quarantine the uncertain SignalWire AI Voice operation', error);
  }
}

export type VoiceNumberOperationRuntime = Readonly<{
  enabled: boolean;
  store: VoiceNumberOperationStore;
  client: SignalWireNumberProvisioningClient;
}>;

function defaultRuntime(): VoiceNumberOperationRuntime {
  return Object.freeze({
    enabled: voiceNumberProvisioningMutationEnabled(),
    store: new SupabaseVoiceNumberOperationStore(),
    client: SignalWireNumberProvisioningClient.fromEnvironment(),
  });
}

function assertMutationGate(runtime?: VoiceNumberOperationRuntime): void {
  requireVoiceNumberProvisioningMutationEnabled();
  if (runtime && !runtime.enabled) throw new VoiceNumberProvisioningGateError();
}

function safeErrorCode(error: unknown): string {
  const raw = error instanceof SignalWireProvisioningError
    ? `signalwire_${error.code}`
    : 'provider_result_unknown';
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 100);
}

function safeErrorDetail(error: unknown): string {
  return (error instanceof SignalWireProvisioningError
    ? error.operatorMessage
    : error instanceof Error
      ? error.message
      : 'Unknown provider error').slice(0, 2000);
}

async function executeProviderMutation<T extends { id: string }>(input: Readonly<{
  accountId: string;
  operationType: VoiceNumberOperationType;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  purchaseAuthorizationId?: string | null;
  retryAuthorization?: Readonly<{
    id: string;
    generation: number;
    recoveryTokenHmac: string;
  }> | null;
  request: (client: SignalWireNumberProvisioningClient) => Promise<T>;
  result: (value: T) => Record<string, unknown>;
  validate: (value: T) => void;
  runtime?: VoiceNumberOperationRuntime;
  mutationGate?: 'acquisition' | 'recovery';
}>): Promise<{ replay: boolean; providerObjectId: string; result: Record<string, unknown> }> {
  if ((input.mutationGate ?? 'acquisition') === 'recovery') {
    requireVoiceNumberRecoveryEnabled();
  } else {
    assertMutationGate(input.runtime);
  }
  const runtime = input.runtime ?? defaultRuntime();
  const fingerprint = operationFingerprint(input.payload);
  if (!HEX_64.test(fingerprint)) throw new Error('AI Voice number operation fingerprint failed.');
  const claim = await runtime.store.claim({
    accountId: input.accountId,
    operationType: input.operationType,
    idempotencyKey: input.idempotencyKey,
    fingerprint,
    payload: input.payload,
    purchaseAuthorizationId: input.purchaseAuthorizationId,
    retryAuthorizationId: input.retryAuthorization?.id ?? null,
    recoveryTokenHmac: input.retryAuthorization?.recoveryTokenHmac ?? null,
  });
  if (claim.status === 'succeeded') {
    if (!claim.providerObjectId || !claim.providerResult) throw new Error('AI Voice number replay is incomplete.');
    return Object.freeze({ replay: true, providerObjectId: claim.providerObjectId, result: claim.providerResult });
  }
  if (claim.status !== 'claimed' || !claim.claimToken) {
    throw new Error(
      claim.status === 'needs_reconciliation'
        ? 'This SignalWire AI Voice operation has an uncertain outcome. Reconcile it before doing anything else.'
        : claim.status === 'terminal'
          ? 'This SignalWire AI Voice operation is terminal and needs operator review.'
          : 'This SignalWire AI Voice operation is already in progress.',
    );
  }

  const began = await runtime.store.begin(claim.operationId, claim.claimToken);
  if (!began) {
    throw new Error('The database cancelled this AI Voice provider request at the final safety boundary. No provider request was sent.');
  }
  let providerValue: T | null = null;
  let providerResult: Record<string, unknown> | null = null;
  try {
    providerValue = await input.request(runtime.client);
    // Capture the bounded, sanitized provider identity before validation. If
    // the provider returns the wrong number/capability/configuration, recovery
    // still needs that observed resource to prevent an orphaned paid object.
    providerResult = input.result(providerValue);
    input.validate(providerValue);
    await runtime.store.complete(claim.operationId, claim.claimToken, providerValue.id, providerResult);
    return Object.freeze({ replay: false, providerObjectId: providerValue.id, result: providerResult });
  } catch (error) {
    const code = safeErrorCode(error);
    const detail = safeErrorDetail(error);
    try {
      if (error instanceof SignalWireProvisioningError && error.outcomeKnownAbsent) {
        await runtime.store.reject(claim.operationId, claim.claimToken, code, detail);
      } else {
        await runtime.store.indeterminate(
          claim.operationId,
          claim.claimToken,
          code,
          detail,
          providerValue?.id ?? null,
          providerResult,
        );
      }
    } catch (recordError) {
      console.error({
        event: 'voice_number_operation_failure_persistence_failed',
        accountId: input.accountId,
        operationType: input.operationType,
        errorCode: safeErrorCode(recordError),
      });
    }
    throw error;
  }
}

export async function searchVoiceNumberCandidates(input: Readonly<{
  areaCode: string;
  region: string;
  maxResults?: number;
  client?: SignalWireNumberProvisioningClient;
}>): Promise<readonly SignalWireNumberCandidate[]> {
  const client = input.client ?? SignalWireNumberProvisioningClient.fromEnvironment();
  const candidates = await client.searchAvailableVoiceNumbers({
    areaCode: input.areaCode,
    region: input.region,
    maxResults: input.maxResults ?? 10,
  });
  return Object.freeze(candidates.filter((candidate) => candidate.capabilities.voice));
}

export async function purchaseVoiceNumber(input: Readonly<{
  accountId: string;
  number: string;
  authorizationId: string;
  purchasePolicy: StoredVoiceNumberPurchasePolicy;
  runtime?: VoiceNumberOperationRuntime;
}>) {
  assertMutationGate(input.runtime);
  const accountId = requiredUuid(input.accountId, 'AI Voice account ID');
  const number = canonicalVoiceNumber(input.number);
  const authorizationId = requiredUuid(input.authorizationId, 'AI Voice purchase authorization ID');
  const policy = input.purchasePolicy;
  purchasePolicyValue(policy.monthlyPriceCents, policy.monthlySpendCeilingCents);
  if (policy.provider !== 'signalwire' || !policy.purchaseEnabled || policy.revision < 1) {
    throw new Error('AI Voice purchase policy is not currently enabled and authoritative.');
  }
  const payload = {
    number,
    currency: 'USD',
    monthly_price_cents: policy.monthlyPriceCents,
    monthly_spend_ceiling_cents: policy.monthlySpendCeilingCents,
    spend_policy_revision: policy.revision,
  };
  return executeProviderMutation({
    accountId,
    operationType: 'purchase_number',
    idempotencyKey: `voice:${accountId}:purchase:${number}:${authorizationId}`,
    payload,
    purchaseAuthorizationId: authorizationId,
    request: async (client) => {
      // Re-check the carrier immediately after the atomic DB begin boundary
      // and before the purchase POST. A stale observation can authorize spend,
      // but it cannot prove the number remains available at mutation time.
      const candidates = await client.searchAvailableVoiceNumbers({
        areaCode: number.slice(2, 5),
        region: null,
        maxResults: 20,
      });
      const liveCandidate = candidates.find((candidate) => candidate.number === number);
      if (!liveCandidate || liveCandidate.capabilities.voice !== true) {
        throw new SignalWireProvisioningError(
          'SignalWire no longer lists the exact requested number as available and voice capable. No purchase request was sent.',
          {
            status: 409,
            code: 'candidate_not_available_before_purchase',
            requiredScopes: ['Numbers'],
            responseReceived: true,
            outcomeKnownAbsent: true,
          },
        );
      }
      return client.purchaseNumber(number);
    },
    validate: (phone) => {
      if (phone.number !== number || !phone.capabilities.includes('voice')) {
        throw new Error('SignalWire purchase response did not prove the exact requested voice-capable number.');
      }
    },
    result: purchasePhoneResult,
    runtime: input.runtime,
  });
}

function normalizeRetryAuthorization(input: Readonly<{
  id: string;
  generation: number;
  recoveryTokenHmac: string;
}>): Readonly<{ id: string; generation: number; recoveryTokenHmac: string }> {
  const id = requiredUuid(input.id, 'AI Voice retry authorization ID');
  if (!Number.isSafeInteger(input.generation) || input.generation < 1 || input.generation > 5) {
    throw new Error('AI Voice retry generation is invalid.');
  }
  const recoveryTokenHmac = input.recoveryTokenHmac.trim();
  if (!HEX_64.test(recoveryTokenHmac)) throw new Error('AI Voice retry recovery token digest is invalid.');
  return Object.freeze({ id, generation: input.generation, recoveryTokenHmac });
}

export async function configureVoiceNumberInbound(input: Readonly<{
  accountId: string;
  voiceNumberId: string;
  providerNumberId: string;
  number: string;
  friendlyName: string;
  inboundWebhookUrl?: string;
  statusCallbackUrl?: string;
  retryAuthorization?: Readonly<{
    id: string;
    generation: number;
    recoveryTokenHmac: string;
  }>;
  runtime?: VoiceNumberOperationRuntime;
}>) {
  if (input.retryAuthorization) requireVoiceNumberRecoveryEnabled();
  else assertMutationGate(input.runtime);
  const accountId = requiredUuid(input.accountId, 'AI Voice account ID');
  const voiceNumberId = requiredUuid(input.voiceNumberId, 'AI Voice inventory ID');
  const providerNumberId = requiredUuid(input.providerNumberId, 'SignalWire phone number ID');
  const number = canonicalVoiceNumber(input.number);
  const origin = trustedProviderCallbackOrigin();
  if (!origin) {
    throw new Error('NEXT_PUBLIC_APP_URL must be a trusted bare production HTTPS origin before AI Voice number provisioning.');
  }
  const inboundUrl = requireExactSignalWireVoiceInboundWebhook(
    input.inboundWebhookUrl ?? `${origin}/api/voice/ai`,
  );
  const statusUrl = requireExactSignalWireVoiceProviderStatusCallback(
    input.statusCallbackUrl ?? `${origin}/api/voice/provider-status`,
  );
  const friendlyName = input.friendlyName.trim().slice(0, 120);
  if (!friendlyName) throw new Error('AI Voice number friendly name is required.');
  const payload = {
    provider: 'signalwire',
    voice_number_id: voiceNumberId,
    provider_number_id: providerNumberId,
    number,
    friendly_name: friendlyName,
    call_handler: 'laml_webhooks',
    call_request_url: inboundUrl,
    call_request_method: 'POST',
    call_status_callback_url: statusUrl,
    call_status_callback_method: 'POST',
  };
  const configurationKey = operationFingerprint(payload).slice(0, 16);
  const retryAuthorization = input.retryAuthorization
    ? normalizeRetryAuthorization(input.retryAuthorization)
    : null;
  return executeProviderMutation({
    accountId,
    operationType: 'configure_voice',
    idempotencyKey: `voice:${accountId}:configure:${voiceNumberId}:${configurationKey}${retryAuthorization ? `:retry:${retryAuthorization.generation}` : ''}`,
    payload,
    retryAuthorization,
    request: (client) => client.updateVoicePhoneNumber({
      providerNumberId,
      number,
      friendlyName,
      inboundWebhookUrl: inboundUrl,
      statusCallbackUrl: statusUrl,
    }),
    validate: (phone) => requireExactConfiguredVoicePhone(phone, {
      providerNumberId, number, inboundUrl, statusUrl,
    }),
    result: configuredPhoneResult,
    runtime: input.runtime,
    mutationGate: retryAuthorization ? 'recovery' : 'acquisition',
  });
}

export async function releaseVoiceNumber(input: Readonly<{
  accountId: string;
  voiceNumberId: string;
  providerNumberId: string;
  number: string;
  retryAuthorization?: Readonly<{
    id: string;
    generation: number;
    recoveryTokenHmac: string;
  }>;
  runtime?: VoiceNumberOperationRuntime;
}>) {
  const accountId = requiredUuid(input.accountId, 'AI Voice account ID');
  const voiceNumberId = requiredUuid(input.voiceNumberId, 'AI Voice inventory ID');
  const providerNumberId = requiredUuid(input.providerNumberId, 'SignalWire phone number ID');
  const number = canonicalVoiceNumber(input.number);
  const retryAuthorization = input.retryAuthorization
    ? normalizeRetryAuthorization(input.retryAuthorization)
    : null;
  const payload = {
    provider: 'signalwire',
    voice_number_id: voiceNumberId,
    provider_number_id: providerNumberId,
    number,
  };
  return executeProviderMutation({
    accountId,
    operationType: 'release_number',
    idempotencyKey: `voice:${accountId}:release:${voiceNumberId}:${providerNumberId}${retryAuthorization ? `:retry:${retryAuthorization.generation}` : ''}`,
    payload,
    retryAuthorization,
    request: async (client) => {
      // Re-read the carrier object immediately before the destructive DELETE.
      // SQL separately rejects any cross-rail SMS reference. Both identities
      // must still match here or the operation is quarantined without release.
      const live = await client.getPhoneNumber(providerNumberId);
      if (live.id !== providerNumberId || live.number !== number) {
        throw new Error('Live SignalWire release identity does not match the exact AI Voice inventory row.');
      }
      return client.releasePhoneNumber({ providerNumberId, number });
    },
    validate: (released) => {
      if (
        released.id !== providerNumberId
        || released.number !== number
        || released.released !== true
      ) throw new Error('SignalWire release response did not preserve the exact AI Voice number identity.');
    },
    result: (released) => ({
      provider: 'signalwire',
      id: released.id,
      number: released.number,
      released: released.released,
    }),
    runtime: input.runtime,
    mutationGate: 'recovery',
  });
}

type ExactVoicePhoneExpectation = Readonly<{
  providerNumberId: string;
  number: string;
  inboundUrl: string;
  statusUrl: string;
}>;

function requireExactConfiguredVoicePhone(
  phone: SignalWirePhoneNumber,
  expected: ExactVoicePhoneExpectation,
): void {
  if (
    phone.id !== expected.providerNumberId
    || phone.number !== expected.number
    || !phone.capabilities.includes('voice')
    || phone.callHandler?.toLowerCase() !== 'laml_webhooks'
    || phone.callRequestUrl !== expected.inboundUrl
    || phone.callRequestMethod?.toUpperCase() !== 'POST'
    || phone.callStatusCallbackUrl !== expected.statusUrl
    || phone.callStatusCallbackMethod?.toUpperCase() !== 'POST'
  ) {
    throw new Error('SignalWire does not show the exact voice-capable AI Voice and provider-status POST configuration.');
  }
}

function purchasePhoneResult(phone: SignalWirePhoneNumber): Record<string, unknown> {
  return {
    provider: 'signalwire',
    id: phone.id,
    number: phone.number,
    voice_capable: phone.capabilities.includes('voice'),
  };
}

function configuredPhoneResult(phone: SignalWirePhoneNumber): Record<string, unknown> {
  return {
    provider: 'signalwire',
    id: phone.id,
    number: phone.number,
    voice_capable: phone.capabilities.includes('voice'),
    call_handler: phone.callHandler,
    call_request_url: phone.callRequestUrl,
    call_request_method: phone.callRequestMethod,
    call_status_callback_url: phone.callStatusCallbackUrl,
    call_status_callback_method: phone.callStatusCallbackMethod,
  };
}

export type VoiceNumberProvisioningInspection = Readonly<{
  ready: true;
  providerNumberId: string;
  number: string;
  inboundUrl: string;
  statusUrl: string;
}>;

export async function reconcileVoiceNumberProvisioning(input: Readonly<{
  providerNumberId: string;
  number: string;
  inboundWebhookUrl?: string;
  statusCallbackUrl?: string;
  client?: SignalWireNumberProvisioningClient;
}>): Promise<VoiceNumberProvisioningInspection> {
  const providerNumberId = requiredUuid(input.providerNumberId, 'SignalWire phone number ID');
  const number = canonicalVoiceNumber(input.number);
  const origin = trustedProviderCallbackOrigin();
  if (!origin) {
    throw new Error('NEXT_PUBLIC_APP_URL must be a trusted bare production HTTPS origin before AI Voice number reconciliation.');
  }
  const inboundUrl = requireExactSignalWireVoiceInboundWebhook(
    input.inboundWebhookUrl ?? `${origin}/api/voice/ai`,
  );
  const statusUrl = requireExactSignalWireVoiceProviderStatusCallback(
    input.statusCallbackUrl ?? `${origin}/api/voice/provider-status`,
  );
  const client = input.client ?? SignalWireNumberProvisioningClient.fromEnvironment();
  const phone = await client.getPhoneNumber(providerNumberId);
  requireExactConfiguredVoicePhone(phone, { providerNumberId, number, inboundUrl, statusUrl });
  return Object.freeze({ ready: true as const, providerNumberId, number, inboundUrl, statusUrl });
}

export type VoiceNumberOperationDetail = Readonly<{
  id: string;
  accountId: string;
  type: VoiceNumberOperationType;
  state: string;
  requestPayload: Record<string, unknown>;
  providerObjectId: string | null;
  providerResult: Record<string, unknown> | null;
  observedProviderObjectId: string | null;
  observedProviderResult: Record<string, unknown> | null;
}>;

async function loadVoiceNumberOperationDetail(
  admin: SupabaseClient,
  accountId: string,
  operationId: string,
): Promise<VoiceNumberOperationDetail> {
  const { data, error } = await admin
    .from('voice_number_provisioning_operations')
    .select('id, account_id, operation_type, state, request_payload, provider_object_id, provider_result, observed_provider_object_id, observed_provider_result')
    .eq('account_id', accountId)
    .eq('id', operationId)
    .maybeSingle();
  if (error) throw rpcFailure('Unable to load the AI Voice number operation', error);
  if (!data) throw new Error('AI Voice number operation was not found.');
  const row = data as unknown as Record<string, unknown>;
  const type = requiredString(row.operation_type, 'AI Voice operation type') as VoiceNumberOperationType;
  if (!['purchase_number', 'configure_voice', 'release_number'].includes(type)) {
    throw new Error('AI Voice number operation type is invalid.');
  }
  const requestPayload = row.request_payload;
  const providerResult = row.provider_result;
  const observedProviderResult = row.observed_provider_result;
  if (!requestPayload || typeof requestPayload !== 'object' || Array.isArray(requestPayload)) {
    throw new Error('AI Voice number operation request is invalid.');
  }
  return Object.freeze({
    id: requiredUuid(row.id, 'AI Voice operation ID'),
    accountId: requiredUuid(row.account_id, 'AI Voice operation account ID'),
    type,
    state: requiredString(row.state, 'AI Voice operation state'),
    requestPayload: requestPayload as Record<string, unknown>,
    providerObjectId: optionalString(row.provider_object_id),
    providerResult: providerResult && typeof providerResult === 'object' && !Array.isArray(providerResult)
      ? providerResult as Record<string, unknown>
      : null,
    observedProviderObjectId: optionalString(row.observed_provider_object_id),
    observedProviderResult: observedProviderResult && typeof observedProviderResult === 'object' && !Array.isArray(observedProviderResult)
      ? observedProviderResult as Record<string, unknown>
      : null,
  });
}

function requireCapturedProviderEvidence(
  operation: VoiceNumberOperationDetail,
): Readonly<{ providerObjectId: string; number: string; providerResult: Record<string, unknown> }> | null {
  if (!operation.observedProviderObjectId && !operation.observedProviderResult) return null;
  if (!operation.observedProviderObjectId || !operation.observedProviderResult) {
    throw new Error('Captured SignalWire evidence is incomplete. Recovery remains blocked.');
  }
  const providerObjectId = requiredUuid(
    operation.observedProviderObjectId,
    'Captured SignalWire provider resource',
  );
  const providerResult = operation.observedProviderResult;
  const number = canonicalVoiceNumber(requiredString(providerResult.number, 'Captured SignalWire number'));
  if (
    providerResult.provider !== 'signalwire'
    || providerResult.id !== providerObjectId
  ) {
    throw new Error('Captured SignalWire evidence has a conflicting provider identity. Recovery remains blocked.');
  }
  return Object.freeze({ providerObjectId, number, providerResult });
}

type ExpectedIdentityDisposition = 'retained' | 'released' | 'confirmed_absent';
type ObservedIdentityDisposition = 'not_observed' | 'same_as_expected' | 'released' | 'confirmed_absent';
type CleanupIdentityDisposition = 'released' | 'confirmed_absent';
type CleanupIdentityKind = 'expected' | 'observed' | 'discovered';

type ActiveCleanupReservation = Readonly<{
  status: 'reserved' | 'reclaimed';
  id: string;
  leaseToken: string;
  leaseExpiresAt: string;
  leaseExpiresAtMs: number;
}>;

type BusyCleanupReservation = Readonly<{
  status: 'busy';
  id: string;
  leaseExpiresAt: string;
  leaseExpiresAtMs: number;
}>;

type FinalizedCleanupReservation = Readonly<{
  status: 'finalized';
  id: string;
  finalDisposition: CleanupIdentityDisposition;
  finalizedAt: string;
}>;

type CleanupReservation = ActiveCleanupReservation | BusyCleanupReservation | FinalizedCleanupReservation;

type PendingDiscoveredCleanupIdentity = Readonly<{
  reservationId: string;
  identityKind: 'discovered';
  providerNumberId: string;
  number: string;
  reservationKey: string;
}>;

type PurchaseCleanupAnchor = Readonly<{
  reservationId: string;
  identityKind: 'expected';
  providerNumberId: string;
  number: string;
  reservationKey: string;
  reservationState: 'reserved' | CleanupIdentityDisposition;
}>;

class CleanupIdentityMovedError extends Error {
  constructor(
    readonly phone: SignalWirePhoneNumber,
    readonly finalizedDisposition: CleanupIdentityDisposition | null = null,
  ) {
    super(`SignalWire owns the reserved E.164 under a different provider resource ${phone.id}.`);
    this.name = 'CleanupIdentityMovedError';
  }
}

class CleanupAlternateIdentityQuarantinedError extends Error {
  constructor(readonly phone: SignalWirePhoneNumber) {
    super(`SignalWire still owns the E.164 under alternate provider resource ${phone.id}.`);
    this.name = 'CleanupAlternateIdentityQuarantinedError';
  }
}

function cleanupReservationKey(input: Readonly<{
  operationId: string;
  identityKind: CleanupIdentityKind;
  providerNumberId: string;
  number: string;
}>): string {
  const numberDigest = createHash('sha256').update(input.number, 'utf8').digest('hex').slice(0, 20);
  return `voice-cleanup:v1:${input.operationId}:${input.identityKind}:${input.providerNumberId}:${numberDigest}`;
}

const CLEANUP_PROVIDER_PROOF_BUDGET_MS = 15_000;
const CLEANUP_FINALIZATION_BUFFER_MS = 15_000;
const CLEANUP_MUTATION_LEASE_FLOOR_MS = (
  CLEANUP_PROVIDER_PROOF_BUDGET_MS + CLEANUP_FINALIZATION_BUFFER_MS
);

function requireActiveCleanupLease(
  reservation: ActiveCleanupReservation,
  minimumRemainingMs = 0,
): void {
  if (reservation.leaseExpiresAtMs - Date.now() <= minimumRemainingMs) {
    throw new Error('The AI Voice cleanup lease expired before provider cleanup completed. Re-run reconciliation to reclaim it safely.');
  }
}

async function reserveVoiceNumberIdentityCleanup(input: Readonly<{
  admin: SupabaseClient;
  operation: VoiceNumberOperationDetail;
  identityKind: CleanupIdentityKind;
  providerNumberId: string;
  number: string;
  actorReference: string;
  reservationKey?: string;
}>): Promise<CleanupReservation> {
  const reason = `AI Voice ${input.identityKind} identity cleanup for reconciliation ${input.operation.id}`;
  const reservationKey = input.reservationKey ?? cleanupReservationKey({
    operationId: input.operation.id,
    identityKind: input.identityKind,
    providerNumberId: input.providerNumberId,
    number: input.number,
  });
  const { data, error } = await input.admin.rpc('reserve_voice_number_identity_cleanup', {
    p_operation_id: input.operation.id,
    p_identity_kind: input.identityKind,
    p_provider_number_id: input.providerNumberId,
    p_e164_number: input.number,
    p_reservation_key: reservationKey,
    p_actor_reference: input.actorReference,
    p_reason: reason,
  });
  if (error) throw rpcFailure('Unable to reserve the exact SignalWire cleanup identity', error);
  const row = oneRow(data, 'AI Voice cleanup reservation');
  const id = requiredUuid(row.reservation_id, 'AI Voice cleanup reservation ID');
  const status = requiredString(row.reserve_status, 'AI Voice cleanup reservation status');
  if (status === 'finalized') {
    const finalDisposition = requiredString(
      row.final_disposition,
      'AI Voice finalized cleanup disposition',
    ) as CleanupIdentityDisposition;
    if (!['released', 'confirmed_absent'].includes(finalDisposition)) {
      throw new Error('AI Voice finalized cleanup disposition is invalid.');
    }
    const finalizedAt = requiredString(row.finalized_at, 'AI Voice cleanup finalization time');
    if (!Number.isFinite(Date.parse(finalizedAt))) {
      throw new Error('AI Voice cleanup finalization time is invalid.');
    }
    return Object.freeze({ status, id, finalDisposition, finalizedAt });
  }
  if (status === 'busy') {
    const leaseExpiresAt = requiredString(row.lease_expires_at, 'AI Voice busy cleanup lease expiry');
    const leaseExpiresAtMs = Date.parse(leaseExpiresAt);
    if (!Number.isFinite(leaseExpiresAtMs) || leaseExpiresAtMs <= Date.now()) {
      throw new Error('AI Voice cleanup reservation returned an invalid busy lease. Re-run reconciliation.');
    }
    if (row.lease_token != null) {
      throw new Error('AI Voice busy cleanup reservation exposed another worker\'s lease token.');
    }
    return Object.freeze({ status, id, leaseExpiresAt, leaseExpiresAtMs });
  }
  if (!['reserved', 'reclaimed'].includes(status)) {
    throw new Error('AI Voice cleanup reservation status is invalid.');
  }
  const leaseToken = requiredUuid(row.lease_token, 'AI Voice cleanup lease token');
  const leaseExpiresAt = requiredString(row.lease_expires_at, 'AI Voice cleanup lease expiry');
  const leaseExpiresAtMs = Date.parse(leaseExpiresAt);
  if (!Number.isFinite(leaseExpiresAtMs) || leaseExpiresAtMs <= Date.now()) {
    throw new Error('AI Voice cleanup reservation returned an expired lease. Re-run reconciliation.');
  }
  return Object.freeze({
    status: status as ActiveCleanupReservation['status'],
    id,
    leaseToken,
    leaseExpiresAt,
    leaseExpiresAtMs,
  });
}

async function enumeratePendingDiscoveredCleanupIdentities(input: Readonly<{
  admin: SupabaseClient;
  operation: VoiceNumberOperationDetail;
  anchorReservationId: string;
  number: string;
}>): Promise<readonly PendingDiscoveredCleanupIdentity[]> {
  const { data, error } = await input.admin.rpc('enumerate_pending_voice_number_identity_cleanups', {
    p_operation_id: input.operation.id,
    p_anchor_reservation_id: input.anchorReservationId,
    p_limit: 10,
  });
  if (error) throw rpcFailure('Unable to enumerate pending SignalWire cleanup identities', error);
  if (!Array.isArray(data) || data.length > 10) {
    throw new Error('Pending SignalWire cleanup enumeration returned an invalid bounded result.');
  }
  const reservationIds = new Set<string>();
  const providerNumberIds = new Set<string>();
  return Object.freeze(data.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Pending SignalWire cleanup enumeration returned an invalid row.');
    }
    const row = value as Record<string, unknown>;
    const reservationId = requiredUuid(row.reservation_id, 'Pending cleanup reservation ID');
    const identityKind = requiredString(row.identity_kind, 'Pending cleanup identity kind');
    const providerNumberId = requiredUuid(row.provider_number_id, 'Pending cleanup provider resource');
    const number = canonicalVoiceNumber(requiredString(row.e164_number, 'Pending cleanup E.164'));
    const reservationKey = requiredString(row.reservation_key, 'Pending cleanup reservation key');
    if (identityKind !== 'discovered' || number !== input.number) {
      throw new Error('Pending SignalWire cleanup enumeration escaped the exact operation identity.');
    }
    if (reservationKey.length < 16 || reservationKey.length > 250
        || !/^[A-Za-z0-9][A-Za-z0-9:._/+\-]{15,249}$/.test(reservationKey)) {
      throw new Error('Pending SignalWire cleanup reservation key is invalid.');
    }
    if (reservationIds.has(reservationId) || providerNumberIds.has(providerNumberId)) {
      throw new Error('Pending SignalWire cleanup enumeration returned a duplicate identity.');
    }
    reservationIds.add(reservationId);
    providerNumberIds.add(providerNumberId);
    return Object.freeze({
      reservationId,
      identityKind: 'discovered' as const,
      providerNumberId,
      number,
      reservationKey,
    });
  }));
}

async function enumeratePurchaseCleanupAnchors(input: Readonly<{
  admin: SupabaseClient;
  operation: VoiceNumberOperationDetail;
  number: string;
}>): Promise<readonly PurchaseCleanupAnchor[]> {
  const { data, error } = await input.admin.rpc('enumerate_purchase_voice_number_cleanup_anchors', {
    p_operation_id: input.operation.id,
    p_limit: 10,
  });
  if (error) throw rpcFailure('Unable to enumerate exact-request purchase cleanup anchors', error);
  if (!Array.isArray(data) || data.length > 10) {
    throw new Error('Purchase cleanup anchor enumeration returned an invalid bounded result.');
  }
  const reservationIds = new Set<string>();
  const providerNumberIds = new Set<string>();
  return Object.freeze(data.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Purchase cleanup anchor enumeration returned an invalid row.');
    }
    const row = value as Record<string, unknown>;
    const reservationId = requiredUuid(row.reservation_id, 'Purchase cleanup reservation ID');
    const identityKind = requiredString(row.identity_kind, 'Purchase cleanup identity kind');
    const providerNumberId = requiredUuid(row.provider_number_id, 'Purchase cleanup provider resource');
    const number = canonicalVoiceNumber(requiredString(row.e164_number, 'Purchase cleanup E.164'));
    const reservationKey = requiredString(row.reservation_key, 'Purchase cleanup reservation key');
    const reservationState = requiredString(row.reservation_state, 'Purchase cleanup reservation state');
    if (identityKind !== 'expected' || number !== input.number
        || !['reserved', 'released', 'confirmed_absent'].includes(reservationState)) {
      throw new Error('Purchase cleanup anchor enumeration escaped the exact purchase identity.');
    }
    if (reservationKey.length < 16 || reservationKey.length > 250
        || !/^[A-Za-z0-9][A-Za-z0-9:._/+\-]{15,249}$/.test(reservationKey)) {
      throw new Error('Purchase cleanup anchor reservation key is invalid.');
    }
    if (reservationIds.has(reservationId) || providerNumberIds.has(providerNumberId)) {
      throw new Error('Purchase cleanup anchor enumeration returned a duplicate identity.');
    }
    reservationIds.add(reservationId);
    providerNumberIds.add(providerNumberId);
    return Object.freeze({
      reservationId,
      identityKind: 'expected' as const,
      providerNumberId,
      number,
      reservationKey,
      reservationState: reservationState as PurchaseCleanupAnchor['reservationState'],
    });
  }));
}

async function cleanupReservedVoiceNumberIdentity(input: Readonly<{
  admin: SupabaseClient;
  client: SignalWireNumberProvisioningClient;
  operation: VoiceNumberOperationDetail;
  identityKind: CleanupIdentityKind;
  providerNumberId: string;
  number: string;
  actorReference: string;
  reservationKey?: string;
  reservation?: CleanupReservation;
  terminalizeWhenMovedTo?: ReadonlySet<string>;
}>): Promise<CleanupIdentityDisposition> {
  const reservation = input.reservation ?? await reserveVoiceNumberIdentityCleanup(input);
  if (reservation.status === 'finalized') return reservation.finalDisposition;
  if (reservation.status === 'busy') {
    throw new Error(
      `The exact AI Voice cleanup identity is leased by another reconciliation worker until ${reservation.leaseExpiresAt}.`,
    );
  }

  requireActiveCleanupLease(reservation, CLEANUP_MUTATION_LEASE_FLOOR_MS);
  const providerProofDeadlineMs = Date.now() + CLEANUP_PROVIDER_PROOF_BUDGET_MS;
  const providerProofSignal = AbortSignal.timeout(CLEANUP_PROVIDER_PROOF_BUDGET_MS);

  let disposition: CleanupIdentityDisposition;
  let quarantinedAlternate: SignalWirePhoneNumber | null = null;
  let finalizedMovedIdentity: SignalWirePhoneNumber | null = null;
  try {
    const phone = await input.client.getPhoneNumber(input.providerNumberId, {
      signal: providerProofSignal,
    });
    if (phone.id !== input.providerNumberId || phone.number !== input.number) {
      throw new Error('Live SignalWire cleanup identity conflicts with the exact durable reservation.');
    }
    requireActiveCleanupLease(
      reservation,
      Math.max(0, providerProofDeadlineMs - Date.now()) + CLEANUP_FINALIZATION_BUFFER_MS,
    );
    const released = await input.client.releasePhoneNumber({
      providerNumberId: input.providerNumberId,
      number: input.number,
      signal: providerProofSignal,
      reconcileNotFound: false,
    });
    if (released.id !== input.providerNumberId
        || released.number !== input.number
        || released.released !== true) {
      throw new Error('SignalWire did not confirm cleanup of the exact reserved provider resource.');
    }
    const surviving = await input.client.findOwnedPhoneNumber(input.number, {
      signal: providerProofSignal,
    });
    if (surviving) {
      if (surviving.id === input.providerNumberId) {
        throw new Error('SignalWire still lists the exact reserved provider resource after release.');
      }
      if (input.operation.type !== 'purchase_number' && input.identityKind === 'expected') {
        quarantinedAlternate = surviving;
      } else if (input.identityKind === 'discovered'
          || input.terminalizeWhenMovedTo?.has(surviving.id)) {
        finalizedMovedIdentity = surviving;
      } else {
        throw new CleanupIdentityMovedError(surviving);
      }
    }
    disposition = 'released';
  } catch (error) {
    if (error instanceof SignalWireProvisioningError
        && error.status === 404
        && error.outcomeKnownAbsent) {
      const surviving = await input.client.findOwnedPhoneNumber(input.number, {
        signal: providerProofSignal,
      });
      if (surviving) {
        if (surviving.id === input.providerNumberId) {
          throw new Error('SignalWire returned 404 for the reserved identity but still lists that exact resource.');
        }
        if (input.operation.type !== 'purchase_number' && input.identityKind === 'expected') {
          // A release can prove the exact requested provider ID absent, but an
          // alternate ID at the same E.164 is not authorized for deletion.
          // Finalize the exact anchor before surfacing manual quarantine so the
          // global purchase barrier is not stranded by an immortal reservation.
          quarantinedAlternate = surviving;
        } else if (input.identityKind === 'discovered'
            || input.terminalizeWhenMovedTo?.has(surviving.id)) {
          finalizedMovedIdentity = surviving;
        } else {
          throw new CleanupIdentityMovedError(surviving);
        }
      }
      disposition = 'confirmed_absent';
    } else if (input.operation.type === 'release_number' && input.identityKind === 'expected') {
      // DELETE can race to 404 after the initial GET. The provider adapter
      // deliberately reports that as malformed when the E.164 has already
      // moved to a different ID, so re-probe only the exact reserved ID here.
      // A fresh exact-ID 404 is sufficient to terminalize this anchor; an
      // alternate E.164 owner remains quarantined and is never deleted.
      let exactIdentityAbsent = false;
      try {
        const exact = await input.client.getPhoneNumber(input.providerNumberId, {
          signal: providerProofSignal,
        });
        if (exact.id !== input.providerNumberId || exact.number !== input.number) {
          throw new Error('SignalWire release recheck returned a conflicting exact provider identity.');
        }
      } catch (probeError) {
        if (probeError instanceof SignalWireProvisioningError
            && probeError.status === 404
            && probeError.outcomeKnownAbsent) {
          exactIdentityAbsent = true;
        } else {
          throw error;
        }
      }
      if (!exactIdentityAbsent) throw error;
      const surviving = await input.client.findOwnedPhoneNumber(input.number, {
        signal: providerProofSignal,
      });
      if (surviving) {
        if (surviving.id === input.providerNumberId) {
          throw new Error('SignalWire release recheck lists the exact resource after proving its ID absent.');
        }
        quarantinedAlternate = surviving;
      }
      disposition = 'confirmed_absent';
    } else {
      throw error;
    }
  }

  const evidence = {
    provider: 'signalwire',
    provider_number_id: input.providerNumberId,
    number: input.number,
    disposition,
    cleanup_confirmed: true,
  };
  const { data, error } = await input.admin.rpc('finalize_voice_number_identity_cleanup', {
    p_reservation_id: reservation.id,
    p_lease_token: reservation.leaseToken,
    p_disposition: disposition,
    p_finalization_evidence: evidence,
    p_actor_reference: input.actorReference,
  });
  if (error) throw rpcFailure('Unable to finalize the exact SignalWire cleanup identity', error);
  if (data !== true) throw new Error('AI Voice cleanup finalization was not acknowledged.');
  if (quarantinedAlternate) throw new CleanupAlternateIdentityQuarantinedError(quarantinedAlternate);
  if (finalizedMovedIdentity) {
    throw new CleanupIdentityMovedError(finalizedMovedIdentity, disposition);
  }
  return disposition;
}

async function cleanupReservedVoiceNumberIdentityChain(input: Readonly<{
  admin: SupabaseClient;
  client: SignalWireNumberProvisioningClient;
  operation: VoiceNumberOperationDetail;
  identityKind: Exclude<CleanupIdentityKind, 'discovered'>;
  providerNumberId: string;
  number: string;
  actorReference: string;
  reservationKey?: string;
  promoteFirstDiscoveryToObserved?: boolean;
}>): Promise<Readonly<{
  anchorDisposition: CleanupIdentityDisposition;
  operation: VoiceNumberOperationDetail;
  promotedObservedDisposition: CleanupIdentityDisposition | null;
}>> {
  const anchorReservation = await reserveVoiceNumberIdentityCleanup({
    admin: input.admin,
    operation: input.operation,
    identityKind: input.identityKind,
    providerNumberId: input.providerNumberId,
    number: input.number,
    actorReference: input.actorReference,
    reservationKey: input.reservationKey,
  });
  const resumableDiscovered = anchorReservation.status === 'finalized'
    ? []
    : await enumeratePendingDiscoveredCleanupIdentities({
      admin: input.admin,
      operation: input.operation,
      anchorReservationId: anchorReservation.id,
      number: input.number,
    });
  const pending: Array<{
    identityKind: CleanupIdentityKind;
    providerNumberId: string;
    reservationKey?: string;
    reservation?: CleanupReservation;
  }> = [
    {
      identityKind: input.identityKind,
      providerNumberId: input.providerNumberId,
      reservationKey: input.reservationKey,
      reservation: anchorReservation,
    },
    ...resumableDiscovered.map((identity) => ({
      identityKind: identity.identityKind,
      providerNumberId: identity.providerNumberId,
      reservationKey: identity.reservationKey,
    })),
  ];
  const seen = new Set<string>();
  for (const identity of pending) {
    if (seen.has(identity.providerNumberId)) {
      throw new Error('Pending SignalWire cleanup enumeration repeated the anchor or another provider identity.');
    }
    seen.add(identity.providerNumberId);
  }
  let operation = input.operation;
  let initialDisposition: CleanupIdentityDisposition | null = null;
  let promotedObservedProviderNumberId: string | null = null;
  let promotedObservedDisposition: CleanupIdentityDisposition | null = null;

  while (pending.length > 0) {
    const current = pending[pending.length - 1]!;
    try {
      // Retain each hop's exclusive bearer lease on the stack. If provider B
      // resolves to C, cleanup C must not force this worker to reserve B again
      // and collide with its own still-live lease while unwinding the chain.
      current.reservation ??= await reserveVoiceNumberIdentityCleanup({
        admin: input.admin,
        operation,
        identityKind: current.identityKind,
        providerNumberId: current.providerNumberId,
        number: input.number,
        actorReference: input.actorReference,
        reservationKey: current.reservationKey,
      });
      const disposition = await cleanupReservedVoiceNumberIdentity({
        admin: input.admin,
        client: input.client,
        operation,
        identityKind: current.identityKind,
        providerNumberId: current.providerNumberId,
        number: input.number,
        actorReference: input.actorReference,
        reservationKey: current.reservationKey,
        reservation: current.reservation,
        terminalizeWhenMovedTo: seen,
      });
      if (pending.length === 1) initialDisposition = disposition;
      if (current.providerNumberId === promotedObservedProviderNumberId) {
        promotedObservedDisposition = disposition;
      }
      pending.pop();
    } catch (error) {
      if (error instanceof CleanupAlternateIdentityQuarantinedError) {
        throw new Error(
          'SignalWire proved the exact release resource absent but returned an alternate provider identity '
          + 'for the same E.164. The alternate is quarantined for manual review and will not be deleted.',
        );
      }
      if (!(error instanceof CleanupIdentityMovedError)) throw error;
      if (error.finalizedDisposition) {
        if (pending.length === 1) initialDisposition = error.finalizedDisposition;
        if (current.providerNumberId === promotedObservedProviderNumberId) {
          promotedObservedDisposition = error.finalizedDisposition;
        }
        pending.pop();
      }
      if (operation.type !== 'purchase_number') {
        throw new Error(
          'SignalWire returned a different provider identity for a configure/release operation. '
          + 'That identity is quarantined for manual review and will not be deleted.',
        );
      }
      const discoveredId = requiredUuid(error.phone.id, 'Discovered SignalWire cleanup resource');
      const discoveredNumber = canonicalVoiceNumber(error.phone.number);
      if (discoveredNumber !== input.number) {
        throw new Error('SignalWire lookup returned an alternate cleanup resource for a different E.164.');
      }
      if (seen.has(discoveredId)) {
        if (pending.some((identity) => identity.providerNumberId === discoveredId)) {
          continue;
        }
        throw new Error(
          'SignalWire returned a provider identity that reappeared after its exact cleanup was already terminal. '
          + 'All active cleanup leases were cleared; the operation remains quarantined for manual review.',
        );
      }
      if (seen.size >= 11) {
        throw new Error('SignalWire cleanup discovery exceeded the bounded ten-identity safety limit.');
      }
      seen.add(discoveredId);
      let identityKind: CleanupIdentityKind = 'discovered';
      if (input.promoteFirstDiscoveryToObserved && !requireCapturedProviderEvidence(operation)) {
        operation = await recordReconciliationObservation({
          admin: input.admin,
          operation,
          phone: error.phone,
          actorReference: input.actorReference,
        });
        promotedObservedProviderNumberId = discoveredId;
        identityKind = 'observed';
      }
      pending.push({ identityKind, providerNumberId: discoveredId });
    }
  }

  if (!initialDisposition) throw new Error('AI Voice cleanup chain ended without terminal evidence for its anchor.');
  return Object.freeze({
    anchorDisposition: initialDisposition,
    operation,
    promotedObservedDisposition,
  });
}

async function recordReconciliationObservation(input: Readonly<{
  admin: SupabaseClient;
  operation: VoiceNumberOperationDetail;
  phone: SignalWirePhoneNumber;
  actorReference: string;
}>): Promise<VoiceNumberOperationDetail> {
  const providerNumberId = requiredUuid(input.phone.id, 'Discovered SignalWire provider resource');
  const number = canonicalVoiceNumber(input.phone.number);
  const current = requireCapturedProviderEvidence(input.operation);
  if (current) {
    if (current.providerObjectId !== providerNumberId || current.number !== number) {
      throw new Error('A different SignalWire identity is already durably captured for this reconciliation.');
    }
    return input.operation;
  }
  const providerResult = purchasePhoneResult(input.phone);
  const { data, error } = await input.admin.rpc('record_voice_number_reconciliation_observation', {
    p_operation_id: input.operation.id,
    p_observed_provider_object_id: providerNumberId,
    p_observed_provider_result: providerResult,
    p_actor_reference: input.actorReference,
  });
  if (error) throw rpcFailure('Unable to durably record the discovered SignalWire identity', error);
  if (data !== true) throw new Error('SignalWire reconciliation observation was not acknowledged.');
  return Object.freeze({
    ...input.operation,
    observedProviderObjectId: providerNumberId,
    observedProviderResult: providerResult,
  });
}

async function reconcileCapturedProviderIdentity(input: Readonly<{
  admin: SupabaseClient;
  client: SignalWireNumberProvisioningClient;
  operation: VoiceNumberOperationDetail;
  captured: ReturnType<typeof requireCapturedProviderEvidence>;
  sameAsExpected: boolean;
  actorReference: string;
}>): Promise<ObservedIdentityDisposition> {
  if (!input.captured) return 'not_observed';
  if (input.sameAsExpected) return 'same_as_expected';
  if (input.operation.type !== 'purchase_number') {
    throw new Error(
      'A mismatched configure/release response does not authorize deleting that provider identity. '
      + 'The operation remains quarantined for manual review.',
    );
  }
  const cleanup = await cleanupReservedVoiceNumberIdentityChain({
    admin: input.admin,
    client: input.client,
    operation: input.operation,
    identityKind: 'observed',
    providerNumberId: input.captured.providerObjectId,
    number: input.captured.number,
    actorReference: input.actorReference,
  });
  return cleanup.anchorDisposition;
}

function voiceNumberReconciliationEvidence(input: Readonly<{
  operation: VoiceNumberOperationDetail;
  expectedNumber: string;
  expectedProviderObjectId: string | null;
  expectedDisposition: ExpectedIdentityDisposition;
  observedDisposition: ObservedIdentityDisposition;
}>): Record<string, unknown> {
  return {
    provider: 'signalwire',
    operation_id: input.operation.id,
    expected_number: input.expectedNumber,
    expected_provider_object_id: input.expectedProviderObjectId,
    observed_provider_object_id: input.operation.observedProviderObjectId,
    observed_number: input.operation.observedProviderResult?.number ?? null,
    expected_disposition: input.expectedDisposition,
    observed_disposition: input.observedDisposition,
    cleanup_confirmed: true,
  };
}

async function requireVoiceImportIdentityUnclaimed(
  admin: SupabaseClient,
  providerNumberId: string,
  number: string,
): Promise<void> {
  const filter = `provider_number_id.eq.${providerNumberId},e164_number.eq.${number}`;
  const [sms, voice] = await Promise.all([
    admin.from('sms_sender_numbers').select('id')
      .eq('provider', 'signalwire').neq('provisioning_status', 'released')
      .or(filter).limit(1).maybeSingle(),
    admin.from('voice_number_inventory').select('id')
      .eq('provider', 'signalwire').neq('lifecycle_state', 'released')
      .or(filter).limit(1).maybeSingle(),
  ]);
  if (sms.error || voice.error) {
    throw rpcFailure('Unable to prove the reconciled provider identity is unclaimed', sms.error ?? voice.error);
  }
  if (sms.data || voice.data) {
    throw new Error('The reconciled SignalWire identity already belongs to live SMS or AI Voice inventory. Import remains blocked.');
  }
}

function voiceNumberRecoveryTokenHmac(failedOperationId: string, rawToken: string): string {
  const configured = process.env.VOICE_NUMBER_RECOVERY_HMAC_SECRET?.trim() ?? '';
  const secret = Buffer.from(configured, 'utf8');
  if (secret.byteLength < 32) {
    secret.fill(0);
    throw new Error('VOICE_NUMBER_RECOVERY_HMAC_SECRET must contain at least 32 random bytes before retry recovery is enabled.');
  }
  try {
    return createHmac('sha256', secret)
      .update(`lgq.voice-number-retry.v1\0${failedOperationId}\0${rawToken}`, 'utf8')
      .digest('hex');
  } finally {
    secret.fill(0);
  }
}

export async function retryFailedVoiceNumberOperation(input: Readonly<{
  accountId: string;
  failedOperationId: string;
  actorReference: string;
  reason: string;
  admin?: SupabaseClient;
  runtime?: VoiceNumberOperationRuntime;
}>): Promise<Readonly<{
  retryAuthorizationId: string;
  retryGeneration: number;
  providerObjectId: string;
  replay: boolean;
}>> {
  requireVoiceNumberRecoveryEnabled();
  const accountId = requiredUuid(input.accountId, 'AI Voice retry account ID');
  const failedOperationId = requiredUuid(input.failedOperationId, 'Failed AI Voice operation ID');
  const actorReference = input.actorReference.trim().slice(0, 320);
  const reason = input.reason.trim().slice(0, 1000);
  if (actorReference.length < 3 || reason.length < 3) {
    throw new Error('AI Voice retry actor or reason is invalid.');
  }
  const admin = input.admin ?? createAdminClient();
  const operation = await loadVoiceNumberOperationDetail(admin, accountId, failedOperationId);
  if (operation.state !== 'failed' || !['configure_voice', 'release_number'].includes(operation.type)) {
    throw new Error('Only a reconciled failed AI Voice configuration or release can receive an explicit retry generation.');
  }

  let rawToken = randomBytes(32).toString('base64url');
  if (rawToken.length !== 43) throw new Error('AI Voice retry recovery token generation failed.');
  const recoveryTokenHmac = voiceNumberRecoveryTokenHmac(failedOperationId, rawToken);
  rawToken = '';
  const { data, error } = await admin.rpc('authorize_voice_number_operation_retry', {
    p_failed_operation_id: failedOperationId,
    p_recovery_token_hmac: recoveryTokenHmac,
    p_actor_reference: actorReference,
    p_reason: reason,
  });
  if (error) throw rpcFailure('Unable to authorize an explicit AI Voice operation retry', error);
  const row = oneRow(data, 'AI Voice operation retry authorization');
  const retryAuthorizationId = requiredUuid(row.retry_authorization_id, 'AI Voice retry authorization ID');
  const retryGeneration = safeInteger(row.retry_generation, 'AI Voice retry generation');
  const retryAuthorization = normalizeRetryAuthorization({
    id: retryAuthorizationId,
    generation: retryGeneration,
    recoveryTokenHmac,
  });
  requiredString(row.expires_at, 'AI Voice retry authorization expiry');

  const voiceNumberId = requiredUuid(operation.requestPayload.voice_number_id, 'AI Voice retry inventory ID');
  const providerNumberId = requiredUuid(operation.requestPayload.provider_number_id, 'AI Voice retry provider resource');
  const number = canonicalVoiceNumber(requiredString(operation.requestPayload.number, 'AI Voice retry number'));
  const result = operation.type === 'configure_voice'
    ? await configureVoiceNumberInbound({
      accountId,
      voiceNumberId,
      providerNumberId,
      number,
      friendlyName: requiredString(operation.requestPayload.friendly_name, 'AI Voice retry friendly name'),
      inboundWebhookUrl: requiredString(operation.requestPayload.call_request_url, 'AI Voice retry inbound URL'),
      statusCallbackUrl: requiredString(operation.requestPayload.call_status_callback_url, 'AI Voice retry status URL'),
      retryAuthorization,
      runtime: input.runtime,
    })
    : await releaseVoiceNumber({
      accountId,
      voiceNumberId,
      providerNumberId,
      number,
      retryAuthorization,
      runtime: input.runtime,
    });
  return Object.freeze({
    retryAuthorizationId,
    retryGeneration,
    providerObjectId: result.providerObjectId,
    replay: result.replay,
  });
}

export async function resolveIndeterminateVoiceNumberOperation(input: Readonly<{
  accountId: string;
  operationId: string;
  resolution: 'confirmed_absent' | 'confirmed_succeeded';
  actorReference: string;
  admin?: SupabaseClient;
  client?: SignalWireNumberProvisioningClient;
}>): Promise<void> {
  requireVoiceNumberRecoveryEnabled();
  const accountId = requiredUuid(input.accountId, 'AI Voice account ID');
  const operationId = requiredUuid(input.operationId, 'AI Voice number operation ID');
  const actorReference = input.actorReference.trim().slice(0, 320);
  if (actorReference.length < 3) throw new Error('AI Voice operation recovery actor is invalid.');
  const admin = input.admin ?? createAdminClient();
  const client = input.client ?? SignalWireNumberProvisioningClient.fromEnvironment();
  let operation = await loadVoiceNumberOperationDetail(admin, accountId, operationId);
  if (operation.state !== 'indeterminate') throw new Error('Only an indeterminate AI Voice number operation can be recovered.');
  if (operation.type !== 'purchase_number' && operation.requestPayload.provider !== 'signalwire') {
    throw new Error('Claimed AI Voice provider identity is invalid.');
  }

  const expectedNumber = canonicalVoiceNumber(requiredString(operation.requestPayload.number, 'Claimed AI Voice number'));
  const expectedProviderNumberId = operation.type === 'purchase_number'
    ? null
    : requiredUuid(operation.requestPayload.provider_number_id, 'Claimed SignalWire phone resource');
  let capturedEvidence = requireCapturedProviderEvidence(operation);
  let observedDisposition: ObservedIdentityDisposition = 'not_observed';
  let providerObjectId: string | null = null;
  let providerResult: Record<string, unknown> | null = null;
  let expectedDisposition: ExpectedIdentityDisposition = 'confirmed_absent';

  if (input.resolution === 'confirmed_absent') {
    if (operation.type === 'purchase_number') {
      const capturedMatchesExpectedNumber = capturedEvidence?.number === expectedNumber;
      observedDisposition = await reconcileCapturedProviderIdentity({
        admin, client, operation, captured: capturedEvidence,
        sameAsExpected: false, actorReference,
      });
      if (capturedMatchesExpectedNumber && capturedEvidence) {
        if (observedDisposition !== 'released' && observedDisposition !== 'confirmed_absent') {
          throw new Error('Exact-number captured purchase cleanup did not produce terminal identity evidence.');
        }
        providerObjectId = capturedEvidence.providerObjectId;
        expectedDisposition = observedDisposition;
      }

      // A prior worker may have deleted an exact-request resource and crashed
      // before resolving the operation. Replay every bounded durable expected
      // anchor before consulting mutable carrier lookup state.
      const purchaseAnchors = await enumeratePurchaseCleanupAnchors({
        admin, operation, number: expectedNumber,
      });
      for (const anchor of purchaseAnchors) {
        const cleanup = await cleanupReservedVoiceNumberIdentityChain({
          admin,
          client,
          operation,
          identityKind: 'expected',
          providerNumberId: anchor.providerNumberId,
          number: anchor.number,
          actorReference,
          reservationKey: anchor.reservationKey,
        });
        operation = cleanup.operation;
        providerObjectId = anchor.providerNumberId;
        expectedDisposition = cleanup.anchorDisposition;
      }

      const existing = await client.findOwnedPhoneNumber(expectedNumber);
      if (existing) {
        const exactRequestProviderNumberId = requiredUuid(
          existing.id,
          'Discovered exact-request SignalWire provider resource',
        );
        const exactRequestNumber = canonicalVoiceNumber(existing.number);
        if (exactRequestNumber !== expectedNumber) {
          throw new Error('SignalWire exact-number lookup returned a different E.164 identity.');
        }
        const cleanup = await cleanupReservedVoiceNumberIdentityChain({
          admin,
          client,
          operation,
          identityKind: 'expected',
          providerNumberId: exactRequestProviderNumberId,
          number: exactRequestNumber,
          actorReference,
        });
        operation = cleanup.operation;
        providerObjectId = exactRequestProviderNumberId;
        expectedDisposition = cleanup.anchorDisposition;
      }
      if (!providerObjectId) expectedDisposition = 'confirmed_absent';
    } else if (operation.type === 'configure_voice') {
      observedDisposition = await reconcileCapturedProviderIdentity({
        admin, client, operation, captured: capturedEvidence,
        sameAsExpected: capturedEvidence?.providerObjectId === expectedProviderNumberId
          && capturedEvidence.number === expectedNumber,
        actorReference,
      });
      const phone = await client.getPhoneNumber(expectedProviderNumberId!);
      if (phone.id !== expectedProviderNumberId || phone.number !== expectedNumber) {
        throw new Error('The live SignalWire phone resource no longer matches the claimed AI Voice number.');
      }
      const inboundUrl = requireExactSignalWireVoiceInboundWebhook(
        requiredString(operation.requestPayload.call_request_url, 'Claimed AI Voice inbound URL'),
      );
      const statusUrl = requireExactSignalWireVoiceProviderStatusCallback(
        requiredString(operation.requestPayload.call_status_callback_url, 'Claimed AI Voice provider-status URL'),
      );
      try {
        requireExactConfiguredVoicePhone(phone, {
          providerNumberId: expectedProviderNumberId!,
          number: expectedNumber,
          inboundUrl,
          statusUrl,
        });
      } catch {
        expectedDisposition = 'retained';
        providerObjectId = null;
        providerResult = null;
        await resolveVoiceNumberOperation({
          admin, operation, resolution: 'failed', providerObjectId, providerResult,
          errorCode: 'provider_outcome_confirmed_absent',
          errorDetail: 'Live SignalWire state proves the requested voice configuration was not applied.',
          expectedNumber, expectedProviderObjectId: expectedProviderNumberId,
          expectedDisposition, observedDisposition, actorReference,
        });
        return;
      }
      throw new Error('SignalWire already shows the exact AI Voice POST configuration. Import that success; do not retry the update.');
    } else {
      observedDisposition = await reconcileCapturedProviderIdentity({
        admin, client, operation, captured: capturedEvidence,
        sameAsExpected: capturedEvidence?.providerObjectId === expectedProviderNumberId
          && capturedEvidence.number === expectedNumber,
        actorReference,
      });
      try {
        const phone = await client.getPhoneNumber(expectedProviderNumberId!);
        if (phone.id !== expectedProviderNumberId || phone.number !== expectedNumber) {
          throw new Error('Live SignalWire release identity does not match the claimed AI Voice number.');
        }
      } catch (error) {
        if (error instanceof SignalWireProvisioningError
            && error.status === 404
            && error.outcomeKnownAbsent) {
          throw new Error('SignalWire no longer owns the exact number. Import the release success; do not retry it.');
        }
        throw error;
      }
      expectedDisposition = 'retained';
    }
    await resolveVoiceNumberOperation({
      admin, operation, resolution: 'failed', providerObjectId, providerResult: null,
      errorCode: 'provider_outcome_confirmed_absent',
      errorDetail: operation.type === 'release_number'
        ? 'Live SignalWire inventory proves the requested number release was not applied.'
        : 'Live SignalWire inventory proves the requested number purchase was not applied.',
      expectedNumber,
      expectedProviderObjectId: operation.type === 'purchase_number'
        ? providerObjectId
        : expectedProviderNumberId,
      expectedDisposition, observedDisposition, actorReference,
    });
    return;
  }

  if (operation.type === 'purchase_number') {
    const phone = await client.findOwnedPhoneNumber(expectedNumber);
    if (!phone || !phone.capabilities.includes('voice')) {
      throw new Error('SignalWire does not show the exact purchased voice-capable number.');
    }
    if (operation.providerObjectId && operation.providerObjectId !== phone.id) {
      throw new Error('Live SignalWire purchase identity conflicts with the captured provider response.');
    }
    if (capturedEvidence) {
      const exactDurableVoiceIdentity = capturedEvidence.providerObjectId === phone.id
        && capturedEvidence.number === expectedNumber;
      if (capturedEvidence.number === expectedNumber && !exactDurableVoiceIdentity) {
        throw new Error('Captured purchase evidence does not prove the exact live voice-capable provider object. Use cleanup-and-mark-absent recovery instead.');
      }
      observedDisposition = await reconcileCapturedProviderIdentity({
        admin, client, operation, captured: capturedEvidence,
        sameAsExpected: exactDurableVoiceIdentity, actorReference,
      });
    }
    providerObjectId = phone.id;
    providerResult = purchasePhoneResult(phone);
    await requireVoiceImportIdentityUnclaimed(admin, providerObjectId, expectedNumber);
    expectedDisposition = 'retained';
  } else if (operation.type === 'configure_voice') {
    const inboundUrl = requireExactSignalWireVoiceInboundWebhook(
      requiredString(operation.requestPayload.call_request_url, 'Claimed AI Voice inbound URL'),
    );
    const statusUrl = requireExactSignalWireVoiceProviderStatusCallback(
      requiredString(operation.requestPayload.call_status_callback_url, 'Claimed AI Voice provider-status URL'),
    );
    observedDisposition = await reconcileCapturedProviderIdentity({
      admin, client, operation, captured: capturedEvidence,
      sameAsExpected: capturedEvidence?.providerObjectId === expectedProviderNumberId
        && capturedEvidence.number === expectedNumber,
      actorReference,
    });
    const phone = await client.getPhoneNumber(expectedProviderNumberId!);
    requireExactConfiguredVoicePhone(phone, {
      providerNumberId: expectedProviderNumberId!,
      number: expectedNumber,
      inboundUrl,
      statusUrl,
    });
    if (operation.providerObjectId && operation.providerObjectId !== phone.id) {
      throw new Error('Live SignalWire configuration identity conflicts with the captured provider response.');
    }
    providerObjectId = phone.id;
    providerResult = configuredPhoneResult(phone);
    expectedDisposition = 'retained';
  } else {
    if (operation.providerObjectId && operation.providerObjectId !== expectedProviderNumberId) {
      throw new Error('Captured SignalWire release identity conflicts with the claimed provider resource.');
    }
    observedDisposition = await reconcileCapturedProviderIdentity({
      admin, client, operation, captured: capturedEvidence,
      sameAsExpected: capturedEvidence?.providerObjectId === expectedProviderNumberId
        && capturedEvidence.number === expectedNumber,
      actorReference,
    });
    const cleanup = await cleanupReservedVoiceNumberIdentityChain({
      admin, client, operation, identityKind: 'expected',
      providerNumberId: expectedProviderNumberId!, number: expectedNumber, actorReference,
      promoteFirstDiscoveryToObserved: true,
    });
    expectedDisposition = cleanup.anchorDisposition;
    operation = cleanup.operation;
    if (cleanup.promotedObservedDisposition) {
      capturedEvidence = requireCapturedProviderEvidence(operation);
      observedDisposition = cleanup.promotedObservedDisposition;
    }
    providerObjectId = expectedProviderNumberId!;
    providerResult = {
      provider: 'signalwire',
      id: expectedProviderNumberId!,
      number: expectedNumber,
      released: true,
    };
  }

  await resolveVoiceNumberOperation({
    admin, operation, resolution: 'succeeded', providerObjectId, providerResult,
    errorCode: null, errorDetail: null, expectedNumber,
    expectedProviderObjectId: operation.type === 'purchase_number' ? providerObjectId : expectedProviderNumberId,
    expectedDisposition, observedDisposition, actorReference,
  });
}

async function resolveVoiceNumberOperation(input: Readonly<{
  admin: SupabaseClient;
  operation: VoiceNumberOperationDetail;
  resolution: 'succeeded' | 'failed';
  providerObjectId: string | null;
  providerResult: Record<string, unknown> | null;
  errorCode: string | null;
  errorDetail: string | null;
  expectedNumber: string;
  expectedProviderObjectId: string | null;
  expectedDisposition: ExpectedIdentityDisposition;
  observedDisposition: ObservedIdentityDisposition;
  actorReference: string;
}>): Promise<void> {
  const reconciliationEvidence = voiceNumberReconciliationEvidence({
    operation: input.operation,
    expectedNumber: input.expectedNumber,
    expectedProviderObjectId: input.expectedProviderObjectId,
    expectedDisposition: input.expectedDisposition,
    observedDisposition: input.observedDisposition,
  });
  const { data, error } = await input.admin.rpc('resolve_voice_number_operation', {
    p_operation_id: input.operation.id,
    p_resolution: input.resolution,
    p_provider_object_id: input.providerObjectId,
    p_provider_result: input.providerResult,
    p_error_code: input.errorCode,
    p_error_detail: input.errorDetail,
    p_expected_identity_disposition: input.expectedDisposition,
    p_observed_identity_disposition: input.observedDisposition,
    p_reconciliation_evidence: reconciliationEvidence,
    p_actor_reference: input.actorReference,
  });
  if (error) throw rpcFailure('Unable to resolve the AI Voice number operation', error);
  if (data !== true) throw new Error('AI Voice number reconciliation was not acknowledged.');
}

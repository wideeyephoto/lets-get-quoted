import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createAdminClient } from '@/lib/auth';
import type { SmsBillingCategory } from '@/lib/sms-billing-policy';
import {
  outboundSmsSuppression,
  sendProviderMessage,
  SIMULATED_PROVIDER_ID,
  smsCanaryAccounts,
  smsSenderPurposeEnabled,
  SmsBillingRefusalError,
  SmsProviderRejectedError,
  smsProviderConfig,
  type SmsProviderId,
  type SmsUsageEvidence,
} from '@/lib/sms-provider';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHONE = /^\+[1-9][0-9]{7,14}$/;
const MAX_BATCH = 25;

export type SmsDeliveryClaim = Readonly<{
  claimToken: string;
  eventId: string;
  accountId: string;
  phoneNumber: string;
  body: string;
  messageKind: string;
  billingCategory: SmsBillingCategory;
  senderPurpose: string;
  attemptNumber: number;
  leaseExpiresAt: string;
}>;

export type SmsDeliveryStage = Readonly<{
  status: 'ready' | 'cancelled' | 'blocked_sender';
  senderNumberId: string | null;
  senderE164: string | null;
  providerNumberId: string | null;
}>;

export interface SmsDeliveryStore {
  claimBatch(batchSize: number): Promise<readonly SmsDeliveryClaim[]>;
  stage(claim: SmsDeliveryClaim, provider: SmsProviderId): Promise<SmsDeliveryStage>;
  markRequestStarted(claim: SmsDeliveryClaim, usage: SmsUsageEvidence): Promise<void>;
  rollbackPreRequestBoundary(claim: SmsDeliveryClaim): Promise<void>;
  complete(claim: SmsDeliveryClaim, providerId: string): Promise<void>;
  fail(claim: SmsDeliveryClaim, errorCode: string, retryable: boolean): Promise<string>;
  recordProviderRejection(
    claim: SmsDeliveryClaim,
    errorCode: string,
    retryable: boolean,
  ): Promise<string>;
  defer(claim: SmsDeliveryClaim, errorCode: string, delaySeconds: number): Promise<void>;
}

export interface SmsDeliveryMessenger {
  send(
    claim: SmsDeliveryClaim,
    provider: SmsProviderId,
    senderE164: string,
    beforeRequest: (usage: SmsUsageEvidence) => Promise<void>,
  ): Promise<string>;
}

type RpcError = Readonly<{ code?: string; message?: string }>;

export class SmsDeliveryRpcError extends Error {
  override readonly name = 'SmsDeliveryRpcError';
  constructor(readonly rpcCode: string | null, readonly details?: string) {
    super(`SMS delivery database operation failed${rpcCode ? ` (${rpcCode})` : ''}${details ? `: ${details}` : ''}`);
  }
}

export class SmsDeliveryWorkerError extends Error {
  override readonly name = 'SmsDeliveryWorkerError';
  constructor(readonly code: string, readonly retryable: boolean) {
    super(code);
  }
}

function rpcFailure(error: RpcError | null): SmsDeliveryRpcError {
  return new SmsDeliveryRpcError(error?.code?.trim() || null, error?.message);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (Array.isArray(value) && value.length !== 1) {
    throw new SmsDeliveryWorkerError(`${label}_invalid`, false);
  }
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new SmsDeliveryWorkerError(`${label}_invalid`, false);
  }
  return candidate as Record<string, unknown>;
}

function string(value: unknown, label: string, pattern?: RegExp): string {
  if (typeof value !== 'string' || !value || (pattern && !pattern.test(value))) {
    throw new SmsDeliveryWorkerError(`${label}_invalid`, false);
  }
  return value;
}

function uuid(value: unknown, label: string): string {
  return string(value, label, UUID).toLowerCase();
}

function timestamp(value: unknown, label: string): string {
  const parsed = string(value, label);
  if (!Number.isFinite(Date.parse(parsed))) {
    throw new SmsDeliveryWorkerError(`${label}_invalid`, false);
  }
  return new Date(parsed).toISOString();
}

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed)
      || parsed < minimum || parsed > maximum) {
    throw new SmsDeliveryWorkerError(`${label}_invalid`, false);
  }
  return parsed;
}

const CATEGORIES = new Set<SmsBillingCategory>([
  'customer_message', 'crew_message', 'owner_alert', 'payment_message', 'verification',
]);

function parseClaims(value: unknown, limit: number): readonly SmsDeliveryClaim[] {
  if (!Array.isArray(value) || value.length > limit) {
    throw new SmsDeliveryWorkerError('claim_batch_invalid', false);
  }
  const claims = value.map((candidate) => {
    const row = record(candidate, 'claim');
    const billingCategory = string(row.billing_category, 'billing_category') as SmsBillingCategory;
    if (!CATEGORIES.has(billingCategory)) {
      throw new SmsDeliveryWorkerError('billing_category_invalid', false);
    }
    return Object.freeze({
      claimToken: uuid(row.work_claim_token, 'claim_token'),
      eventId: uuid(row.sms_event_id, 'event_id'),
      accountId: uuid(row.account_id, 'account_id'),
      phoneNumber: string(row.phone_number, 'phone_number', PHONE),
      body: string(row.body, 'body'),
      messageKind: string(row.message_kind, 'message_kind'),
      billingCategory,
      senderPurpose: string(row.sender_purpose, 'sender_purpose'),
      attemptNumber: integer(row.attempt_number, 'attempt_number', 1, 8),
      leaseExpiresAt: timestamp(row.lease_expires_at, 'lease_expires_at'),
    });
  });
  if (new Set(claims.map((claim) => claim.eventId)).size !== claims.length
      || new Set(claims.map((claim) => claim.claimToken)).size !== claims.length) {
    throw new SmsDeliveryWorkerError('claim_batch_duplicate', false);
  }
  return Object.freeze(claims);
}

function parseStage(value: unknown): SmsDeliveryStage {
  const row = record(value, 'stage');
  const status = string(row.dispatch_status, 'dispatch_status');
  if (!['ready', 'cancelled', 'blocked_sender'].includes(status)) {
    throw new SmsDeliveryWorkerError('dispatch_status_invalid', false);
  }
  const senderNumberId = row.sender_number_id == null ? null : uuid(row.sender_number_id, 'sender_number_id');
  const senderE164 = row.sender_e164 == null ? null : string(row.sender_e164, 'sender_e164', PHONE);
  const providerNumberId = row.provider_number_id == null
    ? null
    : string(row.provider_number_id, 'provider_number_id');
  if ((status === 'ready' && (!senderNumberId || !senderE164))
      || (status !== 'ready' && (senderNumberId || senderE164 || providerNumberId))) {
    throw new SmsDeliveryWorkerError('stage_shape_invalid', false);
  }
  return Object.freeze({
    status: status as SmsDeliveryStage['status'],
    senderNumberId,
    senderE164,
    providerNumberId,
  });
}

export class SupabaseSmsDeliveryStore implements SmsDeliveryStore {
  constructor(private readonly admin: SupabaseClient = createAdminClient()) {}

  async claimBatch(batchSize: number): Promise<readonly SmsDeliveryClaim[]> {
    if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH) {
      throw new Error(`SMS delivery batch size must be between 1 and ${MAX_BATCH}.`);
    }
    const { data, error } = await this.admin.rpc('claim_sms_delivery_tasks', {
      p_batch_size: batchSize,
    });
    if (error) throw rpcFailure(error);
    return parseClaims(data, batchSize);
  }

  async stage(claim: SmsDeliveryClaim, provider: SmsProviderId): Promise<SmsDeliveryStage> {
    const { data, error } = await this.admin.rpc('stage_sms_delivery', {
      p_sms_event_id: uuid(claim.eventId, 'event_id'),
      p_claim_token: uuid(claim.claimToken, 'claim_token'),
      p_provider: provider,
    });
    if (error) throw rpcFailure(error);
    return parseStage(data);
  }

  async markRequestStarted(claim: SmsDeliveryClaim, usage: SmsUsageEvidence): Promise<void> {
    const { data, error } = await this.admin.rpc('mark_sms_delivery_request_started_with_usage', {
      p_sms_event_id: uuid(claim.eventId, 'event_id'),
      p_claim_token: uuid(claim.claimToken, 'claim_token'),
      p_usage_kind: usage.kind,
      p_reservation_id: usage.kind === 'reservation' ? usage.reservationId : null,
      p_finalization_key: usage.kind === 'reservation' ? usage.finalizationKey : null,
      p_overage_key: usage.kind === 'overage' ? usage.overageKey : null,
    });
    if (error) throw rpcFailure(error);
    if (data !== true) throw new SmsDeliveryWorkerError('request_start_result_invalid', false);
  }

  async rollbackPreRequestBoundary(claim: SmsDeliveryClaim): Promise<void> {
    const { data, error } = await this.admin.rpc('rollback_sms_delivery_pre_request_boundary', {
      p_sms_event_id: uuid(claim.eventId, 'event_id'),
      p_claim_token: uuid(claim.claimToken, 'claim_token'),
    });
    if (error) throw rpcFailure(error);
    if (data !== true) throw new SmsDeliveryWorkerError('pre_request_rollback_result_invalid', false);
  }

  async complete(claim: SmsDeliveryClaim, providerId: string): Promise<void> {
    const { data, error } = await this.admin.rpc('complete_sms_delivery', {
      p_sms_event_id: uuid(claim.eventId, 'event_id'),
      p_claim_token: uuid(claim.claimToken, 'claim_token'),
      p_provider_id: string(providerId, 'provider_id'),
    });
    if (error) throw rpcFailure(error);
    if (data !== true) throw new SmsDeliveryWorkerError('completion_result_invalid', false);
  }

  async fail(
    claim: SmsDeliveryClaim,
    errorCode: string,
    retryable: boolean,
  ): Promise<string> {
    const { data, error } = await this.admin.rpc('fail_sms_delivery', {
      p_sms_event_id: uuid(claim.eventId, 'event_id'),
      p_claim_token: uuid(claim.claimToken, 'claim_token'),
      p_error_code: string(errorCode, 'error_code', /^[a-z][a-z0-9_]{2,99}$/),
      p_retryable: retryable,
    });
    if (error) throw rpcFailure(error);
    const row = record(data, 'failure');
    return string(row.failure_status, 'failure_status');
  }

  async recordProviderRejection(
    claim: SmsDeliveryClaim,
    errorCode: string,
    retryable: boolean,
  ): Promise<string> {
    const { data, error } = await this.admin.rpc('record_sms_delivery_provider_rejection', {
      p_sms_event_id: uuid(claim.eventId, 'event_id'),
      p_claim_token: uuid(claim.claimToken, 'claim_token'),
      p_error_code: string(errorCode, 'error_code', /^[a-z][a-z0-9_]{2,99}$/),
      p_retryable: retryable,
    });
    if (error) throw rpcFailure(error);
    const row = record(data, 'provider_rejection');
    return string(row.failure_status, 'failure_status');
  }

  async defer(
    claim: SmsDeliveryClaim,
    errorCode: string,
    delaySeconds: number,
  ): Promise<void> {
    const { data, error } = await this.admin.rpc('defer_sms_delivery', {
      p_sms_event_id: uuid(claim.eventId, 'event_id'),
      p_claim_token: uuid(claim.claimToken, 'claim_token'),
      p_error_code: string(errorCode, 'error_code', /^[a-z][a-z0-9_]{2,99}$/),
      p_delay_seconds: integer(delaySeconds, 'delay_seconds', 5, 86_400),
    });
    if (error) throw rpcFailure(error);
    if (data !== true) throw new SmsDeliveryWorkerError('defer_result_invalid', false);
  }
}

export class ProviderSmsDeliveryMessenger implements SmsDeliveryMessenger {
  send(
    claim: SmsDeliveryClaim,
    provider: SmsProviderId,
    senderE164: string,
    beforeRequest: (usage: SmsUsageEvidence) => Promise<void>,
  ): Promise<string> {
    return sendProviderMessage(
      claim.phoneNumber,
      claim.body,
      { accountId: claim.accountId, category: claim.billingCategory },
      {
        provider,
        from: string(senderE164, 'sender_e164', PHONE),
        // A received provider rejection is safe to retry and gives its hold
        // back. The next attempt therefore needs a new billing identity, while
        // the domain delivery remains the same sms_event.
        messageKey: `sms:${claim.eventId}:attempt:${claim.attemptNumber}`,
        beforeRequest,
      },
    );
  }
}

export function classifySmsDeliveryFailure(
  error: unknown,
): Readonly<{ code: string; retryable: boolean; providerRejection: boolean }> {
  if (error instanceof SmsBillingRefusalError) {
    return Object.freeze({
      code: 'sms_billing_refused', retryable: false, providerRejection: false,
    });
  }
  if (error instanceof SmsProviderRejectedError) {
    return Object.freeze({
      code: `sms_provider_rejected_${error.status}`,
      retryable: error.retryable,
      providerRejection: true,
    });
  }
  if (error instanceof SmsDeliveryWorkerError) {
    return Object.freeze({
      code: error.code, retryable: error.retryable, providerRejection: false,
    });
  }
  if (error instanceof SmsDeliveryRpcError) {
    if (error.rpcCode === 'P5101') {
      return Object.freeze({
        code: 'sms_consent_not_current', retryable: false, providerRejection: false,
      });
    }
    if (error.rpcCode === 'P5102') {
      return Object.freeze({
        code: 'sms_sender_not_ready', retryable: true, providerRejection: false,
      });
    }
    if (error.rpcCode === 'P5103') {
      return Object.freeze({
        code: 'sms_sender_opted_out', retryable: false, providerRejection: false,
      });
    }
    if (error.rpcCode === 'P5104') {
      return Object.freeze({
        code: 'sms_delivery_expired', retryable: false, providerRejection: false,
      });
    }
    if (error.rpcCode === 'P5105') {
      return Object.freeze({
        code: 'sms_payment_transition_superseded', retryable: false, providerRejection: false,
      });
    }
    if (error.rpcCode === null || error.rpcCode.startsWith('08')
        || ['40001', '40P01', '55P03', '57014', 'PGRST000', 'PGRST001', 'PGRST002', 'PGRST003']
          .includes(error.rpcCode)) {
      return Object.freeze({
        code: 'sms_worker_transport_error', retryable: true, providerRejection: false,
      });
    }
    return Object.freeze({
      code: 'sms_worker_database_contract', retryable: false, providerRejection: false,
    });
  }
  if (error instanceof TypeError
      || (typeof DOMException !== 'undefined'
        && error instanceof DOMException && error.name === 'AbortError')) {
    return Object.freeze({
      code: 'sms_provider_transport_error', retryable: true, providerRejection: false,
    });
  }
  return Object.freeze({
    code: 'sms_worker_internal_error', retryable: true, providerRejection: false,
  });
}

export type SmsDeliveryRuntime = Readonly<{
  suppression: () => string | null;
  provider: () => SmsProviderId | null;
  canaryAccounts: () => ReadonlySet<string>;
  purposeEnabled?: (purpose: string) => boolean;
}>;

const environmentRuntime: SmsDeliveryRuntime = Object.freeze({
  suppression: () => outboundSmsSuppression(),
  provider: () => smsProviderConfig()?.id ?? null,
  canaryAccounts: smsCanaryAccounts,
  purposeEnabled: smsSenderPurposeEnabled,
});

export type SmsDeliveryBatchResult = Readonly<{
  disabledReason: string | null;
  claimedCount: number;
  completedCount: number;
  cancelledCount: number;
  deferredCount: number;
  indeterminateCount: number;
  failedCount: number;
}>;

export async function runSmsDeliveryBatch(
  batchSize = 10,
  store: SmsDeliveryStore = new SupabaseSmsDeliveryStore(),
  messenger: SmsDeliveryMessenger = new ProviderSmsDeliveryMessenger(),
  runtime: SmsDeliveryRuntime = environmentRuntime,
): Promise<SmsDeliveryBatchResult> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH) {
    throw new Error(`SMS delivery batch size must be between 1 and ${MAX_BATCH}.`);
  }
  const suppression = runtime.suppression();
  const provider = runtime.provider();
  if (suppression || !provider) {
    return Object.freeze({
      disabledReason: suppression ?? 'not-configured',
      claimedCount: 0, completedCount: 0, cancelledCount: 0,
      deferredCount: 0, indeterminateCount: 0, failedCount: 0,
    });
  }

  const canaries = runtime.canaryAccounts();
  let claimedCount = 0;
  let completedCount = 0;
  let cancelledCount = 0;
  let deferredCount = 0;
  let indeterminateCount = 0;
  let failedCount = 0;

  for (let index = 0; index < batchSize; index += 1) {
    const claims = await store.claimBatch(1);
    const claim = claims[0];
    if (!claim) break;
    claimedCount += 1;

    if (canaries.size > 0 && !canaries.has(claim.accountId)) {
      await store.defer(claim, 'sms_canary_account_not_enabled', 3600);
      deferredCount += 1;
      continue;
    }
    if (runtime.purposeEnabled && !runtime.purposeEnabled(claim.senderPurpose)) {
      await store.defer(claim, 'sms_sender_purpose_not_enabled', 3600);
      deferredCount += 1;
      continue;
    }

    let requestStarted = false;
    try {
      const stage = await store.stage(claim, provider);
      if (stage.status === 'cancelled') {
        cancelledCount += 1;
        continue;
      }
      if (stage.status === 'blocked_sender' || !stage.senderE164) {
        await store.defer(claim, 'sms_sender_not_ready', 900);
        deferredCount += 1;
        continue;
      }
      const providerId = await messenger.send(
        claim,
        provider,
        stage.senderE164,
        async (usage) => {
          try {
            await store.markRequestStarted(claim, usage);
            requestStarted = true;
          } catch (error) {
            // The RPC may have committed and lost its response, but the
            // provider socket is certainly not open yet. A token-bound
            // compensator can safely release the exact hold and restore the
            // retryable pre-request state. If it cannot, fail_sms_delivery
            // observes the durable marker and quarantines the task instead.
            try {
              await store.rollbackPreRequestBoundary(claim);
            } catch {
              console.error('SMS pre-request boundary rollback needs reconciliation');
            }
            throw error;
          }
        },
      );
      if (providerId === SIMULATED_PROVIDER_ID) {
        throw new SmsDeliveryWorkerError(
          requestStarted
            ? 'sms_provider_suppressed_after_start'
            : 'sms_provider_suppressed_before_request',
          false,
        );
      }
      await store.complete(claim, providerId);
      completedCount += 1;
    } catch (error) {
      console.error('[sms-delivery-worker] SMS delivery failed for claim', claim.eventId, error);
      const failure = classifySmsDeliveryFailure(error);
      const outcome = requestStarted && failure.providerRejection
        ? await store.recordProviderRejection(claim, failure.code, failure.retryable)
        : await store.fail(claim, failure.code, !requestStarted && failure.retryable);
      if (outcome === 'indeterminate') indeterminateCount += 1;
      else failedCount += 1;
    }
  }

  return Object.freeze({
    disabledReason: null,
    claimedCount,
    completedCount,
    cancelledCount,
    deferredCount,
    indeterminateCount,
    failedCount,
  });
}

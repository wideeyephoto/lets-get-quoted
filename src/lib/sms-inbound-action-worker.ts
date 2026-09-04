import 'server-only';

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createAdminClient } from '@/lib/auth';
import {
  processFieldIntakeClaim,
  type FieldIntakeActionResult,
} from '@/lib/sms-owner-field-worker';
import { enqueueSmsDelivery, type SmsSenderPurpose } from '@/lib/sms-delivery';
import {
  enqueueInboundReply,
  type InboundReplyKind,
} from '@/lib/sms-webhook-ingress';
import { normalizeUsPhone } from '@/lib/phone';
import type { SmsProviderId } from '@/lib/sms-provider';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHONE = /^\+[1-9][0-9]{7,14}$/;
const MAX_BATCH = 25;
const REPLY_KINDS = new Set<InboundReplyKind>([
  'offer', 'reschedule', 'appointment_confirmation', 'subcontractor', 'ambiguity',
]);
const PROVIDERS = new Set<SmsProviderId>(['twilio', 'signalwire']);
const PURPOSES = new Set<SmsSenderPurpose>(['lgq_shared', 'lgq_dispatch', 'contractor_dedicated']);

export type SmsInboundActionClaim = Readonly<{
  taskId: string;
  claimToken: string;
  provider: SmsProviderId;
  providerEventId: string;
  accountId: string;
  senderNumberId: string;
  senderPurpose: SmsSenderPurpose;
  fromNumber: string;
  effectApplied: boolean;
}>;

export type SmsInboundActionOutcome = Readonly<{
  actionKind: string;
  targetId: string | null;
  decision: string;
  replyKind: InboundReplyKind | null;
  replyBody: string | null;
  ownerAlertPhone: string | null;
  ownerAlertBody: string | null;
}>;

export type SmsInboundActionClaimResult = Readonly<{
  status: 'claimed' | 'busy' | 'deferred' | 'completed' | 'exhausted' | 'missing';
  claim: SmsInboundActionClaim | null;
}>;

export interface SmsInboundActionStore {
  claimReceipt(webhookReceiptId: string): Promise<SmsInboundActionClaimResult>;
  claimBatch(batchSize: number): Promise<readonly SmsInboundActionClaim[]>;
  apply(claim: SmsInboundActionClaim): Promise<SmsInboundActionOutcome>;
  complete(
    claim: SmsInboundActionClaim,
    customerReplyEventId: string | null,
    ownerAlertEventId: string | null,
  ): Promise<void>;
  fail(claim: SmsInboundActionClaim, errorCode: string): Promise<void>;
}

export type SmsFieldIntakeProcessor = (
  claim: SmsInboundActionClaim,
  admin: SupabaseClient,
) => Promise<FieldIntakeActionResult>;

type RpcError = Readonly<{ code?: string; message?: string }>;

export class SmsInboundActionRpcError extends Error {
  override readonly name = 'SmsInboundActionRpcError';
  constructor(readonly rpcCode: string | null) {
    super('Inbound SMS action database operation failed.');
  }
}

function rpcFailure(error: RpcError | null): SmsInboundActionRpcError {
  return new SmsInboundActionRpcError(error?.code?.trim() || null);
}

function row(value: unknown, label: string): Record<string, unknown> {
  if (Array.isArray(value)) {
    if (value.length !== 1) throw new Error(`${label} returned an invalid row count.`);
    value = value[0];
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} returned an invalid row.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, pattern?: RegExp): string {
  if (typeof value !== 'string' || !value || (pattern && !pattern.test(value))) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function uuid(value: unknown, label: string): string {
  return text(value, label, UUID).toLowerCase();
}

function strictBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} is invalid.`);
  return value;
}

function parseClaim(value: unknown): SmsInboundActionClaim {
  const candidate = row(value, 'Inbound action claim');
  const provider = text(candidate.provider, 'provider') as SmsProviderId;
  const senderPurpose = text(candidate.sender_purpose, 'sender purpose') as SmsSenderPurpose;
  if (!PROVIDERS.has(provider) || !PURPOSES.has(senderPurpose)) {
    throw new Error('Inbound action provider binding is invalid.');
  }
  return Object.freeze({
    taskId: uuid(candidate.task_id, 'task ID'),
    claimToken: uuid(candidate.work_claim_token, 'claim token'),
    provider,
    providerEventId: text(candidate.provider_event_id, 'provider event ID'),
    accountId: uuid(candidate.account_id, 'account ID'),
    senderNumberId: uuid(candidate.sender_number_id, 'sender number ID'),
    senderPurpose,
    fromNumber: text(candidate.from_number, 'from number', PHONE),
    effectApplied: strictBoolean(candidate.effect_applied, 'effect applied'),
  });
}

function parseClaimResult(value: unknown): SmsInboundActionClaimResult {
  const candidate = row(value, 'Inbound action claim');
  const status = text(candidate.claim_status, 'claim status') as SmsInboundActionClaimResult['status'];
  if (!['claimed', 'busy', 'deferred', 'completed', 'exhausted', 'missing'].includes(status)) {
    throw new Error('Inbound action claim status is invalid.');
  }
  return Object.freeze({
    status,
    claim: status === 'claimed' ? parseClaim(candidate) : null,
  });
}

function optionalText(value: unknown, label: string, maximum = 5000): string | null {
  if (value === null || value === undefined) return null;
  const result = text(value, label);
  if (result.length > maximum) throw new Error(`${label} is too long.`);
  return result;
}

function parseOutcome(value: unknown): SmsInboundActionOutcome {
  const candidate = row(value, 'Inbound action outcome');
  const rawReplyKind = candidate.reply_kind == null ? null : text(candidate.reply_kind, 'reply kind');
  if (rawReplyKind !== null && !REPLY_KINDS.has(rawReplyKind as InboundReplyKind)) {
    throw new Error('Inbound action reply kind is invalid.');
  }
  const targetId = candidate.target_id == null ? null : uuid(candidate.target_id, 'target ID');
  const ownerAlertPhone = candidate.owner_alert_phone == null
    ? null
    : text(candidate.owner_alert_phone, 'owner alert phone', PHONE);
  const outcome = Object.freeze({
    actionKind: text(candidate.action_kind, 'action kind'),
    targetId,
    decision: text(candidate.decision, 'decision'),
    replyKind: rawReplyKind as InboundReplyKind | null,
    replyBody: optionalText(candidate.reply_body, 'reply body'),
    ownerAlertPhone,
    ownerAlertBody: optionalText(candidate.owner_alert_body, 'owner alert body'),
  });
  if ((outcome.replyKind === null) !== (outcome.replyBody === null)
      || (outcome.ownerAlertPhone === null) !== (outcome.ownerAlertBody === null)) {
    throw new Error('Inbound action outcome pairs are incomplete.');
  }
  return outcome;
}

export class SupabaseSmsInboundActionStore implements SmsInboundActionStore {
  constructor(private readonly admin: SupabaseClient = createAdminClient()) {}

  async claimReceipt(webhookReceiptId: string): Promise<SmsInboundActionClaimResult> {
    const { data, error } = await this.admin.rpc('claim_sms_inbound_action', {
      p_webhook_receipt_id: uuid(webhookReceiptId, 'webhook receipt ID'),
    });
    if (error) throw rpcFailure(error);
    return parseClaimResult(data);
  }

  async claimBatch(batchSize: number): Promise<readonly SmsInboundActionClaim[]> {
    if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH) {
      throw new Error(`Inbound action batch size must be between 1 and ${MAX_BATCH}.`);
    }
    const { data, error } = await this.admin.rpc('claim_sms_inbound_action_batch', {
      p_batch_size: batchSize,
    });
    if (error) throw rpcFailure(error);
    if (!Array.isArray(data) || data.length > batchSize) {
      throw new Error('Inbound action batch returned an invalid result.');
    }
    return Object.freeze(data.map(parseClaim));
  }

  async apply(claim: SmsInboundActionClaim): Promise<SmsInboundActionOutcome> {
    const { data, error } = await this.admin.rpc('apply_sms_inbound_action', {
      p_task_id: claim.taskId,
      p_claim_token: claim.claimToken,
    });
    if (error) throw rpcFailure(error);
    return parseOutcome(data);
  }

  async complete(
    claim: SmsInboundActionClaim,
    customerReplyEventId: string | null,
    ownerAlertEventId: string | null,
  ): Promise<void> {
    const { data, error } = await this.admin.rpc('complete_sms_inbound_action', {
      p_task_id: claim.taskId,
      p_claim_token: claim.claimToken,
      p_customer_reply_event_id: customerReplyEventId,
      p_owner_alert_event_id: ownerAlertEventId,
    });
    if (error) throw rpcFailure(error);
    if (data !== true) throw new Error('Inbound action completion returned an invalid result.');
  }

  async fail(claim: SmsInboundActionClaim, errorCode: string): Promise<void> {
    const { data, error } = await this.admin.rpc('fail_sms_inbound_action', {
      p_task_id: claim.taskId,
      p_claim_token: claim.claimToken,
      p_error_code: errorCode,
    });
    if (error) throw rpcFailure(error);
    if (data !== true) throw new Error('Inbound action failure returned an invalid result.');
  }
}

function ownerAlertIdempotencyKey(claim: SmsInboundActionClaim): string {
  const digest = createHash('sha256')
    .update(`${claim.provider}\0${claim.providerEventId}`, 'utf8')
    .digest('hex');
  return `inbound-owner-alert:${claim.provider}:${digest}`;
}

async function isOwnerFieldIntake(claim: SmsInboundActionClaim, admin: SupabaseClient): Promise<boolean> {
  if (claim.senderPurpose === 'lgq_shared') return true;
  if (claim.senderPurpose === 'contractor_dedicated') {
    if (typeof admin?.from !== 'function') return false;
    try {
      const { data: account } = await admin
        .from('accounts')
        .select('alert_phone, high_value_sms_enabled')
        .eq('id', claim.accountId)
        .maybeSingle();

      const ownerAlertNormalized = account?.alert_phone ? normalizeUsPhone(account.alert_phone) : null;
      const senderNormalized = normalizeUsPhone(claim.fromNumber);
      if (account?.high_value_sms_enabled === true && ownerAlertNormalized && senderNormalized === ownerAlertNormalized) {
        return true;
      }
    } catch {
      return false;
    }
  }
  return false;
}

async function processClaim(
  claim: SmsInboundActionClaim,
  store: SmsInboundActionStore,
  admin: SupabaseClient,
  fieldIntakeProcessor: SmsFieldIntakeProcessor,
): Promise<void> {
  try {
    const isFieldIntake = !claim.effectApplied && await isOwnerFieldIntake(claim, admin);
    if (isFieldIntake) {
      const fieldResult = await fieldIntakeProcessor(claim, admin);
      if (!fieldResult.handled) {
        throw new Error(fieldResult.errorMessage || 'Field intake task was not completed.');
      }
      // apply_owner_field_action owns both the domain mutation/confirmation and
      // the durable task completion in a single transaction. Calling the generic completion
      // RPC here would use a claim token that the field RPC has already cleared.
      return;
    }

    // Claims whose legacy generic effect already committed must resume its
    // replay-safe apply/enqueue/complete path. In particular, routing an
    // applied lgq_shared claim into field intake would leave it processing:
    // the field RPC returns the stored legacy outcome without completing it.
    const outcome = await store.apply(claim);
    let customerReplyEventId: string | null = null;
    let ownerAlertEventId: string | null = null;
    if (outcome.replyKind && outcome.replyBody) {
      customerReplyEventId = await enqueueInboundReply(admin, {
        provider: claim.provider,
        providerEventId: claim.providerEventId,
        accountId: claim.accountId,
        senderNumberId: claim.senderNumberId,
        senderPurpose: claim.senderPurpose,
        phoneNumber: claim.fromNumber,
        body: outcome.replyBody,
        kind: outcome.replyKind,
      });
    }
    if (outcome.ownerAlertPhone && outcome.ownerAlertBody) {
      const queued = await enqueueSmsDelivery({
        accountId: claim.accountId,
        phoneNumber: outcome.ownerAlertPhone,
        body: outcome.ownerAlertBody,
        messageKind: 'inbound-owner-alert',
        billingCategory: 'owner_alert',
        // Owner alerts are a new outbound intent, not a reply on the inbound
        // carrier lane. Let the canonical billing-category mapping choose
        // lgq_shared and its active sender instead of inheriting a contractor or
        // dispatch number from the receipt.
        context: 'automation',
        eventType: 'inbound_action_owner_alert',
        idempotencyKey: ownerAlertIdempotencyKey(claim),
      }, admin);
      ownerAlertEventId = queued.eventId;
    }
    await store.complete(claim, customerReplyEventId, ownerAlertEventId);
  } catch (error) {
    try {
      await store.fail(claim, classifyInboundActionFailure(error));
    } catch (failError) {
      console.error('[sms-inbound-action-worker] Failed to record task failure in DB:', failError);
    }
    throw error;
  }
}

export function classifyInboundActionFailure(error: unknown): string {
  if (error instanceof SmsInboundActionRpcError) {
    if (error.rpcCode === '40001' || error.rpcCode === '40P01') return 'inbound_action_serialization';
    if (error.rpcCode?.startsWith('08') || error.rpcCode?.startsWith('PGRST')) {
      return 'inbound_action_transport';
    }
    return 'inbound_action_database';
  }
  if (error instanceof TypeError) return 'inbound_action_transport';
  return 'inbound_action_internal';
}

export async function processSmsInboundActionReceipt(
  webhookReceiptId: string,
  admin: SupabaseClient = createAdminClient(),
  store: SmsInboundActionStore = new SupabaseSmsInboundActionStore(admin),
  fieldIntakeProcessor: SmsFieldIntakeProcessor = processFieldIntakeClaim,
): Promise<SmsInboundActionClaimResult['status']> {
  const result = await store.claimReceipt(webhookReceiptId);
  if (!result.claim) return result.status;
  await processClaim(result.claim, store, admin, fieldIntakeProcessor);
  return 'completed';
}

export type SmsInboundActionBatchResult = Readonly<{
  claimedCount: number;
  completedCount: number;
  failedCount: number;
}>;

export async function runSmsInboundActionBatch(
  batchSize = 10,
  admin: SupabaseClient = createAdminClient(),
  store: SmsInboundActionStore = new SupabaseSmsInboundActionStore(admin),
  fieldIntakeProcessor: SmsFieldIntakeProcessor = processFieldIntakeClaim,
): Promise<SmsInboundActionBatchResult> {
  const claims = await store.claimBatch(batchSize);
  // Field intake may include a model call plus authenticated media downloads.
  // Start the modest claimed batch together so later claims do not spend most
  // of their two-minute lease waiting behind earlier AI work.
  const results = await Promise.all(claims.map(async (claim) => {
    try {
      await processClaim(claim, store, admin, fieldIntakeProcessor);
      return true;
    } catch (err) {
      console.error('[sms-inbound-action-worker] Claim processing error for task', claim.taskId, err);
      return false;
    }
  }));
  const completedCount = results.filter(Boolean).length;
  const failedCount = results.length - completedCount;
  return Object.freeze({ claimedCount: claims.length, completedCount, failedCount });
}

import 'server-only';

import { createAdminClient } from '@/lib/auth';
import {
  projectStripeBillingSubscriptionEvent,
  SupabaseStripeBillingSubscriptionProjectionStore,
  type ProjectStripeBillingSubscriptionEventResult,
  type StripeBillingSubscriptionProjectionResolver,
  type StripeBillingSubscriptionProjectionStore,
  type StripeSubscriptionProjectorClaim,
} from '@/lib/billing/subscription-event-projector';
import { createStripeBillingSubscriptionProjectionResolver } from '@/lib/billing/stripe-billing-subscription-events';
import type { PlatformSubscriptionEventType } from '@/lib/billing/stripe-event-inbox';

/**
 * DARK server-only worker foundation for the already-signed, redacted Stripe
 * Billing subscription inbox.
 *
 * A separately gated and CRON_SECRET-authenticated scheduler may request one
 * fixed bounded batch, but this runner claims and finishes one event before
 * claiming the next. The existing projector RPCs remain the only authority for
 * leases, exact Checkout/account/mode binding, projection, retry state, and
 * terminal failure. No raw provider payload or exception text is retained.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_ID_PATTERN = /^evt_[A-Za-z0-9_]{8,}$/;
const SUBSCRIPTION_ID_PATTERN = /^sub_[A-Za-z0-9]{8,}$/;
const INVOICE_ID_PATTERN = /^in_[A-Za-z0-9]{8,}$/;
const MAX_BATCH_SIZE = 25;
const MAX_PROVIDER_ATTEMPTS = 8;
const ATTEMPT_LIMIT_CODE = 'projection_retry_attempt_limit';

const PLATFORM_EVENT_TYPES = new Set<PlatformSubscriptionEventType>([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'customer.subscription.pending_update_applied',
  'customer.subscription.pending_update_expired',
  'customer.subscription.trial_will_end',
  'invoice.created',
  'invoice.updated',
  'invoice.finalized',
  'invoice.finalization_failed',
  'invoice.paid',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'invoice.payment_action_required',
  'invoice.marked_uncollectible',
  'invoice.voided',
]);

type RpcError = Readonly<{ code?: string }>;

class StripeSubscriptionProjectionWorkerRpcError extends Error {
  constructor(readonly rpcCode: string | null) {
    super('Stripe Billing subscription projection worker RPC failed.');
    this.name = 'StripeSubscriptionProjectionWorkerRpcError';
  }
}

function rpcFailure(error: RpcError | null): StripeSubscriptionProjectionWorkerRpcError {
  const code = typeof error?.code === 'string' && error.code.trim()
    ? error.code.trim().toUpperCase()
    : null;
  return new StripeSubscriptionProjectionWorkerRpcError(code);
}

function requiredString(value: unknown, label: string, pattern?: RegExp): string {
  if (typeof value !== 'string' || !value.trim() || (pattern && !pattern.test(value))) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function requiredUuid(value: unknown, label: string): string {
  return requiredString(value, label, UUID_PATTERN).toLowerCase();
}

function requiredInteger(value: unknown, label: string, minimum = 0): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`${label} is invalid.`);
  }
  return parsed;
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} is invalid.`);
  return value;
}

function requiredTimestamp(value: unknown, label: string): string {
  const text = requiredString(value, label);
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed) || parsed <= Date.UTC(2000, 0, 1)) {
    throw new Error(`${label} is invalid.`);
  }
  return new Date(parsed).toISOString();
}

function normalizedBatchSize(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_BATCH_SIZE) {
    throw new Error(`Stripe subscription projection batch size must be between 1 and ${MAX_BATCH_SIZE}.`);
  }
  return value;
}

function parseClaim(value: unknown): StripeSubscriptionProjectorClaim | null {
  if (value == null || (Array.isArray(value) && value.length === 0)) return null;
  if (Array.isArray(value) && value.length !== 1) {
    throw new Error('Stripe subscription worker claim RPC returned an invalid row count.');
  }
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('Stripe subscription worker claim RPC returned an invalid row.');
  }
  const row = candidate as Record<string, unknown>;
  if (row.claim_status !== 'claimed') {
    throw new Error('Stripe subscription worker claim RPC returned an unowned claim.');
  }
  const eventType = requiredString(row.event_type, 'event type') as PlatformSubscriptionEventType;
  if (!PLATFORM_EVENT_TYPES.has(eventType)) {
    throw new Error('Stripe subscription worker event type is invalid.');
  }
  const providerObjectType = requiredString(row.provider_object_type, 'provider object type');
  if (providerObjectType !== 'subscription' && providerObjectType !== 'invoice') {
    throw new Error('Stripe subscription worker provider object type is invalid.');
  }
  const providerObjectId = requiredString(
    row.provider_object_id,
    'provider object ID',
    providerObjectType === 'subscription' ? SUBSCRIPTION_ID_PATTERN : INVOICE_ID_PATTERN,
  );
  return Object.freeze({
    status: 'claimed',
    billingEventId: requiredUuid(row.billing_event_id, 'billing event ID'),
    claimToken: requiredUuid(row.claim_token, 'claim token'),
    attemptCount: requiredInteger(row.attempt_count, 'attempt count', 1),
    providerEventId: requiredString(row.provider_event_id, 'provider event ID', EVENT_ID_PATTERN),
    eventType,
    providerObjectId,
    providerObjectType,
    livemode: requiredBoolean(row.livemode, 'livemode'),
    providerCreatedAt: requiredTimestamp(row.provider_created_at, 'provider creation time'),
  });
}

export interface StripeBillingSubscriptionProjectionWorkerQueue {
  claimNext(): Promise<StripeSubscriptionProjectorClaim | null>;
}

export class SupabaseStripeBillingSubscriptionProjectionWorkerQueue
implements StripeBillingSubscriptionProjectionWorkerQueue {
  constructor(private readonly admin = createAdminClient()) {}

  async claimNext(): Promise<StripeSubscriptionProjectorClaim | null> {
    const { data, error } = await this.admin.rpc(
      'claim_next_due_stripe_billing_subscription_event',
    );
    if (error) throw rpcFailure(error);
    return parseClaim(data);
  }
}

function assertOwnedInput(
  claim: StripeSubscriptionProjectorClaim,
  billingEventId: string,
  claimToken: string,
): void {
  if (requiredUuid(billingEventId, 'billing event ID') !== claim.billingEventId
      || requiredUuid(claimToken, 'claim token') !== claim.claimToken) {
    throw new Error('Stripe subscription worker projection ownership is invalid.');
  }
}

/** Present one already-owned database claim to the existing single-event projector. */
class PreclaimedStripeBillingSubscriptionProjectionStore
implements StripeBillingSubscriptionProjectionStore {
  private claimRead = false;

  constructor(
    private readonly claimValue: StripeSubscriptionProjectorClaim,
    private readonly delegate: StripeBillingSubscriptionProjectionStore,
  ) {}

  async claim(billingEventId: string): Promise<StripeSubscriptionProjectorClaim> {
    if (this.claimRead || requiredUuid(billingEventId, 'billing event ID') !== this.claimValue.billingEventId) {
      throw new Error('Stripe subscription worker claim cannot be replayed or rebound.');
    }
    this.claimRead = true;
    return this.claimValue;
  }

  async resolveBinding(input: Parameters<StripeBillingSubscriptionProjectionStore['resolveBinding']>[0]) {
    assertOwnedInput(this.claimValue, input.billingEventId, input.claimToken);
    return this.delegate.resolveBinding(input);
  }

  async project(input: Parameters<StripeBillingSubscriptionProjectionStore['project']>[0]) {
    assertOwnedInput(this.claimValue, input.billingEventId, input.claimToken);
    return this.delegate.project(input);
  }

  async fail(input: Parameters<StripeBillingSubscriptionProjectionStore['fail']>[0]) {
    assertOwnedInput(this.claimValue, input.billingEventId, input.claimToken);
    return this.delegate.fail(input);
  }
}

export type StripeSubscriptionProjectionClaimDependencies = Readonly<{
  projectionStore: StripeBillingSubscriptionProjectionStore;
  resolver: StripeBillingSubscriptionProjectionResolver;
  now(): Date;
}>;

/**
 * Project one already-leased event. A ninth recovery claim performs no Stripe
 * egress: it terminalizes the existing failed shape with a fixed code. Thus no
 * event can make more than eight provider projection attempts, while a crash on
 * attempt eight still has a deterministic lease-recovery path.
 */
export async function processClaimedStripeBillingSubscriptionProjection(
  claim: StripeSubscriptionProjectorClaim,
  dependencies: StripeSubscriptionProjectionClaimDependencies,
): Promise<ProjectStripeBillingSubscriptionEventResult> {
  const claimToken = claim.claimToken;
  if (claim.status !== 'claimed' || !claimToken) {
    throw new Error('Stripe subscription worker requires an owned claim.');
  }
  if (claim.attemptCount > MAX_PROVIDER_ATTEMPTS) {
    await dependencies.projectionStore.fail({
      billingEventId: claim.billingEventId,
      claimToken,
      errorCode: ATTEMPT_LIMIT_CODE,
      retryable: false,
      nextAttemptAt: null,
    });
    return Object.freeze({
      status: 'failed_terminal',
      billingEventId: claim.billingEventId,
      errorCode: ATTEMPT_LIMIT_CODE,
    });
  }

  return projectStripeBillingSubscriptionEvent(claim.billingEventId, {
    store: new PreclaimedStripeBillingSubscriptionProjectionStore(
      claim,
      dependencies.projectionStore,
    ),
    resolver: dependencies.resolver,
    now: dependencies.now,
  });
}

export type StripeSubscriptionProjectionWorkerItemResult =
  | ProjectStripeBillingSubscriptionEventResult
  | Readonly<{
    status: 'worker_error';
    billingEventId: string;
    errorCode: 'projection_worker_execution_error';
  }>;

export type StripeSubscriptionProjectionWorkerBatchResult = Readonly<{
  status: 'completed' | 'claim_failed';
  requestedBatchSize: number;
  claimedCount: number;
  results: readonly StripeSubscriptionProjectionWorkerItemResult[];
  errorCode: 'projection_worker_claim_error' | null;
}>;

export type StripeSubscriptionProjectionWorkerDependencies = Readonly<{
  queue: StripeBillingSubscriptionProjectionWorkerQueue;
  process(
    claim: StripeSubscriptionProjectorClaim,
  ): Promise<ProjectStripeBillingSubscriptionEventResult>;
}>;

function defaultDependencies(): StripeSubscriptionProjectionWorkerDependencies {
  const admin = createAdminClient();
  const queue = new SupabaseStripeBillingSubscriptionProjectionWorkerQueue(admin);
  const projectionStore = new SupabaseStripeBillingSubscriptionProjectionStore(admin);
  const resolver = createStripeBillingSubscriptionProjectionResolver();
  return Object.freeze({
    queue,
    process: (claim: StripeSubscriptionProjectorClaim) => (
      processClaimedStripeBillingSubscriptionProjection(claim, {
        projectionStore,
        resolver,
        now: () => new Date(),
      })
    ),
  });
}

/**
 * Run at most `batchSize` events. Processing is deliberately sequential and a
 * new lease is not taken until the previous event is terminal or retry-scheduled.
 */
export async function runStripeBillingSubscriptionProjectionBatch(
  batchSize: number,
  injectedDependencies?: StripeSubscriptionProjectionWorkerDependencies,
): Promise<StripeSubscriptionProjectionWorkerBatchResult> {
  const requestedBatchSize = normalizedBatchSize(batchSize);
  const dependencies = injectedDependencies ?? defaultDependencies();
  const results: StripeSubscriptionProjectionWorkerItemResult[] = [];
  let claimedCount = 0;

  for (let index = 0; index < requestedBatchSize; index += 1) {
    let claim: StripeSubscriptionProjectorClaim | null;
    try {
      claim = await dependencies.queue.claimNext();
    } catch {
      return Object.freeze({
        status: 'claim_failed',
        requestedBatchSize,
        claimedCount,
        results: Object.freeze(results),
        errorCode: 'projection_worker_claim_error',
      });
    }
    if (!claim) break;
    claimedCount += 1;

    try {
      results.push(await dependencies.process(claim));
    } catch {
      // The existing claim lease is the crash-recovery boundary. Never persist
      // arbitrary exception text or issue an ownership-blind second failure.
      results.push(Object.freeze({
        status: 'worker_error',
        billingEventId: claim.billingEventId,
        errorCode: 'projection_worker_execution_error',
      }));
    }
  }

  return Object.freeze({
    status: 'completed',
    requestedBatchSize,
    claimedCount,
    results: Object.freeze(results),
    errorCode: null,
  });
}

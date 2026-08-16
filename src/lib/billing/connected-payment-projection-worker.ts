import 'server-only';

import { createAdminClient } from '@/lib/auth';
import {
  SupabaseConnectedPaymentLateSuccessStore,
  reconcileConnectedPaymentLateSuccess,
} from '@/lib/billing/connected-payment-late-success-reconciler';
import {
  CONNECTED_PAYMENT_SUCCESS_EVENT,
  createConnectedPaymentProjectionResolver,
  projectConnectedPaymentEvent,
  SupabaseConnectedPaymentProjectionStore,
  type ConnectedPaymentProjectionResolver,
  type ConnectedPaymentProjectionStore,
  type ConnectedPaymentLateSuccessHandler,
  type ConnectedPaymentProjectorClaim,
  type ProjectConnectedPaymentEventResult,
} from '@/lib/billing/connected-payment-event-projector';

/**
 * DARK server-only worker for paid card Checkout events received from the
 * connected-account webhook inbox.
 *
 * Postgres selects and leases one exact LGQ direct-Checkout event at a time.
 * The committed projector remains the sole provider-correlation and payment
 * projection authority. A fixed batch cannot be enlarged by request input,
 * and this runner never takes a second lease while provider reads are active.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_ID_PATTERN = /^evt_[A-Za-z0-9_]{8,}$/;
const ACCOUNT_ID_PATTERN = /^acct_[A-Za-z0-9]{8,}$/;
const CHECKOUT_SESSION_ID_PATTERN = /^cs_[A-Za-z0-9_]+$/;
const MAX_BATCH_SIZE = 25;
const MAX_PROVIDER_ATTEMPTS = 8;

type RpcError = Readonly<{ code?: string }>;

class ConnectedPaymentProjectionWorkerRpcError extends Error {
  constructor(readonly rpcCode: string | null) {
    super('Connected payment projection worker RPC failed.');
    this.name = 'ConnectedPaymentProjectionWorkerRpcError';
  }
}

function rpcFailure(error: RpcError | null): ConnectedPaymentProjectionWorkerRpcError {
  const code = typeof error?.code === 'string' && error.code.trim()
    ? error.code.trim().toUpperCase()
    : null;
  return new ConnectedPaymentProjectionWorkerRpcError(code);
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
    throw new Error(`Connected payment projection batch size must be between 1 and ${MAX_BATCH_SIZE}.`);
  }
  return value;
}

function parseQueueItem(value: unknown): ConnectedPaymentProjectorClaim | null {
  if (value == null || (Array.isArray(value) && value.length === 0)) return null;
  if (Array.isArray(value) && value.length !== 1) {
    throw new Error('Connected payment worker selector returned an invalid row count.');
  }
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('Connected payment worker selector returned an invalid row.');
  }
  const row = candidate as Record<string, unknown>;
  const status = requiredString(row.claim_status, 'claim status');
  if (status !== 'claimed' && status !== 'failed_terminal') {
    throw new Error('Connected payment worker selector returned an unowned outcome.');
  }
  const eventType = requiredString(row.event_type, 'event type');
  if (eventType !== CONNECTED_PAYMENT_SUCCESS_EVENT) {
    throw new Error('Connected payment worker event type is outside the success projector.');
  }
  const attemptCount = requiredInteger(row.attempt_count, 'attempt count');
  const claimToken = row.claim_token == null ? null : requiredUuid(row.claim_token, 'claim token');
  if (
    (status === 'claimed' && (claimToken === null || attemptCount < 1 || attemptCount > MAX_PROVIDER_ATTEMPTS))
    || (status === 'failed_terminal' && (claimToken !== null || attemptCount < MAX_PROVIDER_ATTEMPTS))
  ) {
    throw new Error('Connected payment worker selector ownership is invalid.');
  }
  return Object.freeze({
    status,
    billingEventId: requiredUuid(row.billing_event_id, 'billing event ID'),
    claimToken,
    attemptCount,
    providerEventId: requiredString(row.provider_event_id, 'provider event ID', EVENT_ID_PATTERN),
    eventType,
    checkoutSessionId: requiredString(
      row.checkout_session_id,
      'Checkout Session ID',
      CHECKOUT_SESSION_ID_PATTERN,
    ),
    workspaceId: requiredUuid(row.workspace_id, 'workspace ID'),
    merchantAccountId: requiredString(
      row.merchant_account_id,
      'Merchant account ID',
      ACCOUNT_ID_PATTERN,
    ),
    livemode: requiredBoolean(row.livemode, 'livemode'),
    providerCreatedAt: requiredTimestamp(row.provider_created_at, 'provider creation time'),
  });
}

export interface ConnectedPaymentProjectionWorkerQueue {
  claimNext(): Promise<ConnectedPaymentProjectorClaim | null>;
}

export class SupabaseConnectedPaymentProjectionWorkerQueue
implements ConnectedPaymentProjectionWorkerQueue {
  constructor(private readonly admin = createAdminClient()) {}

  async claimNext(): Promise<ConnectedPaymentProjectorClaim | null> {
    const { data, error } = await this.admin.rpc(
      'claim_next_due_stripe_connected_payment_event',
    );
    if (error) throw rpcFailure(error);
    return parseQueueItem(data);
  }
}

function assertOwnedInput(
  claim: ConnectedPaymentProjectorClaim,
  billingEventId: string,
  claimToken: string,
): void {
  if (
    claim.status !== 'claimed'
    || !claim.claimToken
    || requiredUuid(billingEventId, 'billing event ID') !== claim.billingEventId
    || requiredUuid(claimToken, 'claim token') !== claim.claimToken
  ) {
    throw new Error('Connected payment worker projection ownership is invalid.');
  }
}

/** Present one already-owned database claim to the committed projector. */
class PreclaimedConnectedPaymentProjectionStore implements ConnectedPaymentProjectionStore {
  private claimRead = false;

  constructor(
    private readonly claimValue: ConnectedPaymentProjectorClaim,
    private readonly delegate: ConnectedPaymentProjectionStore,
  ) {}

  async claim(billingEventId: string): Promise<ConnectedPaymentProjectorClaim> {
    if (this.claimRead || requiredUuid(billingEventId, 'billing event ID') !== this.claimValue.billingEventId) {
      throw new Error('Connected payment worker claim cannot be replayed or rebound.');
    }
    this.claimRead = true;
    return this.claimValue;
  }

  async resolveBinding(input: Parameters<ConnectedPaymentProjectionStore['resolveBinding']>[0]) {
    assertOwnedInput(this.claimValue, input.billingEventId, input.claimToken);
    return this.delegate.resolveBinding(input);
  }

  async plan(input: Parameters<ConnectedPaymentProjectionStore['plan']>[0]) {
    assertOwnedInput(this.claimValue, input.billingEventId, input.claimToken);
    return this.delegate.plan(input);
  }

  async project(input: Parameters<ConnectedPaymentProjectionStore['project']>[0]) {
    assertOwnedInput(this.claimValue, input.billingEventId, input.claimToken);
    return this.delegate.project(input);
  }

  async fail(input: Parameters<ConnectedPaymentProjectionStore['fail']>[0]) {
    assertOwnedInput(this.claimValue, input.billingEventId, input.claimToken);
    return this.delegate.fail(input);
  }
}

export type ConnectedPaymentProjectionClaimDependencies = Readonly<{
  projectionStore: ConnectedPaymentProjectionStore;
  resolver: ConnectedPaymentProjectionResolver;
  lateSuccess: ConnectedPaymentLateSuccessHandler;
  now(): Date;
}>;

/**
 * Process one selector outcome. An over-limit row is already durably terminal
 * and stops before provider setup. An ordinary owned lease passes through the
 * committed projector without taking a second database claim.
 */
export async function processClaimedConnectedPaymentProjection(
  claim: ConnectedPaymentProjectorClaim,
  dependencies: ConnectedPaymentProjectionClaimDependencies,
): Promise<ProjectConnectedPaymentEventResult> {
  if (claim.status === 'failed_terminal') {
    return Object.freeze({
      status: 'failed_terminal',
      billingEventId: claim.billingEventId,
      errorCode: 'projection_retry_attempt_limit',
    });
  }
  if (claim.status !== 'claimed' || !claim.claimToken) {
    throw new Error('Connected payment worker requires an owned claim.');
  }

  return projectConnectedPaymentEvent(claim.billingEventId, {
    store: new PreclaimedConnectedPaymentProjectionStore(
      claim,
      dependencies.projectionStore,
    ),
    resolver: dependencies.resolver,
    lateSuccess: dependencies.lateSuccess,
    now: dependencies.now,
  });
}

export type ConnectedPaymentProjectionWorkerItemResult =
  | ProjectConnectedPaymentEventResult
  | Readonly<{
    status: 'worker_error';
    billingEventId: string;
    errorCode: 'projection_worker_execution_error';
  }>;

export type ConnectedPaymentProjectionWorkerBatchResult = Readonly<{
  status: 'completed' | 'claim_failed';
  requestedBatchSize: number;
  selectedCount: number;
  claimedCount: number;
  results: readonly ConnectedPaymentProjectionWorkerItemResult[];
  errorCode: 'projection_worker_claim_error' | null;
}>;

export type ConnectedPaymentProjectionWorkerDependencies = Readonly<{
  queue: ConnectedPaymentProjectionWorkerQueue;
  process(
    claim: ConnectedPaymentProjectorClaim,
  ): Promise<ProjectConnectedPaymentEventResult>;
}>;

function defaultDependencies(): ConnectedPaymentProjectionWorkerDependencies {
  const admin = createAdminClient();
  const queue = new SupabaseConnectedPaymentProjectionWorkerQueue(admin);
  const projectionStore = new SupabaseConnectedPaymentProjectionStore(admin);
  const lateSuccessStore = new SupabaseConnectedPaymentLateSuccessStore(admin);
  const resolver = createConnectedPaymentProjectionResolver();
  return Object.freeze({
    queue,
    process: (claim: ConnectedPaymentProjectorClaim) => (
      processClaimedConnectedPaymentProjection(claim, {
        projectionStore,
        resolver,
        lateSuccess: {
          reconcile: (input) => reconcileConnectedPaymentLateSuccess(input, {
            store: lateSuccessStore,
          }),
          fail: (input) => lateSuccessStore.fail({
            billingEventId: input.billingEventId,
            eventClaimToken: input.eventClaimToken,
            plan: input.plan,
            errorCode: input.errorCode,
            retryable: input.retryable,
            nextAttemptAt: input.nextAttemptAt,
          }),
        },
        now: () => new Date(),
      })
    ),
  });
}

/** Run at most `batchSize` selector outcomes, strictly one at a time. */
export async function runConnectedPaymentProjectionBatch(
  batchSize: number,
  injectedDependencies?: ConnectedPaymentProjectionWorkerDependencies,
): Promise<ConnectedPaymentProjectionWorkerBatchResult> {
  const requestedBatchSize = normalizedBatchSize(batchSize);
  const dependencies = injectedDependencies ?? defaultDependencies();
  const results: ConnectedPaymentProjectionWorkerItemResult[] = [];
  let selectedCount = 0;
  let claimedCount = 0;

  for (let index = 0; index < requestedBatchSize; index += 1) {
    let claim: ConnectedPaymentProjectorClaim | null;
    try {
      claim = await dependencies.queue.claimNext();
    } catch {
      return Object.freeze({
        status: 'claim_failed',
        requestedBatchSize,
        selectedCount,
        claimedCount,
        results: Object.freeze(results),
        errorCode: 'projection_worker_claim_error',
      });
    }
    if (!claim) break;
    selectedCount += 1;
    if (claim.status === 'claimed') claimedCount += 1;

    try {
      results.push(await dependencies.process(claim));
    } catch {
      // Keep exception text out of responses and heartbeats. A claimed row's
      // five-minute lease is the only ownership-safe crash recovery boundary.
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
    selectedCount,
    claimedCount,
    results: Object.freeze(results),
    errorCode: null,
  });
}

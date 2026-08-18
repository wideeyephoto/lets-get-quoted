import 'server-only';

import { createAdminClient } from '@/lib/auth';
import { PLATFORM_TOP_UP_EVENT_TYPES, type PlatformTopUpEventType } from '@/lib/billing/stripe-event-inbox';
import {
  SupabaseTopUpProjectionStore,
  createTopUpProjectionResolver,
  projectPlatformTopUpEvent,
  type ProjectTopUpEventResult,
  type TopUpProjectionResolver,
  type TopUpProjectionStore,
  type TopUpProjectorClaim,
} from '@/lib/billing/top-up-event-projector';

/**
 * DARK server-only worker that drains the top-up inbox.
 *
 * Postgres selects and leases one event at a time; the committed projector
 * remains the sole authority on what an event means and what it grants. A fixed
 * batch cannot be enlarged by request input, and this runner never takes a
 * second lease while a Stripe read is in flight.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_ID_PATTERN = /^evt_[A-Za-z0-9_]{8,}$/;
const CHECKOUT_SESSION_ID_PATTERN = /^cs_[A-Za-z0-9_]+$/;
const MAX_BATCH_SIZE = 25;
const MAX_PROVIDER_ATTEMPTS = 8;

type RpcError = Readonly<{ code?: string }>;

class TopUpProjectionWorkerRpcError extends Error {
  constructor(readonly rpcCode: string | null) {
    super('Top-up projection worker RPC failed.');
    this.name = 'TopUpProjectionWorkerRpcError';
  }
}

function rpcFailure(error: RpcError | null): TopUpProjectionWorkerRpcError {
  const code = typeof error?.code === 'string' && error.code.trim()
    ? error.code.trim().toUpperCase()
    : null;
  return new TopUpProjectionWorkerRpcError(code);
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
    throw new Error(`Top-up projection batch size must be between 1 and ${MAX_BATCH_SIZE}.`);
  }
  return value;
}

function parseQueueItem(value: unknown): TopUpProjectorClaim | null {
  if (value == null || (Array.isArray(value) && value.length === 0)) return null;
  if (Array.isArray(value) && value.length !== 1) {
    throw new Error('Top-up worker selector returned an invalid row count.');
  }
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('Top-up worker selector returned an invalid row.');
  }
  const row = candidate as Record<string, unknown>;
  const status = requiredString(row.claim_status, 'claim status');
  if (status !== 'claimed' && status !== 'failed_terminal') {
    throw new Error('Top-up worker selector returned an unowned outcome.');
  }
  const eventType = requiredString(row.event_type, 'event type');
  if (!(PLATFORM_TOP_UP_EVENT_TYPES as readonly string[]).includes(eventType)) {
    throw new Error('Top-up worker event type is outside the top-up projector.');
  }
  const attemptCount = requiredInteger(row.attempt_count, 'attempt count');
  const claimToken = row.claim_token == null ? null : requiredUuid(row.claim_token, 'claim token');
  if (
    (status === 'claimed' && (claimToken === null || attemptCount < 1 || attemptCount > MAX_PROVIDER_ATTEMPTS))
    || (status === 'failed_terminal' && (claimToken !== null || attemptCount < MAX_PROVIDER_ATTEMPTS))
  ) {
    throw new Error('Top-up worker selector ownership is invalid.');
  }
  return Object.freeze({
    status,
    billingEventId: requiredUuid(row.billing_event_id, 'billing event ID'),
    claimToken,
    attemptCount,
    providerEventId: requiredString(row.provider_event_id, 'provider event ID', EVENT_ID_PATTERN),
    eventType: eventType as PlatformTopUpEventType,
    checkoutSessionId: requiredString(
      row.checkout_session_id,
      'Checkout Session ID',
      CHECKOUT_SESSION_ID_PATTERN,
    ),
    // Null until the projector binds it. The inbox cannot resolve a workspace
    // for a platform Session, so an unbound row here is the normal case.
    workspaceId: row.workspace_id == null ? null : requiredUuid(row.workspace_id, 'workspace ID'),
    livemode: requiredBoolean(row.livemode, 'livemode'),
    providerCreatedAt: requiredTimestamp(row.provider_created_at, 'provider creation time'),
  });
}

export interface TopUpProjectionWorkerQueue {
  claimNext(): Promise<TopUpProjectorClaim | null>;
}

export class SupabaseTopUpProjectionWorkerQueue implements TopUpProjectionWorkerQueue {
  constructor(private readonly admin = createAdminClient()) {}

  async claimNext(): Promise<TopUpProjectorClaim | null> {
    const { data, error } = await this.admin.rpc('claim_next_due_stripe_platform_top_up_event');
    if (error) throw rpcFailure(error);
    return parseQueueItem(data);
  }
}

function assertOwnedInput(
  claim: TopUpProjectorClaim,
  billingEventId: string,
  claimToken: string,
): void {
  if (
    claim.status !== 'claimed'
    || !claim.claimToken
    || requiredUuid(billingEventId, 'billing event ID') !== claim.billingEventId
    || requiredUuid(claimToken, 'claim token') !== claim.claimToken
  ) {
    throw new Error('Top-up worker projection ownership is invalid.');
  }
}

/** Present one already-owned database claim to the committed projector. */
class PreclaimedTopUpProjectionStore implements TopUpProjectionStore {
  private claimRead = false;

  constructor(
    private readonly claimValue: TopUpProjectorClaim,
    private readonly delegate: TopUpProjectionStore,
  ) {}

  async claim(billingEventId: string): Promise<TopUpProjectorClaim> {
    if (
      this.claimRead
      || requiredUuid(billingEventId, 'billing event ID') !== this.claimValue.billingEventId
    ) {
      throw new Error('Top-up worker claim cannot be replayed or rebound.');
    }
    this.claimRead = true;
    return this.claimValue;
  }

  async project(input: Parameters<TopUpProjectionStore['project']>[0]) {
    assertOwnedInput(this.claimValue, input.billingEventId, input.claimToken);
    return this.delegate.project(input);
  }

  async fail(input: Parameters<TopUpProjectionStore['fail']>[0]) {
    assertOwnedInput(this.claimValue, input.billingEventId, input.claimToken);
    return this.delegate.fail(input);
  }
}

export type TopUpProjectionClaimDependencies = Readonly<{
  projectionStore: TopUpProjectionStore;
  resolver: TopUpProjectionResolver;
  now(): Date;
}>;

/**
 * Process one selector outcome. An over-limit row is already durably terminal
 * and stops before any Stripe read. An ordinary owned lease passes through the
 * committed projector without taking a second database claim.
 */
export async function processClaimedTopUpProjection(
  claim: TopUpProjectorClaim,
  dependencies: TopUpProjectionClaimDependencies,
): Promise<ProjectTopUpEventResult> {
  if (claim.status === 'failed_terminal') {
    return Object.freeze({
      status: 'failed_terminal',
      billingEventId: claim.billingEventId,
      errorCode: 'projection_retry_attempt_limit',
    });
  }
  if (claim.status !== 'claimed' || !claim.claimToken) {
    throw new Error('Top-up worker requires an owned claim.');
  }

  return projectPlatformTopUpEvent(claim.billingEventId, {
    store: new PreclaimedTopUpProjectionStore(claim, dependencies.projectionStore),
    resolver: dependencies.resolver,
    now: dependencies.now,
  });
}

export type TopUpProjectionWorkerItemResult =
  | ProjectTopUpEventResult
  | Readonly<{
    status: 'worker_error';
    billingEventId: string;
    errorCode: 'projection_worker_execution_error';
  }>;

export type TopUpProjectionWorkerBatchResult = Readonly<{
  status: 'completed' | 'claim_failed';
  requestedBatchSize: number;
  selectedCount: number;
  claimedCount: number;
  results: readonly TopUpProjectionWorkerItemResult[];
  errorCode: 'projection_worker_claim_error' | null;
}>;

export type TopUpProjectionWorkerDependencies = Readonly<{
  queue: TopUpProjectionWorkerQueue;
  process(claim: TopUpProjectorClaim): Promise<ProjectTopUpEventResult>;
}>;

function defaultDependencies(): TopUpProjectionWorkerDependencies {
  const admin = createAdminClient();
  const queue = new SupabaseTopUpProjectionWorkerQueue(admin);
  const projectionStore = new SupabaseTopUpProjectionStore(admin);
  const resolver = createTopUpProjectionResolver();
  return Object.freeze({
    queue,
    process: (claim: TopUpProjectorClaim) => processClaimedTopUpProjection(claim, {
      projectionStore,
      resolver,
      now: () => new Date(),
    }),
  });
}

/** Run at most `batchSize` selector outcomes, strictly one at a time. */
export async function runTopUpProjectionBatch(
  batchSize: number,
  injectedDependencies?: TopUpProjectionWorkerDependencies,
): Promise<TopUpProjectionWorkerBatchResult> {
  const requestedBatchSize = normalizedBatchSize(batchSize);
  const dependencies = injectedDependencies ?? defaultDependencies();
  const results: TopUpProjectionWorkerItemResult[] = [];
  let selectedCount = 0;
  let claimedCount = 0;

  for (let index = 0; index < requestedBatchSize; index += 1) {
    let claim: TopUpProjectorClaim | null;
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

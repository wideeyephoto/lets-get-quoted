import 'server-only';

import type Stripe from 'stripe';

import { createAdminClient } from '@/lib/auth';
import {
  TOP_UPS,
  TOP_UPS_WITHHELD,
  type TopUpDefinition,
  type TopUpId,
} from '@/lib/billing/catalog';
import { PLATFORM_TOP_UP_EVENT_TYPES, type PlatformTopUpEventType } from '@/lib/billing/stripe-event-inbox';
import { fulfillmentFromMetadata } from '@/lib/billing/top-up-purchase';
import { getStripeClient } from '@/lib/stripe';

/**
 * Dark projector for platform top-up purchases: a received event becomes a
 * usage_credit_lots row.
 *
 * Nothing under src/app imports this module, and nothing will until
 * LGQ_TOP_UP_PURCHASE_ENABLED is set. Migration 20260818140000 let a paid top-up
 * land with nowhere to go; 20260818160000 supplies the shape this writes.
 *
 * WHY STRIPE IS READ AGAIN. The inbox stores a PII-minimized envelope whose
 * data_object is {id, object} and nothing more, so the SKU metadata that says
 * what was bought is simply not in the database. The Session has to be fetched
 * back. That is also the safer order: the metadata we trust is the metadata
 * Stripe still holds, not a copy we made at checkout time.
 *
 * WHAT IS NEVER TAKEN FROM STRIPE. The quantity. Metadata proves WHICH SKU was
 * bought; the catalog says how much that SKU grants. fulfillmentFromMetadata
 * already enforces that split and is reused here rather than reimplemented.
 *
 * WHY A PAID SESSION CAN STILL GRANT NOTHING. Two sellable outcomes are not
 * credit lots. storage_100gb is fulfillment 'recurring_capacity' --- capacity, not
 * a consumable balance --- and office_user and crew_user are withheld in the
 * catalog. Both are money taken for something this projector must not grant, so
 * both get a named terminal result rather than a silent success or a stuck
 * queue. Someone has to answer for those rows; they are findable by workspace
 * because the projector binds the workspace even when it grants nothing.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHECKOUT_SESSION_ID_PATTERN = /^cs_[A-Za-z0-9_]+$/;
const STRIPE_SECRET_KEY_MODE_PATTERN = /^(?:sk|rk)_(test|live)_/;

export const PLATFORM_TOP_UP_PROJECTION_SCHEMA = 'stripe_platform_top_up_projection_v1' as const;

/** The lot a bought top-up lands in, and the wallet it is separate from. */
export const TOP_UP_LOT_SOURCE_TYPE = 'purchase' as const;

export type TopUpProjectorClaimStatus =
  | 'claimed'
  | 'in_progress'
  | 'processed'
  | 'ignored'
  | 'failed_terminal';

export type TopUpProjectorClaim = Readonly<{
  status: TopUpProjectorClaimStatus;
  billingEventId: string;
  claimToken: string | null;
  attemptCount: number;
  providerEventId: string;
  eventType: PlatformTopUpEventType;
  checkoutSessionId: string;
  workspaceId: string | null;
  livemode: boolean;
  providerCreatedAt: string;
}>;

/**
 * What the projector decided, before the database is told.
 *
 * `grant` is the only outcome that carries fulfillment fields, and the only one
 * that ends in a credit lot.
 */
export type TopUpOutcome =
  | 'grant'
  | 'awaiting_async_payment'
  | 'payment_failed'
  | 'checkout_expired'
  | 'not_a_purchase'
  | 'fulfillment_withheld'
  | 'capacity_fulfillment_deferred';

export type TopUpProjection = Readonly<{
  outcome: TopUpOutcome;
  checkout_session_id: string;
  account_id: string | null;
  resource_code?: string;
  units?: number;
  catalog_version?: string;
  top_up_id?: TopUpId;
  idempotency_key?: string;
}>;

export type TopUpProjectionResult = Readonly<{
  projectionStatus: 'processed' | 'ignored';
  projectionResult: string;
  creditLotId: string | null;
  applied: boolean;
}>;

export interface TopUpProjectionStore {
  claim(billingEventId: string): Promise<TopUpProjectorClaim>;
  project(input: {
    billingEventId: string;
    claimToken: string;
    projection: TopUpProjection;
  }): Promise<TopUpProjectionResult>;
  fail(input: {
    billingEventId: string;
    claimToken: string;
    errorCode: string;
    retryable: boolean;
    nextAttemptAt: string | null;
  }): Promise<void>;
}

export interface TopUpProjectionResolver {
  loadSession(claim: TopUpProjectorClaim): Promise<Stripe.Checkout.Session>;
}

type RpcError = Readonly<{ message?: string; code?: string }>;

function rpcFailure(label: string, error: RpcError | null): Error {
  const detail = error?.message?.trim() || error?.code?.trim() || 'unknown database error';
  return new Error(`${label}: ${detail}`);
}

function rowRecord(value: unknown, label: string): Record<string, unknown> {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error(`${label} returned no row.`);
  }
  return row as Record<string, unknown>;
}

function requiredString(value: unknown, label: string, pattern?: RegExp): string {
  if (typeof value !== 'string' || value.length === 0 || (pattern && !pattern.test(value))) {
    throw new Error(`Top-up projection RPC returned an invalid ${label}.`);
  }
  return value;
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Top-up projection RPC returned an invalid ${label}.`);
  return value;
}

function requiredInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`Top-up projection RPC returned an invalid ${label}.`);
  }
  return value;
}

function parseClaim(value: unknown): TopUpProjectorClaim {
  const row = rowRecord(value, 'Top-up claim RPC');
  const status = requiredString(row.claim_status, 'claim status');
  if (!['claimed', 'in_progress', 'processed', 'ignored', 'failed_terminal'].includes(status)) {
    throw new Error('Top-up projection RPC returned an invalid claim status.');
  }
  const eventType = requiredString(row.event_type, 'event type');
  if (!(PLATFORM_TOP_UP_EVENT_TYPES as readonly string[]).includes(eventType)) {
    throw new Error('Top-up projection RPC returned an unsupported event type.');
  }
  const workspaceId = row.workspace_id == null
    ? null
    : requiredString(row.workspace_id, 'workspace ID', UUID_PATTERN);
  const claimToken = row.claim_token == null
    ? null
    : requiredString(row.claim_token, 'claim token', UUID_PATTERN);

  return Object.freeze({
    status: status as TopUpProjectorClaimStatus,
    billingEventId: requiredString(row.billing_event_id, 'billing event ID', UUID_PATTERN),
    claimToken,
    attemptCount: requiredInteger(row.attempt_count, 'attempt count'),
    providerEventId: requiredString(row.provider_event_id, 'provider event ID'),
    eventType: eventType as PlatformTopUpEventType,
    checkoutSessionId: requiredString(row.checkout_session_id, 'Checkout Session ID', CHECKOUT_SESSION_ID_PATTERN),
    workspaceId,
    livemode: requiredBoolean(row.livemode, 'livemode'),
    providerCreatedAt: requiredString(row.provider_created_at, 'provider creation time'),
  });
}

function parseProjectResult(value: unknown): TopUpProjectionResult {
  const row = rowRecord(value, 'Top-up projection RPC');
  const status = requiredString(row.projection_status, 'projection status');
  if (status !== 'processed' && status !== 'ignored') {
    throw new Error('Top-up projection RPC returned an invalid projection status.');
  }
  return Object.freeze({
    projectionStatus: status,
    projectionResult: requiredString(row.projection_result, 'projection result'),
    creditLotId: row.credit_lot_id == null
      ? null
      : requiredString(row.credit_lot_id, 'credit lot ID', UUID_PATTERN),
    applied: requiredBoolean(row.applied, 'applied flag'),
  });
}

/** Service-role implementation. Direct writes to billing_events are revoked. */
export class SupabaseTopUpProjectionStore implements TopUpProjectionStore {
  constructor(private readonly admin = createAdminClient()) {}

  async claim(billingEventId: string): Promise<TopUpProjectorClaim> {
    const { data, error } = await this.admin.rpc('claim_stripe_platform_top_up_event', {
      p_billing_event_id: billingEventId,
    });
    if (error) throw rpcFailure('Unable to claim the top-up event', error);
    return parseClaim(data);
  }

  async project(input: {
    billingEventId: string;
    claimToken: string;
    projection: TopUpProjection;
  }): Promise<TopUpProjectionResult> {
    const { data, error } = await this.admin.rpc('project_stripe_platform_top_up_event', {
      p_billing_event_id: input.billingEventId,
      p_claim_token: input.claimToken,
      p_projection: input.projection,
    });
    if (error) throw rpcFailure('Unable to project the top-up event', error);
    return parseProjectResult(data);
  }

  async fail(input: {
    billingEventId: string;
    claimToken: string;
    errorCode: string;
    retryable: boolean;
    nextAttemptAt: string | null;
  }): Promise<void> {
    const { error } = await this.admin.rpc('fail_stripe_platform_top_up_event', {
      p_billing_event_id: input.billingEventId,
      p_claim_token: input.claimToken,
      p_error_code: input.errorCode,
      p_retryable: input.retryable,
      p_next_attempt_at: input.nextAttemptAt,
    });
    if (error) throw rpcFailure('Unable to release the top-up event', error);
  }
}

export class TopUpProjectionProviderError extends Error {
  override readonly name = 'TopUpProjectionProviderError';

  constructor(readonly code: string, readonly retryable: boolean) {
    super(code);
  }
}

function assertConfiguredStripeMode(livemode: boolean): void {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? '';
  const match = STRIPE_SECRET_KEY_MODE_PATTERN.exec(key);
  if (!match || (match[1] === 'live') !== livemode) {
    throw new TopUpProjectionProviderError('provider_mode_mismatch', false);
  }
}

/**
 * A top-up Session lives on the PLATFORM account, so it is retrieved with no
 * stripeAccount header. Passing one would look in a contractor's account for a
 * Session that was never there.
 */
export function createTopUpProjectionResolver(
  injected?: Partial<{
    assertMode(livemode: boolean): void;
    retrieveCheckoutSession(id: string): Promise<Stripe.Checkout.Session>;
  }>,
): TopUpProjectionResolver {
  const assertMode = injected?.assertMode ?? assertConfiguredStripeMode;
  const retrieve = injected?.retrieveCheckoutSession
    ?? ((id: string) => getStripeClient().checkout.sessions.retrieve(id));

  return Object.freeze({
    async loadSession(claim: TopUpProjectorClaim): Promise<Stripe.Checkout.Session> {
      assertMode(claim.livemode);
      let session: Stripe.Checkout.Session;
      try {
        session = await retrieve(claim.checkoutSessionId);
      } catch {
        throw new TopUpProjectionProviderError('provider_object_retrieve_failed', true);
      }
      if (session?.id !== claim.checkoutSessionId || session.livemode !== claim.livemode) {
        throw new TopUpProjectionProviderError('provider_object_contract_mismatch', false);
      }
      return session;
    },
  });
}

function sellableUsageCreditSku(topUpId: string | undefined): {
  sku: TopUpDefinition | null;
  blocked: TopUpOutcome | null;
} {
  const sku = topUpId ? (TOP_UPS as Record<string, TopUpDefinition | undefined>)[topUpId] : undefined;
  if (!sku) return { sku: null, blocked: 'not_a_purchase' };
  if (sku.id in TOP_UPS_WITHHELD) return { sku, blocked: 'fulfillment_withheld' };
  if (sku.fulfillment !== 'usage_credit') return { sku, blocked: 'capacity_fulfillment_deferred' };
  return { sku, blocked: null };
}

/**
 * Decide what one event about one Session means. Pure, so the decision can be
 * tested without a Stripe account or a database.
 *
 * The paid check is `payment_status`, not the event name. A delayed rail sends
 * `checkout.session.completed` while the money is still moving, and granting on
 * the event name alone would hand out credit for a payment that can still fail.
 */
export function decideTopUpProjection(
  claim: Pick<TopUpProjectorClaim, 'eventType' | 'checkoutSessionId' | 'billingEventId'>,
  session: Stripe.Checkout.Session,
): TopUpProjection {
  const sessionId = claim.checkoutSessionId;
  const metadata = (session.metadata ?? {}) as Record<string, string | undefined>;
  const fulfillment = fulfillmentFromMetadata(
    metadata,
    `top_up:${sessionId}`,
    claim.billingEventId,
  );

  const accountId = fulfillment && UUID_PATTERN.test(fulfillment.accountId)
    ? fulfillment.accountId
    : null;

  // Not ours, or unreadable. Say so terminally rather than guessing a workspace.
  if (!fulfillment) {
    return Object.freeze({ outcome: 'not_a_purchase', checkout_session_id: sessionId, account_id: null });
  }

  if (claim.eventType === 'checkout.session.expired') {
    return Object.freeze({ outcome: 'checkout_expired', checkout_session_id: sessionId, account_id: accountId });
  }
  if (claim.eventType === 'checkout.session.async_payment_failed') {
    return Object.freeze({ outcome: 'payment_failed', checkout_session_id: sessionId, account_id: accountId });
  }
  if (claim.eventType === 'checkout.session.completed' && session.payment_status === 'unpaid') {
    return Object.freeze({
      outcome: 'awaiting_async_payment',
      checkout_session_id: sessionId,
      account_id: accountId,
    });
  }

  const { blocked } = sellableUsageCreditSku(metadata.lgq_top_up_id);
  if (blocked) {
    return Object.freeze({ outcome: blocked, checkout_session_id: sessionId, account_id: accountId });
  }
  if (!accountId) {
    return Object.freeze({ outcome: 'not_a_purchase', checkout_session_id: sessionId, account_id: null });
  }

  return Object.freeze({
    outcome: 'grant',
    checkout_session_id: sessionId,
    account_id: accountId,
    resource_code: fulfillment.resourceCode,
    units: fulfillment.units,
    catalog_version: fulfillment.catalogVersion,
    top_up_id: metadata.lgq_top_up_id as TopUpId,
    idempotency_key: fulfillment.idempotencyKey,
  });
}

export type ProjectTopUpEventResult =
  | Readonly<{
    status: 'in_progress' | 'replay_processed' | 'replay_ignored' | 'failed_terminal';
    billingEventId: string;
  }>
  | (TopUpProjectionResult & Readonly<{ status: 'projected'; billingEventId: string }>)
  | Readonly<{
    status: 'failed_retryable' | 'failed_terminal';
    billingEventId: string;
    errorCode: string;
  }>;

export type TopUpProjectorDependencies = Readonly<{
  store: TopUpProjectionStore;
  resolver: TopUpProjectionResolver;
  now(): Date;
}>;

function defaultDependencies(): TopUpProjectorDependencies {
  return Object.freeze({
    store: new SupabaseTopUpProjectionStore(),
    resolver: createTopUpProjectionResolver(),
    now: () => new Date(),
  });
}

function retryAt(now: Date, attemptCount: number): string {
  const exponent = Math.max(0, Math.min(attemptCount - 1, 6));
  const delayMinutes = Math.min(24 * 60, 2 ** exponent * 5);
  return new Date(now.getTime() + delayMinutes * 60_000).toISOString();
}

function fixedFailure(error: unknown): { code: string; retryable: boolean } {
  if (error instanceof TopUpProjectionProviderError) {
    return { code: error.code, retryable: error.retryable };
  }
  return { code: 'projection_internal_error', retryable: true };
}

/**
 * Claim one top-up event, decide what it means, and record the decision.
 *
 * A claim that is not ours ends the call: terminal replays and live leases are
 * reported, never re-projected. Anything that throws after the claim releases it
 * with a backoff, so a Stripe outage costs a retry rather than a lost purchase.
 */
export async function projectPlatformTopUpEvent(
  billingEventId: string,
  injected?: TopUpProjectorDependencies,
): Promise<ProjectTopUpEventResult> {
  const dependencies = injected ?? defaultDependencies();
  const claim = await dependencies.store.claim(billingEventId);

  if (claim.status === 'processed') {
    return { status: 'replay_processed', billingEventId: claim.billingEventId };
  }
  if (claim.status === 'ignored') {
    return { status: 'replay_ignored', billingEventId: claim.billingEventId };
  }
  if (claim.status === 'in_progress') {
    return { status: 'in_progress', billingEventId: claim.billingEventId };
  }
  if (claim.status === 'failed_terminal') {
    return { status: 'failed_terminal', billingEventId: claim.billingEventId };
  }

  const claimToken = claim.claimToken;
  if (!claimToken) {
    throw new Error('Top-up claim RPC returned a claim without a token.');
  }

  try {
    const session = await dependencies.resolver.loadSession(claim);
    const projection = decideTopUpProjection(claim, session);
    const result = await dependencies.store.project({
      billingEventId: claim.billingEventId,
      claimToken,
      projection,
    });
    return { status: 'projected', billingEventId: claim.billingEventId, ...result };
  } catch (error) {
    const { code, retryable } = fixedFailure(error);
    await dependencies.store.fail({
      billingEventId: claim.billingEventId,
      claimToken,
      errorCode: code,
      retryable,
      nextAttemptAt: retryable ? retryAt(dependencies.now(), claim.attemptCount) : null,
    });
    return {
      status: retryable ? 'failed_retryable' : 'failed_terminal',
      billingEventId: claim.billingEventId,
      errorCode: code,
    };
  }
}

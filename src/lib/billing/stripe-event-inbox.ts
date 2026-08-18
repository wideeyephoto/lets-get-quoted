import 'server-only';

import type Stripe from 'stripe';

import { createAdminClient } from '@/lib/auth';
import { getStripeClient } from '@/lib/stripe';

/**
 * Dark-launched receipt boundary for the future Stripe Billing and direct-rail
 * webhook endpoints. Nothing in src/app imports this module.
 *
 * The caller must declare which independently configured Stripe endpoint it is
 * serving. A Connect payment event can therefore never drift into the platform
 * subscription inbox (or vice versa) merely because its type happens to match.
 */

export const CONNECTED_PAYMENT_EVENT_TYPES = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'payment_intent.processing',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled',
  'charge.succeeded',
  'charge.failed',
  'charge.refunded',
  'charge.refund.updated',
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
  'charge.dispute.funds_reinstated',
  'charge.dispute.funds_withdrawn',
  'refund.created',
  'refund.updated',
  'refund.failed',
] as const satisfies readonly Stripe.Event.Type[];

/**
 * A top-up is bought with a one-off Checkout Session on the PLATFORM account.
 *
 * These types overlap with the connected-payment list, which is why the scope
 * has to be declared by the route rather than inferred from the type: the same
 * checkout.session.completed means a contractor was paid under one scope and a
 * workspace bought credits under the other, and they bind to different columns.
 *
 * Receipt only for now. The database permits this scope to be recorded and
 * refuses any projected shape for it, so an event cannot be half-processed while
 * the projector is still being written.
 */
export const PLATFORM_TOP_UP_EVENT_TYPES = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
] as const satisfies readonly Stripe.Event.Type[];

export const PLATFORM_SUBSCRIPTION_EVENT_TYPES = [
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
] as const satisfies readonly Stripe.Event.Type[];

export type ConnectedPaymentEventType = typeof CONNECTED_PAYMENT_EVENT_TYPES[number];
export type PlatformTopUpEventType = typeof PLATFORM_TOP_UP_EVENT_TYPES[number];
export type PlatformSubscriptionEventType = typeof PLATFORM_SUBSCRIPTION_EVENT_TYPES[number];
export type StripeInboxEventType = ConnectedPaymentEventType | PlatformSubscriptionEventType;
export type StripeBillingEventScope = 'connected_payment' | 'platform_subscription' | 'platform_top_up';

const CONNECTED_PAYMENT_TYPES = new Set<string>(CONNECTED_PAYMENT_EVENT_TYPES);
const PLATFORM_SUBSCRIPTION_TYPES = new Set<string>(PLATFORM_SUBSCRIPTION_EVENT_TYPES);
const PLATFORM_TOP_UP_TYPES = new Set<string>(PLATFORM_TOP_UP_EVENT_TYPES);
const EVENT_ID_PATTERN = /^evt_[A-Za-z0-9_]{8,}$/;
const ACCOUNT_ID_PATTERN = /^acct_[A-Za-z0-9]{8,}$/;
const EVENT_TYPE_PATTERN = /^[a-z0-9_]+(?:\.[a-z0-9_]+)+$/;
const PROVIDER_OBJECT_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_.]{2,254}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENVELOPE_SCHEMA = 'lgq.stripe-event-inbox.v1' as const;
const MAX_RAW_BODY_BYTES = 512 * 1024;

export type StripeEventEnvelope = Readonly<{
  schema: typeof ENVELOPE_SCHEMA;
  scope: StripeBillingEventScope;
  event: Readonly<{
    id: string;
    type: StripeInboxEventType;
    account: string | null;
    livemode: boolean;
    api_version: string | null;
    created: number;
  }>;
  data_object: Readonly<{
    id: string;
    object: string;
  }>;
}>;

export type StripeEventInboxReceipt = Readonly<{
  providerEventId: string;
  eventType: StripeInboxEventType;
  scope: StripeBillingEventScope;
  providerAccountId: string | null;
  livemode: boolean;
  apiVersion: string | null;
  providerCreatedAt: string;
  payload: StripeEventEnvelope;
}>;

export type StripeEventInboxStoreResult = Readonly<{
  billingEventId: string;
  inserted: boolean;
  workspaceId: string | null;
}>;

export interface StripeEventInboxStore {
  insert(receipt: StripeEventInboxReceipt): Promise<StripeEventInboxStoreResult>;
}

type RpcError = Readonly<{ message?: string; code?: string }>;

function rpcFailure(error: RpcError | null): Error {
  const detail = error?.message?.trim() || error?.code?.trim() || 'unknown database error';
  return new Error(`Unable to persist Stripe event inbox receipt: ${detail}`);
}

function requireRpcRow(value: unknown): Record<string, unknown> {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error('Stripe event inbox RPC returned no receipt row.');
  }
  return row as Record<string, unknown>;
}

function requireUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new Error(`Stripe event inbox RPC returned an invalid ${label}.`);
  }
  return value;
}

/** Service-role implementation. Direct INSERT is revoked by the inbox migration. */
export class SupabaseStripeEventInboxStore implements StripeEventInboxStore {
  constructor(private readonly admin = createAdminClient()) {}

  async insert(receipt: StripeEventInboxReceipt): Promise<StripeEventInboxStoreResult> {
    const { data, error } = await this.admin.rpc('ingest_stripe_event_inbox', {
      p_provider_event_id: receipt.providerEventId,
      p_event_type: receipt.eventType,
      p_event_scope: receipt.scope,
      p_provider_account_id: receipt.providerAccountId,
      p_livemode: receipt.livemode,
      p_api_version: receipt.apiVersion,
      p_provider_created_at: receipt.providerCreatedAt,
      p_payload: receipt.payload,
    });
    if (error) throw rpcFailure(error);

    const row = requireRpcRow(data);
    if (typeof row.inserted !== 'boolean') {
      throw new Error('Stripe event inbox RPC returned an invalid insert result.');
    }
    const workspaceId = row.workspace_id == null
      ? null
      : requireUuid(row.workspace_id, 'workspace ID');

    return Object.freeze({
      billingEventId: requireUuid(row.billing_event_id, 'billing event ID'),
      inserted: row.inserted,
      workspaceId,
    });
  }
}

export type StripeEventInboxDependencies = Readonly<{
  store: StripeEventInboxStore;
  constructEvent(rawBody: string, signature: string, webhookSecret: string): Stripe.Event;
}>;

export type StripeEventInboxDelivery = Readonly<{
  rawBody: string;
  signature: string;
  webhookSecret: string;
  /** Must match the Stripe event destination that supplied webhookSecret. */
  expectedScope: StripeBillingEventScope;
}>;

export type StripeEventInboxResult = StripeEventInboxStoreResult & Readonly<{
  providerEventId: string;
  eventType: StripeInboxEventType;
  scope: StripeBillingEventScope;
}>;

export class StripeEventInboxVerificationError extends Error {
  override readonly name = 'StripeEventInboxVerificationError';

  constructor() {
    super('Stripe webhook signature verification failed.');
  }
}

export class StripeEventInboxValidationError extends Error {
  override readonly name = 'StripeEventInboxValidationError';
}

function invalid(message: string): never {
  throw new StripeEventInboxValidationError(message);
}

function requireBoundedString(
  value: unknown,
  label: string,
  maxLength: number,
  pattern?: RegExp,
): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    return invalid(`${label} is invalid.`);
  }
  if (pattern && !pattern.test(value)) return invalid(`${label} is invalid.`);
  return value;
}

function requireProviderAccount(value: unknown): string | null {
  if (value == null) return null;
  return requireBoundedString(value, 'Stripe event.account', 255, ACCOUNT_ID_PATTERN);
}

function paymentObjectType(eventType: string): string {
  if (eventType.startsWith('checkout.session.')) return 'checkout.session';
  if (eventType.startsWith('payment_intent.')) return 'payment_intent';
  if (eventType.startsWith('charge.dispute.')) return 'dispute';
  if (eventType === 'charge.refund.updated' || eventType.startsWith('refund.')) return 'refund';
  return 'charge';
}

function scopeAndObjectType(eventType: string, expectedScope: StripeBillingEventScope): {
  scope: StripeBillingEventScope;
  eventType: StripeInboxEventType;
  objectType: string;
} {
  if (expectedScope === 'connected_payment') {
    if (!CONNECTED_PAYMENT_TYPES.has(eventType)) {
      return invalid(`Unsupported Stripe payment event type for scope ${expectedScope}: ${eventType}.`);
    }
    return {
      scope: expectedScope,
      eventType: eventType as ConnectedPaymentEventType,
      objectType: paymentObjectType(eventType),
    };
  }
  if (expectedScope === 'platform_subscription' && PLATFORM_SUBSCRIPTION_TYPES.has(eventType)) {
    return {
      scope: 'platform_subscription',
      eventType: eventType as PlatformSubscriptionEventType,
      objectType: eventType.startsWith('customer.subscription.') ? 'subscription' : 'invoice',
    };
  }
  if (expectedScope === 'platform_top_up') {
    if (!PLATFORM_TOP_UP_TYPES.has(eventType)) {
      return invalid(`Unsupported Stripe top-up event type: ${eventType}.`);
    }
    return {
      scope: 'platform_top_up',
      eventType: eventType as PlatformTopUpEventType,
      objectType: 'checkout.session',
    };
  }
  return invalid(`Unsupported Stripe event type: ${eventType}.`);
}

function requireEventDataObject(event: Stripe.Event, expectedObjectType: string): { id: string; object: string } {
  const candidate = event.data?.object as unknown;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return invalid('Stripe event data.object is invalid.');
  }
  const record = candidate as Record<string, unknown>;
  const id = requireBoundedString(record.id, 'Stripe event data.object.id', 255, PROVIDER_OBJECT_ID_PATTERN);
  const object = requireBoundedString(record.object, 'Stripe event data.object.object', 64);
  if (object !== expectedObjectType) {
    return invalid(`Stripe event type does not match data.object type ${object}.`);
  }
  return { id, object };
}

function validateAndBuildReceipt(
  event: Stripe.Event,
  expectedScope: StripeBillingEventScope,
): StripeEventInboxReceipt {
  if (event.object !== 'event') invalid('Stripe webhook payload is not a snapshot Event.');

  const providerEventId = requireBoundedString(event.id, 'Stripe event ID', 255, EVENT_ID_PATTERN);
  const rawEventType = requireBoundedString(event.type, 'Stripe event type', 128, EVENT_TYPE_PATTERN);
  const classification = scopeAndObjectType(rawEventType, expectedScope);

  if (typeof event.livemode !== 'boolean') invalid('Stripe event livemode must be explicit.');
  const providerAccountId = requireProviderAccount(event.account);
  if (classification.scope === 'connected_payment' && !providerAccountId) {
    invalid('Connected-account payment events require event.account.');
  }
  if (classification.scope === 'platform_subscription' && providerAccountId) {
    invalid('Platform subscription events must not contain event.account.');
  }
  const apiVersion = event.api_version === null
    ? null
    : requireBoundedString(event.api_version, 'Stripe event API version', 64);
  if (!Number.isSafeInteger(event.created) || event.created <= 946_684_800) {
    invalid('Stripe event creation time is invalid.');
  }
  const providerCreatedAt = new Date(event.created * 1000).toISOString();
  const dataObject = requireEventDataObject(event, classification.objectType);

  // This is intentionally not the raw webhook body. No customer, email,
  // metadata, address, payment method, or client-secret field crosses this
  // boundary while the product has no event-specific retention/PII policy.
  const payload: StripeEventEnvelope = Object.freeze({
    schema: ENVELOPE_SCHEMA,
    scope: classification.scope,
    event: Object.freeze({
      id: providerEventId,
      type: classification.eventType,
      account: providerAccountId,
      livemode: event.livemode,
      api_version: apiVersion,
      created: event.created,
    }),
    data_object: Object.freeze({ ...dataObject }),
  });
  return Object.freeze({
    providerEventId,
    eventType: classification.eventType,
    scope: classification.scope,
    providerAccountId,
    livemode: event.livemode,
    apiVersion,
    providerCreatedAt,
    payload,
  });
}

function validateDelivery(delivery: StripeEventInboxDelivery): void {
  if (
    delivery.expectedScope !== 'connected_payment'
    && delivery.expectedScope !== 'platform_subscription'
  ) {
    invalid('Stripe event endpoint scope is invalid.');
  }
  if (typeof delivery.rawBody !== 'string') invalid('Stripe webhook raw body is invalid.');
  const rawBodyBytes = Buffer.byteLength(delivery.rawBody, 'utf8');
  if (rawBodyBytes === 0 || rawBodyBytes > MAX_RAW_BODY_BYTES) {
    invalid('Stripe webhook raw body size is invalid.');
  }
  requireBoundedString(delivery.signature, 'Stripe-Signature header', 4096);
  requireBoundedString(delivery.webhookSecret, 'Stripe webhook endpoint secret', 512, /^whsec_\S+$/);
}

function defaultDependencies(): StripeEventInboxDependencies {
  const stripe = getStripeClient();
  return {
    store: new SupabaseStripeEventInboxStore(),
    constructEvent: (rawBody, signature, webhookSecret) => (
      stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
    ),
  };
}

/**
 * Verifies the raw Stripe signature, validates/classifies the Event, redacts it,
 * then asks Postgres to bind and insert/replay it atomically.
 */
export async function ingestStripeEventInboxDelivery(
  delivery: StripeEventInboxDelivery,
  injectedDependencies?: StripeEventInboxDependencies,
): Promise<StripeEventInboxResult> {
  validateDelivery(delivery);
  const dependencies = injectedDependencies ?? defaultDependencies();

  let event: Stripe.Event;
  try {
    event = dependencies.constructEvent(
      delivery.rawBody,
      delivery.signature,
      delivery.webhookSecret,
    );
  } catch {
    // stripe-node's signature error retains the full raw webhook body on its
    // `payload` property. Do not attach it as a cause or public field: callers
    // and error reporters must only see this fixed, PII-free failure.
    throw new StripeEventInboxVerificationError();
  }

  const receipt = validateAndBuildReceipt(event, delivery.expectedScope);
  const stored = await dependencies.store.insert(receipt);
  if (receipt.scope === 'connected_payment' && !stored.workspaceId) {
    throw new Error('Stripe event inbox RPC did not return the bound workspace.');
  }

  return Object.freeze({
    ...stored,
    providerEventId: receipt.providerEventId,
    eventType: receipt.eventType,
    scope: receipt.scope,
  });
}

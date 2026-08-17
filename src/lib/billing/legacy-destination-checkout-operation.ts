import 'server-only';

import { createHash } from 'node:crypto';
import type Stripe from 'stripe';

import { createAdminClient } from '@/lib/auth';

/**
 * Dark generation ledger for the legacy destination-charge Checkout path.
 *
 * Postgres owns claim identity, lineage, and presentation authority. Provider
 * calls intentionally happen only after an RPC has returned, so no Stripe
 * request is ever made while a database lock is held.
 */

export const LEGACY_DESTINATION_CHECKOUT_GENERATION_FLAG =
  'LGQ_LEGACY_DESTINATION_CHECKOUT_GENERATION_ENABLED' as const;

export function legacyDestinationCheckoutGenerationEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env[LEGACY_DESTINATION_CHECKOUT_GENERATION_FLAG] === '1';
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHECKOUT_SESSION_ID_PATTERN = /^cs_(?:test|live)_[A-Za-z0-9_]{4,}$/;
const EVENT_ID_PATTERN = /^evt_[A-Za-z0-9_]{8,}$/;
const PAYMENT_INTENT_ID_PATTERN = /^pi_[A-Za-z0-9_]{8,}$/;
const CHARGE_ID_PATTERN = /^ch_[A-Za-z0-9_]{8,}$/;
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;
const DESTINATION_ACCOUNT_ID_PATTERN = /^acct_[A-Za-z0-9]{8,}$/;
const CUSTOMER_ID_PATTERN = /^cus_[A-Za-z0-9]{8,}$/;
const MAX_SESSION_AGE_SECONDS = 25 * 60 * 60;
const METADATA_KEY_PATTERN = /^[^\[\]]{1,40}$/;
const PROVIDER_EVENT_TYPES = new Set<LegacyDestinationCheckoutSignedEventIdentity['eventType']>([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'charge.succeeded',
  'charge.failed',
]);

export const LEGACY_DESTINATION_CHECKOUT_CURRENCY = 'usd' as const;
export const LEGACY_DESTINATION_CHECKOUT_MODE = 'payment' as const;
export const LEGACY_DESTINATION_CHECKOUT_METADATA_KEYS = Object.freeze({
  paymentId: 'payment_id',
  operationPk: 'lgq_ldc_operation_pk',
  operationId: 'lgq_ldc_operation_id',
  generation: 'lgq_ldc_generation',
  predecessorOperationPk: 'lgq_ldc_predecessor_pk',
  requestFingerprint: 'lgq_ldc_request_fingerprint',
  grossAmountCents: 'lgq_ldc_gross_cents',
  applicationFeeCents: 'lgq_ldc_application_fee_cents',
  feeRate: 'lgq_ldc_fee_rate',
  destinationAccountId: 'lgq_ldc_destination_account',
  livemode: 'lgq_ldc_livemode',
  expectedCustomerId: 'lgq_ldc_expected_customer',
  currency: 'lgq_ldc_currency',
  mode: 'lgq_ldc_mode',
  paymentMethodTypes: 'lgq_ldc_payment_methods',
  variant: 'lgq_ldc_variant',
} as const);
const RESERVED_METADATA_KEYS = new Set<string>(
  Object.values(LEGACY_DESTINATION_CHECKOUT_METADATA_KEYS),
);
const RESERVED_METADATA_PREFIX = 'lgq_ldc_';
const PRIMARY_ACH_PAYMENT_METHOD_TYPES = Object.freeze([
  'card',
  'us_bank_account',
] as const);
const CARD_PAYMENT_METHOD_TYPES = Object.freeze(['card'] as const);
const CLAIM_STATUSES = new Set<LegacyDestinationCheckoutClaimStatus>([
  'claimed',
  'in_progress',
  'replay_unpresented',
  'replay_presented',
  'submitted',
  'indeterminate',
  'quarantined',
  'complete_unpaid',
  'paid_hold',
]);
const EVENT_DISPOSITIONS = new Set<LegacyDestinationCheckoutEventDisposition>([
  'current',
  'historical_failure',
  'historical_paid_hold',
  'replay',
  'unknown',
]);

export type LegacyDestinationCheckoutClaimInput = Readonly<{
  paymentId: string;
  livemode: boolean;
  requestFingerprint: string;
  grossAmountCents: number;
  applicationFeeCents: number;
  feeRate: number;
}>;

export type LegacyDestinationCheckoutClaimStatus =
  | 'claimed'
  | 'in_progress'
  | 'replay_unpresented'
  | 'replay_presented'
  | 'submitted'
  | 'indeterminate'
  | 'quarantined'
  | 'complete_unpaid'
  | 'paid_hold';

export type LegacyDestinationCheckoutClaim = Readonly<{
  status: LegacyDestinationCheckoutClaimStatus;
  operationPk: string | null;
  claimToken: string | null;
  operationState: string | null;
  generation: number | null;
  predecessorOperationPk: string | null;
  operationId: string | null;
  achIdempotencyKey: string | null;
  cardFallbackIdempotencyKey: string | null;
  requestFingerprint: string | null;
  destinationAccountId: string | null;
  livemode: boolean | null;
  grossAmountCents: number | null;
  applicationFeeCents: number | null;
  feeRate: number | null;
  checkoutSessionId: string | null;
  checkoutSessionStatus: NonNullable<Stripe.Checkout.Session['status']> | null;
  checkoutPaymentStatus: Stripe.Checkout.Session['payment_status'] | null;
  checkoutSessionExpiresAt: string | null;
  presentedAt: string | null;
  paidHoldActive: boolean;
}>;

export type LegacyDestinationCheckoutQuarantineReason =
  | 'paid_hold'
  | 'complete_unpaid_hold'
  | 'invalid_provider_session'
  | 'lost_completion_race'
  | 'presentation_withheld'
  | 'provider_retrieval_ambiguous'
  | 'provider_method_unavailable'
  | 'persistence_ambiguous';

export type LegacyDestinationCheckoutEventDisposition =
  | 'current'
  | 'historical_failure'
  | 'historical_paid_hold'
  | 'replay'
  | 'unknown';

/** The caller supplies only identity extracted after Stripe signature verification. */
export type LegacyDestinationCheckoutSignedEventIdentity = Readonly<{
  providerEventId: string;
  eventType:
    | 'checkout.session.completed'
    | 'checkout.session.async_payment_succeeded'
    | 'checkout.session.async_payment_failed'
    | 'checkout.session.expired'
    | 'payment_intent.succeeded'
    | 'payment_intent.payment_failed'
    | 'charge.succeeded'
    | 'charge.failed';
  eventObjectId: string;
  paymentId: string;
  checkoutSessionId: string | null;
  paymentIntentId: string | null;
  livemode: boolean;
  outcome: 'success' | 'failure' | 'nonterminal';
  sessionStatus: NonNullable<Stripe.Checkout.Session['status']> | null;
  paymentStatus: Stripe.Checkout.Session['payment_status'] | null;
  observedAt: string;
}>;

export type LegacyDestinationCheckoutEventClassification = Readonly<{
  disposition: LegacyDestinationCheckoutEventDisposition;
  eventStatus: 'recorded' | 'replay' | null;
  classification:
    | 'current_success'
    | 'current_failure'
    | 'current_nonterminal_noop'
    | 'historical_failure_noop'
    | 'historical_paid_hold'
    | null;
  operationPk: string | null;
  generation: number | null;
  isCurrent: boolean;
  projectionAllowed: boolean;
  paidHoldActive: boolean;
}>;

export interface LegacyDestinationCheckoutOperationStore {
  claim(input: LegacyDestinationCheckoutClaimInput): Promise<LegacyDestinationCheckoutClaim>;
  begin(input: {
    operationPk: string;
    claimToken: string;
  }): Promise<boolean>;
  complete(input: {
    operationPk: string;
    claimToken: string;
    checkoutSessionId: string;
    providerStatus: NonNullable<Stripe.Checkout.Session['status']>;
    providerPaymentStatus: Stripe.Checkout.Session['payment_status'];
    expiresAt: number;
  }): Promise<boolean>;
  confirmPresentation(input: {
    operationPk: string;
    checkoutSessionId: string;
  }): Promise<boolean>;
  markIndeterminate(input: {
    operationPk: string;
    claimToken: string;
    lastError: string;
  }): Promise<void>;
  quarantine(input: {
    operationPk: string;
    claimToken: string;
    checkoutSessionId: string | null;
    providerStatus: NonNullable<Stripe.Checkout.Session['status']> | null;
    providerPaymentStatus: Stripe.Checkout.Session['payment_status'] | null;
    expiresAt: number | null;
    reason: LegacyDestinationCheckoutQuarantineReason;
  }): Promise<void>;
  classifyEvent(
    input: LegacyDestinationCheckoutSignedEventIdentity,
  ): Promise<LegacyDestinationCheckoutEventClassification>;
}

type RpcError = Readonly<{ message?: string; code?: string }>;
type RpcClient = Pick<ReturnType<typeof createAdminClient>, 'rpc'>;

function fixedDatabaseFailure(label: string, _error: RpcError | null): Error {
  // Do not reflect Postgres details. They can include stored provider metadata.
  return new Error(`${label} failed.`);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error(`${label} returned no row.`);
  }
  return row as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is invalid.`);
  return value;
}

function optionalString(value: unknown, label: string): string | null {
  return value == null ? null : requireString(value, label);
}

function requireUuid(value: unknown, label: string): string {
  const parsed = requireString(value, label);
  if (!UUID_PATTERN.test(parsed)) throw new Error(`${label} is invalid.`);
  return parsed.toLowerCase();
}

function optionalUuid(value: unknown, label: string): string | null {
  return value == null ? null : requireUuid(value, label);
}

function requireGeneration(value: unknown): number {
  const generation = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^[1-9][0-9]*$/.test(value)
      ? Number(value)
      : Number.NaN;
  if (!Number.isSafeInteger(generation) || generation < 1 || generation > 100) {
    throw new Error('Legacy destination Checkout generation is invalid.');
  }
  return generation;
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^(?:0|[1-9][0-9]*)$/.test(value)
      ? Number(value)
      : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${label} is invalid.`);
  return parsed;
}

function requireFeeRate(value: unknown, label: string): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() !== String(value)) {
    throw new Error(`${label} is invalid.`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) throw new Error(`${label} is invalid.`);
  return parsed;
}

function optionalTimestamp(value: unknown, label: string): string | null {
  if (value == null) return null;
  const timestamp = requireString(value, label);
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error(`${label} is invalid.`);
  return timestamp;
}

function optionalProviderStatus(
  value: unknown,
): NonNullable<Stripe.Checkout.Session['status']> | null {
  if (value == null) return null;
  if (value !== 'open' && value !== 'complete' && value !== 'expired') {
    throw new Error('Legacy destination Checkout stored Session status is invalid.');
  }
  return value;
}

function optionalPaymentStatus(value: unknown): Stripe.Checkout.Session['payment_status'] | null {
  if (value == null) return null;
  if (value !== 'paid' && value !== 'unpaid' && value !== 'no_payment_required') {
    throw new Error('Legacy destination Checkout stored payment status is invalid.');
  }
  return value;
}

function requireIdempotencyKey(value: unknown, label: string): string {
  const key = requireString(value, label);
  if (key.length > 255 || /\p{Cc}/u.test(key)) throw new Error(`${label} is invalid.`);
  return key;
}

function requireCheckoutSessionId(value: unknown, livemode?: boolean): string {
  const sessionId = requireString(value, 'Legacy destination Checkout Session ID');
  if (!CHECKOUT_SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error('Legacy destination Checkout Session ID is invalid.');
  }
  if (livemode !== undefined && !sessionId.startsWith(livemode ? 'cs_live_' : 'cs_test_')) {
    throw new Error('Legacy destination Checkout Session mode is invalid.');
  }
  return sessionId;
}

function optionalCheckoutSessionId(value: unknown): string | null {
  return value == null ? null : requireCheckoutSessionId(value);
}

function parseClaim(value: unknown): LegacyDestinationCheckoutClaim {
  const row = requireRecord(value, 'Legacy destination Checkout claim');
  const status = requireString(row.claim_status, 'Legacy destination Checkout claim status');
  if (!CLAIM_STATUSES.has(status as LegacyDestinationCheckoutClaimStatus)) {
    throw new Error('Legacy destination Checkout claim status is invalid.');
  }
  const claimToken = optionalUuid(row.claim_token, 'Legacy destination Checkout claim token');
  const achIdempotencyKey = row.ach_stripe_idempotency_key == null
    ? null
    : requireIdempotencyKey(row.ach_stripe_idempotency_key, 'Legacy destination ACH idempotency key');
  const cardFallbackIdempotencyKey = row.card_stripe_idempotency_key == null
    ? null
    : requireIdempotencyKey(row.card_stripe_idempotency_key, 'Legacy destination card idempotency key');
  const checkoutSessionId = optionalCheckoutSessionId(row.checkout_session_id);
  const checkoutSessionStatus = optionalProviderStatus(row.checkout_session_status);
  const checkoutPaymentStatus = optionalPaymentStatus(row.checkout_payment_status);
  const checkoutSessionExpiresAt = optionalTimestamp(
    row.checkout_session_expires_at,
    'Legacy destination Checkout stored Session expiry',
  );
  const destinationAccountId = optionalString(
    row.destination_account_id,
    'Legacy destination Checkout destination account',
  );
  if (destinationAccountId && !DESTINATION_ACCOUNT_ID_PATTERN.test(destinationAccountId)) {
    throw new Error('Legacy destination Checkout destination account is invalid.');
  }
  const operationPk = optionalUuid(row.operation_pk, 'Legacy destination Checkout operation primary key');
  const operationState = optionalString(row.operation_state, 'Legacy destination Checkout operation state');
  const generation = row.checkout_generation == null ? null : requireGeneration(row.checkout_generation);
  const operationId = optionalString(row.operation_id, 'Legacy destination Checkout operation ID');
  const requestFingerprint = optionalString(
    row.request_fingerprint,
    'Legacy destination Checkout request fingerprint',
  );
  if (requestFingerprint && !FINGERPRINT_PATTERN.test(requestFingerprint)) {
    throw new Error('Legacy destination Checkout request fingerprint is invalid.');
  }
  const livemode = row.livemode == null ? null : row.livemode;
  const grossAmountCents = row.gross_amount_cents == null
    ? null
    : requireNonNegativeInteger(row.gross_amount_cents, 'Legacy destination Checkout gross amount');
  const applicationFeeCents = row.application_fee_cents == null
    ? null
    : requireNonNegativeInteger(
      row.application_fee_cents,
      'Legacy destination Checkout application fee',
    );
  const feeRate = row.fee_rate == null
    ? null
    : requireFeeRate(row.fee_rate, 'Legacy destination Checkout fee rate');
  if (
    grossAmountCents !== null
    && (
      grossAmountCents <= 0
      || applicationFeeCents === null
      || feeRate === null
      || applicationFeeCents > grossAmountCents
      || Math.round(grossAmountCents * feeRate) !== applicationFeeCents
    )
  ) throw new Error('Legacy destination Checkout amount snapshot is invalid.');
  if (typeof row.paid_hold_active !== 'boolean' || (livemode !== null && typeof livemode !== 'boolean')) {
    throw new Error('Legacy destination Checkout claim mode or hold is invalid.');
  }
  if (
    status !== 'paid_hold'
    && (
      !operationPk
      || !operationState
      || !generation
      || !operationId
      || !achIdempotencyKey
      || !cardFallbackIdempotencyKey
      || achIdempotencyKey === cardFallbackIdempotencyKey
      || !requestFingerprint
      || !destinationAccountId
      || livemode === null
      || grossAmountCents === null
      || applicationFeeCents === null
      || feeRate === null
    )
  ) throw new Error('Legacy destination Checkout operation identity is incomplete.');
  if (status === 'claimed' && !claimToken) {
    throw new Error('Legacy destination Checkout owner identity is incomplete.');
  }
  if (
    (status === 'replay_unpresented' || status === 'replay_presented')
    && (!checkoutSessionId || !checkoutSessionStatus || !checkoutPaymentStatus || !checkoutSessionExpiresAt)
  ) throw new Error('Legacy destination Checkout replay identity is incomplete.');
  return Object.freeze({
    status: status as LegacyDestinationCheckoutClaimStatus,
    operationPk,
    claimToken,
    operationState,
    generation,
    predecessorOperationPk: optionalUuid(
      row.predecessor_operation_pk,
      'Legacy destination Checkout predecessor operation primary key',
    ),
    operationId,
    achIdempotencyKey,
    cardFallbackIdempotencyKey,
    requestFingerprint,
    destinationAccountId,
    livemode: livemode as boolean | null,
    grossAmountCents,
    applicationFeeCents,
    feeRate,
    checkoutSessionId,
    checkoutSessionStatus,
    checkoutPaymentStatus,
    checkoutSessionExpiresAt,
    presentedAt: optionalTimestamp(row.presented_at, 'Legacy destination Checkout presentation time'),
    paidHoldActive: row.paid_hold_active,
  });
}

function parseEventClassification(value: unknown): LegacyDestinationCheckoutEventClassification {
  if (value == null || (Array.isArray(value) && value.length === 0)) {
    return Object.freeze({
      disposition: 'unknown',
      eventStatus: null,
      classification: null,
      operationPk: null,
      generation: null,
      isCurrent: false,
      projectionAllowed: false,
      paidHoldActive: false,
    });
  }
  const row = requireRecord(value, 'Legacy destination Checkout event classification');
  const eventStatus = requireString(row.event_status, 'Legacy destination Checkout event status');
  if (eventStatus !== 'recorded' && eventStatus !== 'replay') {
    throw new Error('Legacy destination Checkout event status is invalid.');
  }
  const classification = requireString(
    row.classification,
    'Legacy destination Checkout event classification',
  ) as LegacyDestinationCheckoutEventClassification['classification'];
  if (!classification || ![
    'current_success',
    'current_failure',
    'current_nonterminal_noop',
    'historical_failure_noop',
    'historical_paid_hold',
  ].includes(classification)) {
    throw new Error('Legacy destination Checkout event classification is invalid.');
  }
  if (
    typeof row.is_current !== 'boolean'
    || typeof row.projection_allowed !== 'boolean'
    || typeof row.paid_hold_active !== 'boolean'
  ) {
    throw new Error('Legacy destination Checkout event decision is invalid.');
  }
  const operationPk = requireUuid(
    row.operation_pk,
    'Legacy destination Checkout event operation primary key',
  );
  const disposition: LegacyDestinationCheckoutEventDisposition = eventStatus === 'replay'
    ? 'replay'
    : classification === 'historical_failure_noop'
      ? 'historical_failure'
      : classification === 'historical_paid_hold'
        ? 'historical_paid_hold'
        : 'current';
  if (!EVENT_DISPOSITIONS.has(disposition)) throw new Error('Legacy destination event disposition is invalid.');
  return Object.freeze({
    disposition,
    eventStatus,
    classification,
    operationPk,
    generation: requireGeneration(row.checkout_generation),
    isCurrent: row.is_current,
    projectionAllowed: row.projection_allowed,
    paidHoldActive: row.paid_hold_active,
  });
}

/** Service-role adapter. The migration revokes direct table access. */
export class SupabaseLegacyDestinationCheckoutOperationStore
implements LegacyDestinationCheckoutOperationStore {
  constructor(private readonly admin: RpcClient = createAdminClient()) {}

  async claim(input: LegacyDestinationCheckoutClaimInput): Promise<LegacyDestinationCheckoutClaim> {
    const { data, error } = await this.admin.rpc('claim_legacy_destination_checkout_operation', {
      p_payment_id: input.paymentId,
      p_livemode: input.livemode,
      p_request_fingerprint: input.requestFingerprint,
      p_gross_amount_cents: input.grossAmountCents,
      p_application_fee_cents: input.applicationFeeCents,
      p_fee_rate: input.feeRate,
    });
    if (error) throw fixedDatabaseFailure('Legacy destination Checkout claim', error);
    return parseClaim(data);
  }

  async begin(input: {
    operationPk: string;
    claimToken: string;
  }): Promise<boolean> {
    const { data, error } = await this.admin.rpc('begin_legacy_destination_checkout_submission', {
      p_operation_pk: input.operationPk,
      p_claim_token: input.claimToken,
    });
    if (error) throw fixedDatabaseFailure('Legacy destination Checkout begin', error);
    if (typeof data !== 'boolean') throw new Error('Legacy destination Checkout begin result is invalid.');
    return data;
  }

  async complete(input: {
    operationPk: string;
    claimToken: string;
    checkoutSessionId: string;
    providerStatus: NonNullable<Stripe.Checkout.Session['status']>;
    providerPaymentStatus: Stripe.Checkout.Session['payment_status'];
    expiresAt: number;
  }): Promise<boolean> {
    const { data, error } = await this.admin.rpc('complete_legacy_destination_checkout_operation', {
      p_operation_pk: input.operationPk,
      p_claim_token: input.claimToken,
      p_checkout_session_id: input.checkoutSessionId,
      p_checkout_session_status: input.providerStatus,
      p_checkout_payment_status: input.providerPaymentStatus,
      p_checkout_session_expires_at: new Date(input.expiresAt * 1_000).toISOString(),
    });
    if (error) throw fixedDatabaseFailure('Legacy destination Checkout completion', error);
    if (typeof data !== 'boolean') {
      throw new Error('Legacy destination Checkout completion result is invalid.');
    }
    return data;
  }

  async confirmPresentation(input: {
    operationPk: string;
    checkoutSessionId: string;
  }): Promise<boolean> {
    const { data, error } = await this.admin.rpc(
      'confirm_legacy_destination_checkout_presentation',
      {
        p_operation_pk: input.operationPk,
        p_checkout_session_id: input.checkoutSessionId,
      },
    );
    if (error) throw fixedDatabaseFailure('Legacy destination Checkout presentation', error);
    if (typeof data !== 'boolean') {
      throw new Error('Legacy destination Checkout presentation result is invalid.');
    }
    return data;
  }

  async markIndeterminate(input: {
    operationPk: string;
    claimToken: string;
    lastError: string;
  }): Promise<void> {
    const { data, error } = await this.admin.rpc('mark_legacy_destination_checkout_indeterminate', {
      p_operation_pk: input.operationPk,
      p_claim_token: input.claimToken,
      p_last_error: input.lastError,
    });
    if (error || data !== true) {
      throw fixedDatabaseFailure('Legacy destination Checkout indeterminate transition', error);
    }
  }

  async quarantine(input: {
    operationPk: string;
    claimToken: string;
    checkoutSessionId: string | null;
    providerStatus: NonNullable<Stripe.Checkout.Session['status']> | null;
    providerPaymentStatus: Stripe.Checkout.Session['payment_status'] | null;
    expiresAt: number | null;
    reason: LegacyDestinationCheckoutQuarantineReason;
  }): Promise<void> {
    const { data, error } = await this.admin.rpc('quarantine_legacy_destination_checkout_operation', {
      p_operation_pk: input.operationPk,
      p_claim_token: input.claimToken,
      p_checkout_session_id: input.checkoutSessionId,
      p_checkout_session_status: input.providerStatus,
      p_checkout_payment_status: input.providerPaymentStatus,
      p_checkout_session_expires_at: input.expiresAt === null
        ? null
        : new Date(input.expiresAt * 1_000).toISOString(),
      p_reason: input.reason,
    });
    if (error || data !== true) {
      throw fixedDatabaseFailure('Legacy destination Checkout quarantine', error);
    }
  }

  async classifyEvent(
    input: LegacyDestinationCheckoutSignedEventIdentity,
  ): Promise<LegacyDestinationCheckoutEventClassification> {
    const { data, error } = await this.admin.rpc('classify_legacy_destination_checkout_event', {
      p_provider_event_id: input.providerEventId,
      p_event_type: input.eventType,
      p_event_object_id: input.eventObjectId,
      p_payment_id: input.paymentId,
      p_checkout_session_id: input.checkoutSessionId,
      p_payment_intent_id: input.paymentIntentId,
      p_livemode: input.livemode,
      p_outcome: input.outcome,
      p_checkout_session_status: input.sessionStatus,
      p_checkout_payment_status: input.paymentStatus,
      p_observed_at: input.observedAt,
    });
    if (error) throw fixedDatabaseFailure('Legacy destination Checkout event classification', error);
    return parseEventClassification(data);
  }
}

export type LegacyDestinationCheckoutCreateVariant = 'primary' | 'card_fallback';

export type LegacyDestinationCheckoutPaymentMethodType = 'card' | 'us_bank_account';

export type LegacyDestinationCheckoutProviderContract = Readonly<{
  variant: LegacyDestinationCheckoutCreateVariant;
  paymentId: string;
  operationPk: string;
  operationId: string;
  generation: number;
  predecessorOperationPk: string | null;
  requestFingerprint: string;
  grossAmountCents: number;
  applicationFeeCents: number;
  feeRate: number;
  destinationAccountId: string;
  livemode: boolean;
  expectedCustomerId: string | null;
  currency: typeof LEGACY_DESTINATION_CHECKOUT_CURRENCY;
  mode: typeof LEGACY_DESTINATION_CHECKOUT_MODE;
  paymentMethodTypes: readonly LegacyDestinationCheckoutPaymentMethodType[];
  metadata: Readonly<Record<string, string>>;
}>;

export type LegacyDestinationCheckoutProviderCreateResult =
  | Readonly<{ outcome: 'created'; session: Stripe.Checkout.Session }>
  | Readonly<{ outcome: 'definitive_payment_method_rejection' }>;

export interface LegacyDestinationCheckoutProvider {
  retrieveSession(input: {
    checkoutSessionId: string;
    allowedContracts: readonly LegacyDestinationCheckoutProviderContract[];
  }): Promise<Stripe.Checkout.Session>;
  createSession(input: LegacyDestinationCheckoutProviderContract & {
    idempotencyKey: string;
  }): Promise<LegacyDestinationCheckoutProviderCreateResult>;
  expireSession(input: {
    checkoutSessionId: string;
    operationPk: string;
    operationId: string;
  }): Promise<void>;
}

export type LegacyDestinationCheckoutOperationDependencies = Readonly<{
  store: LegacyDestinationCheckoutOperationStore;
  provider: LegacyDestinationCheckoutProvider;
  env?: Readonly<Record<string, string | undefined>>;
  nowEpochSeconds(): number;
}>;

export type LegacyDestinationCheckoutOperationInput = Readonly<{
  paymentId: string;
  livemode: boolean;
  requestFingerprint: string;
  grossAmountCents: number;
  applicationFeeCents: number;
  feeRate: number;
  allowCardFallback: boolean;
  expectedCustomerId: string | null;
  metadata?: Readonly<Record<string, string>>;
}>;

export type LegacyDestinationCheckoutOperationResult = Readonly<{
  outcome: 'created' | 'replayed';
  operationPk: string;
  generation: number;
  checkoutSessionId: string;
  checkoutUrl: string;
}>;

export class LegacyDestinationCheckoutDisabledError extends Error {
  override readonly name = 'LegacyDestinationCheckoutDisabledError';
  constructor() {
    super('Checkout is temporarily unavailable.');
  }
}

export class LegacyDestinationCheckoutUnavailableError extends Error {
  override readonly name = 'LegacyDestinationCheckoutUnavailableError';
  constructor() {
    super('Checkout is temporarily unavailable.');
  }
}

export class LegacyDestinationCheckoutReconciliationError extends Error {
  override readonly name = 'LegacyDestinationCheckoutReconciliationError';
  constructor() {
    super('This payment needs reconciliation before Checkout can continue.');
  }
}

export class LegacyDestinationCheckoutIndeterminateError extends Error {
  override readonly name = 'LegacyDestinationCheckoutIndeterminateError';
  constructor() {
    super('Checkout availability is unknown. Please try again later.');
  }
}

export type LegacyDestinationCheckoutRequestFingerprintInput = Readonly<Omit<
  LegacyDestinationCheckoutOperationInput,
  'requestFingerprint'
>>;

type ValidatedLegacyDestinationCheckoutOperation = Readonly<Omit<
  LegacyDestinationCheckoutOperationInput,
  'metadata'
> & {
  metadata: Readonly<Record<string, string>>;
}>;

function validateCallerMetadata(
  value: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> {
  if (value === undefined) return Object.freeze({});
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new LegacyDestinationCheckoutUnavailableError();
  }
  const entries = Object.entries(value);
  if (entries.length > 50 - RESERVED_METADATA_KEYS.size) {
    throw new LegacyDestinationCheckoutUnavailableError();
  }
  for (const [key, metadataValue] of entries) {
    if (
      !METADATA_KEY_PATTERN.test(key)
      || key.trim() !== key
      || /\p{Cc}/u.test(key)
      || RESERVED_METADATA_KEYS.has(key)
      || key.startsWith(RESERVED_METADATA_PREFIX)
      || typeof metadataValue !== 'string'
      || metadataValue.length < 1
      || metadataValue.length > 500
      || /\p{Cc}/u.test(metadataValue)
    ) throw new LegacyDestinationCheckoutUnavailableError();
  }
  return Object.freeze(Object.fromEntries(
    entries.sort(([left], [right]) => left.localeCompare(right)),
  ));
}

function validateProviderPolicy(
  input: LegacyDestinationCheckoutRequestFingerprintInput,
): Omit<ValidatedLegacyDestinationCheckoutOperation, 'requestFingerprint'> {
  if (!UUID_PATTERN.test(input.paymentId)) {
    throw new LegacyDestinationCheckoutUnavailableError();
  }
  if (typeof input.livemode !== 'boolean' || typeof input.allowCardFallback !== 'boolean') {
    throw new LegacyDestinationCheckoutUnavailableError();
  }
  if (
    input.expectedCustomerId !== null
    && (typeof input.expectedCustomerId !== 'string'
      || !CUSTOMER_ID_PATTERN.test(input.expectedCustomerId))
  ) throw new LegacyDestinationCheckoutUnavailableError();
  if (
    !Number.isSafeInteger(input.grossAmountCents)
    || input.grossAmountCents <= 0
    || !Number.isSafeInteger(input.applicationFeeCents)
    || input.applicationFeeCents < 0
    || input.applicationFeeCents > input.grossAmountCents
    || !Number.isFinite(input.feeRate)
    || input.feeRate < 0
    || input.feeRate > 1
    || Math.round(input.grossAmountCents * input.feeRate) !== input.applicationFeeCents
  ) throw new LegacyDestinationCheckoutUnavailableError();
  return Object.freeze({
    paymentId: input.paymentId.toLowerCase(),
    livemode: input.livemode,
    grossAmountCents: input.grossAmountCents,
    applicationFeeCents: input.applicationFeeCents,
    feeRate: input.feeRate,
    allowCardFallback: input.allowCardFallback,
    expectedCustomerId: input.expectedCustomerId,
    metadata: validateCallerMetadata(input.metadata),
  });
}

export function buildLegacyDestinationCheckoutRequestFingerprint(
  input: LegacyDestinationCheckoutRequestFingerprintInput,
): string {
  const policy = validateProviderPolicy(input);
  const primaryPaymentMethodTypes = policy.allowCardFallback
    ? PRIMARY_ACH_PAYMENT_METHOD_TYPES
    : CARD_PAYMENT_METHOD_TYPES;
  const canonical = JSON.stringify({
    schema: 'legacy_destination_checkout_request_v1',
    payment_id: policy.paymentId,
    livemode: policy.livemode,
    gross_amount_cents: policy.grossAmountCents,
    application_fee_cents: policy.applicationFeeCents,
    fee_rate: String(policy.feeRate),
    expected_customer_id: policy.expectedCustomerId,
    allow_card_fallback: policy.allowCardFallback,
    currency: LEGACY_DESTINATION_CHECKOUT_CURRENCY,
    mode: LEGACY_DESTINATION_CHECKOUT_MODE,
    primary_payment_method_types: primaryPaymentMethodTypes,
    card_fallback_payment_method_types: policy.allowCardFallback
      ? CARD_PAYMENT_METHOD_TYPES
      : null,
    metadata: Object.entries(policy.metadata),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function validateOperationInput(
  input: LegacyDestinationCheckoutOperationInput,
): ValidatedLegacyDestinationCheckoutOperation {
  const policy = validateProviderPolicy(input);
  if (
    !FINGERPRINT_PATTERN.test(input.requestFingerprint)
    || input.requestFingerprint !== buildLegacyDestinationCheckoutRequestFingerprint(policy)
  ) throw new LegacyDestinationCheckoutUnavailableError();
  return Object.freeze({
    ...policy,
    requestFingerprint: input.requestFingerprint,
  });
}

type ProviderSessionLifecycle = Readonly<{
  sessionId: string;
  status: NonNullable<Stripe.Checkout.Session['status']>;
  paymentStatus: Stripe.Checkout.Session['payment_status'];
  expiresAt: number;
  checkoutUrl: string | null;
}>;

function canonicalOperationId(paymentId: string, generation: number): string {
  return `payment:${paymentId}:legacy-destination-checkout:${generation}`;
}

function canonicalIdempotencyKey(
  paymentId: string,
  generation: number,
  variant: 'ach' | 'card',
): string {
  return `lgq:legacy-destination:v1:checkout:${paymentId}:${generation}:${variant}`;
}

function assertClaimMatchesOperation(
  claim: LegacyDestinationCheckoutClaim,
  operation: ValidatedLegacyDestinationCheckoutOperation,
): void {
  if (
    claim.operationPk === null
    || claim.generation === null
    || claim.operationId !== canonicalOperationId(operation.paymentId, claim.generation)
    || claim.achIdempotencyKey !== canonicalIdempotencyKey(
      operation.paymentId,
      claim.generation,
      'ach',
    )
    || claim.cardFallbackIdempotencyKey !== canonicalIdempotencyKey(
      operation.paymentId,
      claim.generation,
      'card',
    )
    || claim.achIdempotencyKey === claim.cardFallbackIdempotencyKey
    || (claim.generation === 1
      ? claim.predecessorOperationPk !== null
      : claim.predecessorOperationPk === null)
    || claim.requestFingerprint !== operation.requestFingerprint
    || claim.livemode !== operation.livemode
    || claim.grossAmountCents !== operation.grossAmountCents
    || claim.applicationFeeCents !== operation.applicationFeeCents
    || claim.feeRate !== operation.feeRate
    || claim.destinationAccountId === null
    || !DESTINATION_ACCOUNT_ID_PATTERN.test(claim.destinationAccountId)
    || claim.paidHoldActive
  ) throw new LegacyDestinationCheckoutUnavailableError();

  const expectedState: Partial<Record<LegacyDestinationCheckoutClaimStatus, string>> = {
    claimed: 'claimed',
    in_progress: 'claimed',
    replay_unpresented: 'completed',
    replay_presented: 'completed',
    submitted: 'submitted',
    indeterminate: 'indeterminate',
    quarantined: 'quarantined',
    complete_unpaid: 'completed',
  };
  if (claim.operationState !== expectedState[claim.status]) {
    throw new LegacyDestinationCheckoutUnavailableError();
  }
  if (
    claim.checkoutSessionId !== null
    && !claim.checkoutSessionId.startsWith(operation.livemode ? 'cs_live_' : 'cs_test_')
  ) throw new LegacyDestinationCheckoutUnavailableError();
  if (
    claim.status === 'replay_unpresented'
    && claim.presentedAt !== null
  ) throw new LegacyDestinationCheckoutUnavailableError();
  if (
    claim.status === 'replay_presented'
    && claim.presentedAt === null
  ) throw new LegacyDestinationCheckoutUnavailableError();
}

function paymentMethodTypesForVariant(
  operation: ValidatedLegacyDestinationCheckoutOperation,
  variant: LegacyDestinationCheckoutCreateVariant,
): readonly LegacyDestinationCheckoutPaymentMethodType[] {
  if (variant === 'card_fallback') return CARD_PAYMENT_METHOD_TYPES;
  return operation.allowCardFallback
    ? PRIMARY_ACH_PAYMENT_METHOD_TYPES
    : CARD_PAYMENT_METHOD_TYPES;
}

function buildProviderContract(input: {
  claim: LegacyDestinationCheckoutClaim;
  operation: ValidatedLegacyDestinationCheckoutOperation;
  variant: LegacyDestinationCheckoutCreateVariant;
}): LegacyDestinationCheckoutProviderContract {
  const { claim, operation, variant } = input;
  if (
    !claim.operationPk
    || claim.generation === null
    || !claim.operationId
    || !claim.requestFingerprint
    || !claim.destinationAccountId
    || claim.grossAmountCents === null
    || claim.applicationFeeCents === null
    || claim.feeRate === null
  ) throw new LegacyDestinationCheckoutUnavailableError();
  if (variant === 'card_fallback' && !operation.allowCardFallback) {
    throw new LegacyDestinationCheckoutUnavailableError();
  }
  const paymentMethodTypes = paymentMethodTypesForVariant(operation, variant);
  const metadata = Object.freeze({
    ...operation.metadata,
    [LEGACY_DESTINATION_CHECKOUT_METADATA_KEYS.paymentId]: operation.paymentId,
    [LEGACY_DESTINATION_CHECKOUT_METADATA_KEYS.operationPk]: claim.operationPk,
    [LEGACY_DESTINATION_CHECKOUT_METADATA_KEYS.operationId]: claim.operationId,
    [LEGACY_DESTINATION_CHECKOUT_METADATA_KEYS.generation]: String(claim.generation),
    [LEGACY_DESTINATION_CHECKOUT_METADATA_KEYS.predecessorOperationPk]:
      claim.predecessorOperationPk ?? 'none',
    [LEGACY_DESTINATION_CHECKOUT_METADATA_KEYS.requestFingerprint]: claim.requestFingerprint,
    [LEGACY_DESTINATION_CHECKOUT_METADATA_KEYS.grossAmountCents]:
      String(claim.grossAmountCents),
    [LEGACY_DESTINATION_CHECKOUT_METADATA_KEYS.applicationFeeCents]:
      String(claim.applicationFeeCents),
    [LEGACY_DESTINATION_CHECKOUT_METADATA_KEYS.feeRate]: String(claim.feeRate),
    [LEGACY_DESTINATION_CHECKOUT_METADATA_KEYS.destinationAccountId]:
      claim.destinationAccountId,
    [LEGACY_DESTINATION_CHECKOUT_METADATA_KEYS.livemode]: String(claim.livemode),
    [LEGACY_DESTINATION_CHECKOUT_METADATA_KEYS.expectedCustomerId]:
      operation.expectedCustomerId ?? 'none',
    [LEGACY_DESTINATION_CHECKOUT_METADATA_KEYS.currency]:
      LEGACY_DESTINATION_CHECKOUT_CURRENCY,
    [LEGACY_DESTINATION_CHECKOUT_METADATA_KEYS.mode]: LEGACY_DESTINATION_CHECKOUT_MODE,
    [LEGACY_DESTINATION_CHECKOUT_METADATA_KEYS.paymentMethodTypes]:
      paymentMethodTypes.join(','),
    [LEGACY_DESTINATION_CHECKOUT_METADATA_KEYS.variant]: variant,
  });
  return Object.freeze({
    variant,
    paymentId: operation.paymentId,
    operationPk: claim.operationPk,
    operationId: claim.operationId,
    generation: claim.generation,
    predecessorOperationPk: claim.predecessorOperationPk,
    requestFingerprint: claim.requestFingerprint,
    grossAmountCents: claim.grossAmountCents,
    applicationFeeCents: claim.applicationFeeCents,
    feeRate: claim.feeRate,
    destinationAccountId: claim.destinationAccountId,
    livemode: claim.livemode!,
    expectedCustomerId: operation.expectedCustomerId,
    currency: LEGACY_DESTINATION_CHECKOUT_CURRENCY,
    mode: LEGACY_DESTINATION_CHECKOUT_MODE,
    paymentMethodTypes,
    metadata,
  });
}

function allowedProviderContracts(input: {
  claim: LegacyDestinationCheckoutClaim;
  operation: ValidatedLegacyDestinationCheckoutOperation;
}): readonly LegacyDestinationCheckoutProviderContract[] {
  return Object.freeze([
    buildProviderContract({ ...input, variant: 'primary' }),
    ...(input.operation.allowCardFallback
      ? [buildProviderContract({ ...input, variant: 'card_fallback' })]
      : []),
  ]);
}

function metadataExactlyMatches(
  actual: Stripe.Metadata | null,
  expected: Readonly<Record<string, string>>,
): boolean {
  if (!actual) return false;
  const actualEntries = Object.entries(actual).sort(([left], [right]) => left.localeCompare(right));
  const expectedEntries = Object.entries(expected)
    .sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify(actualEntries) === JSON.stringify(expectedEntries);
}

function providerCustomerId(value: Stripe.Checkout.Session['customer']): string | null | undefined {
  if (value === null) return null;
  if (typeof value === 'string') return CUSTOMER_ID_PATTERN.test(value) ? value : undefined;
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string') {
    return CUSTOMER_ID_PATTERN.test(value.id) ? value.id : undefined;
  }
  return undefined;
}

function paymentMethodTypesExactlyMatch(
  actual: Stripe.Checkout.Session['payment_method_types'],
  expected: readonly LegacyDestinationCheckoutPaymentMethodType[],
): boolean {
  return Array.isArray(actual)
    && actual.length === expected.length
    && expected.every((method, index) => actual[index] === method);
}

function trustedCheckoutUrl(value: string | null): string | null {
  if (!value) return null;
  if (
    value.trim() !== value
    || value.length > 4_096
    || /\p{Cc}/u.test(value)
  ) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.origin !== 'https://checkout.stripe.com'
    || parsed.username
    || parsed.password
    || parsed.pathname === '/'
  ) return null;
  return parsed.toString();
}

function inspectProviderSession(
  session: Stripe.Checkout.Session,
  allowedContracts: readonly LegacyDestinationCheckoutProviderContract[],
  nowEpochSeconds: number,
  expectedSessionId?: string,
  expectedExpiresAt?: number,
): ProviderSessionLifecycle {
  if (!Number.isSafeInteger(nowEpochSeconds) || nowEpochSeconds <= 0) {
    throw new LegacyDestinationCheckoutUnavailableError();
  }
  if (allowedContracts.length < 1) throw new LegacyDestinationCheckoutUnavailableError();
  const livemode = allowedContracts[0].livemode;
  const sessionId = requireCheckoutSessionId(session?.id, livemode);
  const matchingContract = allowedContracts.find((contract) => (
    contract.livemode === livemode
    && session.client_reference_id === contract.paymentId
    && session.currency === contract.currency
    && session.amount_subtotal === contract.grossAmountCents
    && session.amount_total === contract.grossAmountCents
    && providerCustomerId(session.customer) === contract.expectedCustomerId
    && paymentMethodTypesExactlyMatch(session.payment_method_types, contract.paymentMethodTypes)
    && metadataExactlyMatches(session.metadata, contract.metadata)
  ));
  if (
    session.object !== 'checkout.session'
    || (expectedSessionId !== undefined && sessionId !== expectedSessionId)
    || session.livemode !== livemode
    || session.mode !== LEGACY_DESTINATION_CHECKOUT_MODE
    || !matchingContract
    || session.recovered_from !== null
    || session.after_expiration !== null
    || (session.status !== 'open' && session.status !== 'complete' && session.status !== 'expired')
    || (session.payment_status !== 'paid'
      && session.payment_status !== 'unpaid'
      && session.payment_status !== 'no_payment_required')
    || !Number.isSafeInteger(session.expires_at)
    || session.expires_at <= nowEpochSeconds
    || session.expires_at > nowEpochSeconds + MAX_SESSION_AGE_SECONDS
    || (expectedExpiresAt !== undefined && session.expires_at !== expectedExpiresAt)
  ) {
    throw new LegacyDestinationCheckoutUnavailableError();
  }
  return Object.freeze({
    sessionId,
    status: session.status,
    paymentStatus: session.payment_status,
    expiresAt: session.expires_at,
    checkoutUrl: trustedCheckoutUrl(session.url),
  });
}

async function recordIndeterminate(
  store: LegacyDestinationCheckoutOperationStore,
  operationPk: string,
  claimToken: string,
  lastError: string,
): Promise<never> {
  try {
    await store.markIndeterminate({ operationPk, claimToken, lastError });
  } catch {
    // Preserve the fixed public boundary even when the durability repair also fails.
  }
  throw new LegacyDestinationCheckoutIndeterminateError();
}

function cleanupSessionId(
  session: Stripe.Checkout.Session,
  livemode: boolean,
): string | null {
  if (
    typeof session?.id !== 'string'
    || !CHECKOUT_SESSION_ID_PATTERN.test(session.id)
    || !session.id.startsWith(livemode ? 'cs_live_' : 'cs_test_')
  ) return null;
  return session.id;
}

function cleanupSessionLifecycle(
  session: Stripe.Checkout.Session,
  sessionId: string | null,
): ProviderSessionLifecycle | null {
  if (
    !sessionId
    || (session.status !== 'open' && session.status !== 'complete' && session.status !== 'expired')
    || (session.payment_status !== 'paid'
      && session.payment_status !== 'unpaid'
      && session.payment_status !== 'no_payment_required')
    || !Number.isSafeInteger(session.expires_at)
    || session.expires_at <= 946_684_800
  ) return null;
  return Object.freeze({
    sessionId,
    status: session.status,
    paymentStatus: session.payment_status,
    expiresAt: session.expires_at,
    checkoutUrl: null,
  });
}

async function withholdAndQuarantine(input: {
  store: LegacyDestinationCheckoutOperationStore;
  provider: LegacyDestinationCheckoutProvider;
  operationPk: string;
  claimToken: string;
  contract: LegacyDestinationCheckoutProviderContract;
  checkoutSessionId: string | null;
  lifecycle: ProviderSessionLifecycle | null;
  reason: LegacyDestinationCheckoutQuarantineReason;
}): Promise<void> {
  // Both actions are attempted. A cleanup failure can never make the URL safe
  // to disclose, and neither call holds a database transaction open.
  try {
    await input.store.quarantine({
      operationPk: input.operationPk,
      claimToken: input.claimToken,
      checkoutSessionId: input.lifecycle?.sessionId ?? null,
      providerStatus: input.lifecycle?.status ?? null,
      providerPaymentStatus: input.lifecycle?.paymentStatus ?? null,
      expiresAt: input.lifecycle?.expiresAt ?? null,
      reason: input.reason,
    });
  } catch {
    // Expiry is still worth attempting after a quarantine transport failure.
  }
  if (input.checkoutSessionId) {
    try {
      await input.provider.expireSession({
        checkoutSessionId: input.checkoutSessionId,
        operationPk: input.operationPk,
        operationId: input.contract.operationId,
      });
    } catch {
      // Durable quarantine/hold remains the operator boundary.
    }
  }
}

async function presentExisting(input: {
  claim: LegacyDestinationCheckoutClaim;
  operation: ValidatedLegacyDestinationCheckoutOperation;
  dependencies: LegacyDestinationCheckoutOperationDependencies;
}): Promise<LegacyDestinationCheckoutOperationResult> {
  if (!input.claim.operationPk || input.claim.generation === null || !input.claim.checkoutSessionId) {
    throw new LegacyDestinationCheckoutUnavailableError();
  }
  const sessionId = input.claim.checkoutSessionId!;
  const contracts = allowedProviderContracts({
    claim: input.claim,
    operation: input.operation,
  });
  let session: Stripe.Checkout.Session;
  try {
    session = await input.dependencies.provider.retrieveSession({
      checkoutSessionId: sessionId,
      allowedContracts: contracts,
    });
  } catch {
    throw new LegacyDestinationCheckoutIndeterminateError();
  }

  let lifecycle: ProviderSessionLifecycle;
  const storedExpiresAt = Date.parse(input.claim.checkoutSessionExpiresAt!) / 1_000;
  if (!Number.isSafeInteger(storedExpiresAt) || storedExpiresAt <= 0) {
    throw new LegacyDestinationCheckoutReconciliationError();
  }
  try {
    lifecycle = inspectProviderSession(
      session,
      contracts,
      input.dependencies.nowEpochSeconds(),
      sessionId,
      storedExpiresAt,
    );
  } catch {
    throw new LegacyDestinationCheckoutReconciliationError();
  }

  if (
    input.claim.checkoutSessionStatus !== 'open'
    || input.claim.checkoutPaymentStatus !== 'unpaid'
    || lifecycle.status !== 'open'
    || lifecycle.paymentStatus !== 'unpaid'
    || !lifecycle.checkoutUrl
  ) {
    // Provider reads are not signed replacement authority. In particular,
    // expired+unpaid here remains blocked until a signed expiration event is
    // recorded and a later claim advances the lineage.
    throw new LegacyDestinationCheckoutReconciliationError();
  }

  let presentation: boolean;
  try {
    presentation = await input.dependencies.store.confirmPresentation({
      operationPk: input.claim.operationPk,
      checkoutSessionId: lifecycle.sessionId,
    });
  } catch {
    throw new LegacyDestinationCheckoutIndeterminateError();
  }
  if (!presentation) {
    try {
      await input.dependencies.provider.expireSession({
        checkoutSessionId: lifecycle.sessionId,
        operationPk: input.claim.operationPk,
        operationId: contracts[0].operationId,
      });
    } catch {
      // The URL remains withheld regardless of cleanup outcome.
    }
    throw new LegacyDestinationCheckoutReconciliationError();
  }
  return Object.freeze({
    outcome: 'replayed',
    operationPk: input.claim.operationPk,
    generation: input.claim.generation,
    checkoutSessionId: lifecycle.sessionId,
    checkoutUrl: lifecycle.checkoutUrl,
  });
}

async function quarantineDefinitiveProviderRejection(input: {
  store: LegacyDestinationCheckoutOperationStore;
  operationPk: string;
  claimToken: string;
}): Promise<never> {
  try {
    await input.store.quarantine({
      operationPk: input.operationPk,
      claimToken: input.claimToken,
      checkoutSessionId: null,
      providerStatus: null,
      providerPaymentStatus: null,
      expiresAt: null,
      reason: 'provider_method_unavailable',
    });
  } catch {
    return recordIndeterminate(
      input.store,
      input.operationPk,
      input.claimToken,
      'provider_rejection_persistence_ambiguous',
    );
  }
  throw new LegacyDestinationCheckoutReconciliationError();
}

async function createOwnedSession(input: {
  claim: LegacyDestinationCheckoutClaim;
  operation: ValidatedLegacyDestinationCheckoutOperation;
  dependencies: LegacyDestinationCheckoutOperationDependencies;
}): Promise<LegacyDestinationCheckoutOperationResult> {
  const { claim, dependencies, operation } = input;
  if (
    !claim.operationPk
    || claim.generation === null
    || !claim.claimToken
    || !claim.achIdempotencyKey
    || !claim.cardFallbackIdempotencyKey
  ) throw new LegacyDestinationCheckoutUnavailableError();
  const claimToken = claim.claimToken!;
  let beginOwned: boolean;
  try {
    beginOwned = await dependencies.store.begin({
      operationPk: claim.operationPk,
      claimToken,
    });
  } catch {
    throw new LegacyDestinationCheckoutIndeterminateError();
  }
  if (!beginOwned) throw new LegacyDestinationCheckoutUnavailableError();

  let contract = buildProviderContract({ claim, operation, variant: 'primary' });
  let creation: LegacyDestinationCheckoutProviderCreateResult;
  try {
    creation = await dependencies.provider.createSession(Object.freeze({
      ...contract,
      idempotencyKey: claim.achIdempotencyKey,
    }));
  } catch {
    return recordIndeterminate(
      dependencies.store,
      claim.operationPk,
      claimToken,
      'provider_create_ambiguous',
    );
  }
  if (creation?.outcome === 'definitive_payment_method_rejection') {
    if (!operation.allowCardFallback) {
      return quarantineDefinitiveProviderRejection({
        store: dependencies.store,
        operationPk: claim.operationPk,
        claimToken,
      });
    }
    contract = buildProviderContract({ claim, operation, variant: 'card_fallback' });
    try {
      creation = await dependencies.provider.createSession(Object.freeze({
        ...contract,
        idempotencyKey: claim.cardFallbackIdempotencyKey,
      }));
    } catch {
      return recordIndeterminate(
        dependencies.store,
        claim.operationPk,
        claimToken,
        'provider_create_ambiguous',
      );
    }
  }
  if (creation?.outcome === 'definitive_payment_method_rejection') {
    return quarantineDefinitiveProviderRejection({
      store: dependencies.store,
      operationPk: claim.operationPk,
      claimToken,
    });
  }
  if (creation?.outcome !== 'created' || !creation.session) {
    return recordIndeterminate(
      dependencies.store,
      claim.operationPk,
      claimToken,
      'provider_create_ambiguous',
    );
  }
  const created = creation.session;

  let lifecycle: ProviderSessionLifecycle;
  try {
    lifecycle = inspectProviderSession(
      created,
      Object.freeze([contract]),
      dependencies.nowEpochSeconds(),
    );
  } catch {
    const sessionId = cleanupSessionId(created, operation.livemode);
    await withholdAndQuarantine({
      store: dependencies.store,
      provider: dependencies.provider,
      operationPk: claim.operationPk,
      claimToken,
      contract,
      checkoutSessionId: sessionId,
      lifecycle: cleanupSessionLifecycle(created, sessionId),
      reason: 'invalid_provider_session',
    });
    throw new LegacyDestinationCheckoutReconciliationError();
  }

  if (
    lifecycle.status !== 'open'
    || lifecycle.paymentStatus !== 'unpaid'
    || !lifecycle.checkoutUrl
  ) {
    await withholdAndQuarantine({
      store: dependencies.store,
      provider: dependencies.provider,
      operationPk: claim.operationPk,
      claimToken,
      contract,
      checkoutSessionId: lifecycle.sessionId,
      lifecycle,
      reason: lifecycle.paymentStatus === 'paid'
        || lifecycle.paymentStatus === 'no_payment_required'
        ? 'paid_hold'
        : lifecycle.status === 'complete'
          ? 'complete_unpaid_hold'
          : 'invalid_provider_session',
    });
    throw new LegacyDestinationCheckoutReconciliationError();
  }

  let completion: boolean;
  try {
    completion = await dependencies.store.complete({
      operationPk: claim.operationPk,
      claimToken,
      checkoutSessionId: lifecycle.sessionId,
      providerStatus: lifecycle.status,
      providerPaymentStatus: lifecycle.paymentStatus,
      expiresAt: lifecycle.expiresAt,
    });
  } catch {
    await withholdAndQuarantine({
      store: dependencies.store,
      provider: dependencies.provider,
      operationPk: claim.operationPk,
      claimToken,
      contract,
      checkoutSessionId: lifecycle.sessionId,
      lifecycle,
      reason: 'persistence_ambiguous',
    });
    return recordIndeterminate(
      dependencies.store,
      claim.operationPk,
      claimToken,
      'completion_ambiguous',
    );
  }

  if (!completion) {
    await withholdAndQuarantine({
      store: dependencies.store,
      provider: dependencies.provider,
      operationPk: claim.operationPk,
      claimToken,
      contract,
      checkoutSessionId: lifecycle.sessionId,
      lifecycle,
      reason: 'lost_completion_race',
    });
    throw new LegacyDestinationCheckoutReconciliationError();
  }

  let presentation: boolean;
  try {
    presentation = await dependencies.store.confirmPresentation({
      operationPk: claim.operationPk,
      checkoutSessionId: lifecycle.sessionId,
    });
  } catch {
    await withholdAndQuarantine({
      store: dependencies.store,
      provider: dependencies.provider,
      operationPk: claim.operationPk,
      claimToken,
      contract,
      checkoutSessionId: lifecycle.sessionId,
      lifecycle,
      reason: 'persistence_ambiguous',
    });
    throw new LegacyDestinationCheckoutIndeterminateError();
  }
  if (!presentation) {
    await withholdAndQuarantine({
      store: dependencies.store,
      provider: dependencies.provider,
      operationPk: claim.operationPk,
      claimToken,
      contract,
      checkoutSessionId: lifecycle.sessionId,
      lifecycle,
      reason: 'presentation_withheld',
    });
    throw new LegacyDestinationCheckoutReconciliationError();
  }

  return Object.freeze({
    outcome: 'created',
    operationPk: claim.operationPk,
    generation: claim.generation,
    checkoutSessionId: lifecycle.sessionId,
    checkoutUrl: lifecycle.checkoutUrl,
  });
}

export async function orchestrateLegacyDestinationCheckoutGeneration(
  input: LegacyDestinationCheckoutOperationInput,
  dependencies: LegacyDestinationCheckoutOperationDependencies,
): Promise<LegacyDestinationCheckoutOperationResult> {
  if (!legacyDestinationCheckoutGenerationEnabled(dependencies.env ?? process.env)) {
    throw new LegacyDestinationCheckoutDisabledError();
  }
  const operation = validateOperationInput(input);
  let claim: LegacyDestinationCheckoutClaim;
  try {
    claim = await dependencies.store.claim({
      paymentId: operation.paymentId,
      livemode: operation.livemode,
      requestFingerprint: operation.requestFingerprint,
      grossAmountCents: operation.grossAmountCents,
      applicationFeeCents: operation.applicationFeeCents,
      feeRate: operation.feeRate,
    });
  } catch {
    throw new LegacyDestinationCheckoutUnavailableError();
  }

  if (claim.status === 'paid_hold' || claim.paidHoldActive) {
    throw new LegacyDestinationCheckoutReconciliationError();
  }
  assertClaimMatchesOperation(claim, operation);

  if (claim.status === 'claimed') return createOwnedSession({ claim, operation, dependencies });
  if (claim.status === 'replay_unpresented' || claim.status === 'replay_presented') {
    return presentExisting({ claim, operation, dependencies });
  }
  if (
    claim.status === 'complete_unpaid'
    || claim.status === 'quarantined'
  ) throw new LegacyDestinationCheckoutReconciliationError();
  if (claim.status === 'indeterminate' || claim.status === 'submitted') {
    throw new LegacyDestinationCheckoutIndeterminateError();
  }
  throw new LegacyDestinationCheckoutUnavailableError();
}

function validateSignedEventIdentity(
  input: LegacyDestinationCheckoutSignedEventIdentity,
): LegacyDestinationCheckoutSignedEventIdentity {
  const observedAtMilliseconds = Date.parse(input.observedAt);
  if (
    !EVENT_ID_PATTERN.test(input.providerEventId)
    || !PROVIDER_EVENT_TYPES.has(input.eventType)
    || !UUID_PATTERN.test(input.paymentId)
    || typeof input.livemode !== 'boolean'
    || !Number.isFinite(observedAtMilliseconds)
    || observedAtMilliseconds <= Date.UTC(2000, 0, 1)
    || observedAtMilliseconds > Date.now() + 5 * 60 * 1_000
    || (input.outcome !== 'success' && input.outcome !== 'failure' && input.outcome !== 'nonterminal')
  ) {
    throw new LegacyDestinationCheckoutUnavailableError();
  }
  const checkoutSessionId = requireCheckoutSessionId(input.checkoutSessionId, input.livemode);
  if (input.paymentIntentId !== null && !PAYMENT_INTENT_ID_PATTERN.test(input.paymentIntentId)) {
    throw new LegacyDestinationCheckoutUnavailableError();
  }
  if (input.sessionStatus !== null
    && input.sessionStatus !== 'open'
    && input.sessionStatus !== 'complete'
    && input.sessionStatus !== 'expired') {
    throw new LegacyDestinationCheckoutUnavailableError();
  }
  if (input.paymentStatus !== null
    && input.paymentStatus !== 'paid'
    && input.paymentStatus !== 'unpaid'
    && input.paymentStatus !== 'no_payment_required') {
    throw new LegacyDestinationCheckoutUnavailableError();
  }
  const checkoutEvent = input.eventType.startsWith('checkout.session.');
  const paymentIntentEvent = input.eventType.startsWith('payment_intent.');
  const chargeEvent = input.eventType.startsWith('charge.');
  if (
    (checkoutEvent && input.eventObjectId !== checkoutSessionId)
    || (paymentIntentEvent && input.eventObjectId !== input.paymentIntentId)
    || (chargeEvent && !CHARGE_ID_PATTERN.test(input.eventObjectId))
    || (input.outcome === 'success' && input.paymentIntentId === null)
    || (
      input.eventType === 'checkout.session.expired'
      && (input.outcome !== 'failure'
        || input.sessionStatus !== 'expired'
        || input.paymentStatus !== 'unpaid')
    )
    || (
      input.eventType === 'checkout.session.async_payment_failed'
      && (input.outcome !== 'failure'
        || input.sessionStatus !== 'complete'
        || input.paymentStatus !== 'unpaid')
    )
    || (
      input.eventType === 'checkout.session.completed'
      && !(
        (input.outcome === 'success' && input.paymentStatus === 'paid')
        || (input.outcome === 'nonterminal'
          && input.sessionStatus === 'complete'
          && input.paymentStatus === 'unpaid')
      )
    )
    || (
      (input.eventType === 'checkout.session.async_payment_succeeded'
        || input.eventType === 'payment_intent.succeeded'
        || input.eventType === 'charge.succeeded')
      && (input.outcome !== 'success' || input.paymentStatus !== 'paid')
    )
    || (
      (input.eventType === 'payment_intent.payment_failed'
        || input.eventType === 'charge.failed')
      && input.outcome !== 'failure'
    )
  ) {
    throw new LegacyDestinationCheckoutUnavailableError();
  }
  return Object.freeze({
    ...input,
    paymentId: input.paymentId.toLowerCase(),
    checkoutSessionId,
  });
}

/**
 * Classifies identity from an already verified Stripe Event. This adapter is
 * deliberately not controlled by the generation flag: webhook lineage checks
 * remain fail-closed even while generation is dark.
 */
export async function classifyLegacyDestinationCheckoutSignedEvent(
  input: LegacyDestinationCheckoutSignedEventIdentity,
  store: LegacyDestinationCheckoutOperationStore =
    new SupabaseLegacyDestinationCheckoutOperationStore(),
): Promise<LegacyDestinationCheckoutEventClassification> {
  const identity = validateSignedEventIdentity(input);
  try {
    return await store.classifyEvent(identity);
  } catch {
    throw new LegacyDestinationCheckoutUnavailableError();
  }
}

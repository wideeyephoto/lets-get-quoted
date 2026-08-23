import 'server-only';

import { createHash } from 'node:crypto';
import type Stripe from 'stripe';

import { createAdminClient } from '@/lib/auth';
import {
  PRICING_CATALOG_VERSION,
  type TopUpDefinition,
  type TopUpId,
} from '@/lib/billing/catalog';
import { assertConfiguredStripeBillingMode } from '@/lib/billing/stripe-billing-subscription-checkout';
import {
  buildTopUpCheckoutParams,
  resolveTopUpPrice,
  type ResolvedTopUpPrice,
} from '@/lib/billing/top-up-purchase';
import { getStripeClient } from '@/lib/stripe';

/**
 * Crash-safe, dark orchestration for buying one top-up.
 *
 * This is the missing START of the top-up path. Everything after a paid Session
 * already exists and is proven: webhook -> billing_events inbox ->
 * claim_stripe_platform_top_up_event -> project_stripe_platform_top_up_event ->
 * usage_credit_lots. Nothing here grants anything. The ledger this file drives
 * stops at checkout_created on purpose, because two ledgers competing to decide
 * whether credit was granted is how they come to disagree.
 *
 * It mirrors subscription-checkout-operation.ts: a database claim and a
 * `submitted` transition both commit BEFORE Stripe create, so "we asked and
 * never heard back" is a state rather than something inferred later from a
 * missing row. Submitted and indeterminate rows are reconciliation-only and are
 * never auto-retried.
 *
 * Two things differ from the subscription ledger and both bite if assumed:
 *
 * The claim RPC answers 'claimed' or **'replayed'** -- not 'replay', and not the
 * nine-way status the subscription ledger returns. A replay carries the earlier
 * attempt's `state`, and all five states mean different things (see
 * `orchestrateTopUpPurchaseCheckout`).
 *
 * There is a fifth RPC, `fail_stripe_top_up_purchase`, with no subscription
 * equivalent. It releases a claim straight to a terminal `failed` instead of
 * leaving it to rot until its lease expires. See RELEASE POINTS below.
 */

export const TOP_UP_PURCHASE_PURPOSE = 'top_up_purchase' as const;
export const TOP_UP_PURCHASE_CURRENCY = 'usd' as const;

/**
 * Every value `p_error_code` may take, because the ledger's CHECK is
 * `^[a-z][a-z0-9_]{2,63}$` -- a free-text audit string like the subscription
 * ledger's `last_error` is rejected outright by this table.
 *
 * The taxonomy answers exactly one question a human reconciling a row needs
 * answered: could a Stripe object exist? `provider_*` codes mean yes, maybe.
 * The other two mean provably not.
 */
export const TOP_UP_PURCHASE_ERROR_CODES = Object.freeze({
  /** Stripe was asked and did not answer, or answered with an error. */
  providerRequestFailed: 'provider_request_failed',
  /** Stripe answered with a Session outside the claimed contract. */
  providerContractMismatch: 'provider_contract_mismatch',
  /** The claim did not echo back the purchase this process claimed. */
  claimContractMismatch: 'claim_contract_mismatch',
  /** The submitted transition did not commit, so nothing was ever sent. */
  submissionNotRecorded: 'submission_not_recorded',
} as const);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRICE_ID_PATTERN = /^price_[A-Za-z0-9]{8,}$/;
const PRODUCT_ID_PATTERN = /^prod_[A-Za-z0-9]{8,}$/;
const CHECKOUT_SESSION_ID_PATTERN = /^cs_(?:test|live)_[A-Za-z0-9_]+$/;
const OPERATION_ID_MAX_LENGTH = 200;

function requireWorkspaceId(value: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new Error('Top-up purchase workspace ID must be a workspace UUID.');
  }
  return value.toLowerCase();
}

function requireOperationId(value: string): string {
  // The ledger's own CHECK: trimmed, 1..200, no control characters.
  if (
    typeof value !== 'string'
    || value !== value.trim()
    || value.length < 1
    || value.length > OPERATION_ID_MAX_LENGTH
    || /\p{Cc}/u.test(value)
  ) {
    throw new Error('Top-up purchase operation ID is invalid.');
  }
  return value;
}

const LOCAL_HTTP_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * A return URL a customer may actually be sent to after paying.
 *
 * The entrypoint already derives the origin from the live request, but this is
 * the layer that hands the URL to Stripe, and a success_url is only ever found
 * to be wrong AFTER the money has moved. Validating here means no future caller
 * -- a route, a script, a retry harness -- can put a plain-http or
 * credential-bearing URL on a Session.
 */
function requireReturnUrl(value: string, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 2_048 || /\p{Cc}/u.test(value)) {
    throw new Error(`Top-up purchase ${label} is invalid.`);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Top-up purchase ${label} is invalid.`);
  }
  const localHttp = parsed.protocol === 'http:' && LOCAL_HTTP_HOSTS.has(parsed.hostname);
  if ((parsed.protocol !== 'https:' && !localHttp) || parsed.username || parsed.password) {
    throw new Error(`Top-up purchase ${label} is invalid.`);
  }
  return parsed.toString();
}

function requireResolvedPrice(price: ResolvedTopUpPrice, sku: TopUpDefinition): ResolvedTopUpPrice {
  if (
    !price
    || !PRICE_ID_PATTERN.test(price.priceId)
    || !PRODUCT_ID_PATTERN.test(price.productId)
    || price.unitAmountCents !== sku.priceCents
    || price.recurring !== sku.recurring
  ) {
    throw new Error('Resolved top-up Price does not match the catalog SKU.');
  }
  return price;
}

function canonicalizeForFingerprint(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Top-up fingerprint values must be finite.');
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((child) => (child === undefined ? null : canonicalizeForFingerprint(child)));
  }
  if (typeof value === 'object') {
    const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(value).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) output[key] = canonicalizeForFingerprint(child);
    }
    return output;
  }
  throw new Error('Top-up fingerprint values must be JSON-compatible.');
}

function sha256Fingerprint(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalizeForFingerprint(value)))
    .digest('hex');
}

/**
 * The Stripe idempotency identity for one purchase intent.
 *
 * Built exactly like buildBasePlanSubscriptionCheckoutIdempotencyKey -- sha256
 * over purpose, workspace, operation and mode -- but the purpose SEGMENT has to
 * be `top_up_purchase.create`, because the ledger column carries
 * `^lgq:billing:v1:top_up_purchase[.]create:[0-9a-f]{64}$` as a CHECK. Get that
 * segment wrong and every claim fails its own constraint before Stripe is ever
 * reached.
 */
export function buildTopUpPurchaseCheckoutIdempotencyKey(input: {
  workspaceId: string;
  operationId: string;
  livemode: boolean;
}): string {
  const workspaceId = requireWorkspaceId(input.workspaceId);
  const operationId = requireOperationId(input.operationId);
  if (typeof input.livemode !== 'boolean') throw new Error('Top-up purchase livemode must be explicit.');
  const digest = createHash('sha256')
    .update([
      TOP_UP_PURCHASE_PURPOSE,
      workspaceId,
      operationId,
      input.livemode ? 'live' : 'test',
    ].join('\0'))
    .digest('hex');
  return `lgq:billing:v1:top_up_purchase.create:${digest}`;
}

export type TopUpPurchaseCheckoutBuildInput = Readonly<{
  workspaceId: string;
  /** Stable business identity. It must be reused for a retry of the same intent. */
  operationId: string;
  sku: TopUpDefinition;
  price: ResolvedTopUpPrice;
  livemode: boolean;
  successUrl: string;
  cancelUrl: string;
}>;

export type TopUpPurchaseCheckoutCall = Readonly<{
  params: Readonly<Stripe.Checkout.SessionCreateParams>;
  /** Deliberately the only request option: no stripeAccount header is allowed. */
  options: Readonly<{ idempotencyKey: string }>;
  requestFingerprint: string;
  contract: Readonly<{
    workspaceId: string;
    operationId: string;
    purpose: typeof TOP_UP_PURCHASE_PURPOSE;
    topUpId: TopUpId;
    resourceCode: TopUpDefinition['resourceCode'];
    units: number;
    catalogVersion: typeof PRICING_CATALOG_VERSION;
    livemode: boolean;
    priceId: string;
    productId: string;
    currency: typeof TOP_UP_PURCHASE_CURRENCY;
    unitAmountCents: number;
    mode: 'payment' | 'subscription';
  }>;
}>;

/**
 * One purchase, expressed as the exact Stripe call plus the contract the durable
 * claim will record.
 *
 * The Session parameters themselves come from buildTopUpCheckoutParams, which
 * already writes the six metadata keys the live projector reads back. Nothing
 * here re-derives them: a second copy of that metadata shape is a second thing
 * that can drift away from what fulfillment expects.
 */
export function buildTopUpPurchaseCheckoutCall(
  input: TopUpPurchaseCheckoutBuildInput,
): TopUpPurchaseCheckoutCall {
  const workspaceId = requireWorkspaceId(input.workspaceId);
  const operationId = requireOperationId(input.operationId);
  const sku = input.sku;
  if (!sku?.id) throw new Error('Top-up purchase requires a catalog SKU.');
  const price = requireResolvedPrice(input.price, sku);
  if (typeof input.livemode !== 'boolean') throw new Error('Top-up purchase livemode must be explicit.');

  const params = Object.freeze(buildTopUpCheckoutParams({
    accountId: workspaceId,
    sku,
    price,
    successUrl: requireReturnUrl(input.successUrl, 'successUrl'),
    cancelUrl: requireReturnUrl(input.cancelUrl, 'cancelUrl'),
    catalogVersion: PRICING_CATALOG_VERSION,
  })) as Readonly<Stripe.Checkout.SessionCreateParams>;

  const contract = Object.freeze({
    workspaceId,
    operationId,
    purpose: TOP_UP_PURCHASE_PURPOSE,
    topUpId: sku.id,
    resourceCode: sku.resourceCode,
    units: sku.units,
    catalogVersion: PRICING_CATALOG_VERSION,
    livemode: input.livemode,
    priceId: price.priceId,
    productId: price.productId,
    currency: TOP_UP_PURCHASE_CURRENCY,
    unitAmountCents: price.unitAmountCents,
    mode: (sku.recurring ? 'subscription' : 'payment') as 'payment' | 'subscription',
  });

  const options = Object.freeze({
    idempotencyKey: buildTopUpPurchaseCheckoutIdempotencyKey({
      workspaceId,
      operationId,
      livemode: input.livemode,
    }),
  });

  return Object.freeze({
    params,
    options,
    contract,
    requestFingerprint: sha256Fingerprint({
      operation: 'top_up_purchase.create',
      params,
      contract,
    }),
  });
}

function metadataExactlyMatches(
  value: Stripe.Metadata | Stripe.MetadataParam | null | undefined,
  expected: Stripe.MetadataParam,
): boolean {
  if (!value) return false;
  const actualEntries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  const expectedEntries = Object.entries(expected).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(actualEntries) === JSON.stringify(expectedEntries);
}

/**
 * Prove the Session Stripe returned is the one that was claimed.
 *
 * A mismatch is treated as indeterminate rather than as success, which does mean
 * a real Session can be left unclaimed and unpaid until it expires. That is the
 * safe direction: the URL is never handed to the customer, so nothing is
 * charged, and the projector -- which re-fetches by Session ID -- never sees a
 * paid object it was not told to expect.
 */
export function assertTopUpCheckoutSession(
  session: Stripe.Checkout.Session,
  call: TopUpPurchaseCheckoutCall,
): void {
  const expectedPrefix = call.contract.livemode ? 'cs_live_' : 'cs_test_';
  if (
    !session
    || session.object !== 'checkout.session'
    || typeof session.id !== 'string'
    || !CHECKOUT_SESSION_ID_PATTERN.test(session.id)
    || !session.id.startsWith(expectedPrefix)
    || session.livemode !== call.contract.livemode
    || session.mode !== call.contract.mode
    || session.currency !== TOP_UP_PURCHASE_CURRENCY
    || session.amount_total !== call.contract.unitAmountCents
    || !metadataExactlyMatches(session.metadata, call.params.metadata as Stripe.MetadataParam)
  ) {
    throw new Error('Stripe returned a Checkout Session outside the claimed top-up contract.');
  }
}

export type TopUpPurchaseOperationState =
  | 'claimed'
  | 'submitted'
  | 'checkout_created'
  | 'indeterminate'
  | 'failed';

/** The ledger answers with exactly these two. Not 'replay'. */
export type TopUpPurchaseClaimStatus = 'claimed' | 'replayed';

export type TopUpPurchaseClaim = Readonly<{
  status: TopUpPurchaseClaimStatus;
  operationPk: string;
  claimToken: string | null;
  operationState: TopUpPurchaseOperationState;
  providerObjectId: string | null;
}>;

export type TopUpPurchaseClaimInput = Readonly<{
  workspaceId: string;
  operationId: string;
  topUpId: TopUpId;
  resourceCode: string;
  units: number;
  catalogVersion: string;
  livemode: boolean;
  priceId: string;
  productId: string;
  unitAmountCents: number;
  stripeIdempotencyKey: string;
}>;

export interface TopUpPurchaseOperationStore {
  claim(input: TopUpPurchaseClaimInput): Promise<TopUpPurchaseClaim>;
  beginSubmission(input: {
    operationPk: string;
    claimToken: string;
    requestFingerprint: string;
  }): Promise<void>;
  complete(input: {
    operationPk: string;
    claimToken: string;
    checkoutSessionId: string;
  }): Promise<void>;
  markIndeterminate(input: {
    operationPk: string;
    claimToken: string;
    errorCode: string;
  }): Promise<void>;
  fail(input: {
    operationPk: string;
    claimToken: string;
    errorCode: string;
  }): Promise<void>;
}

type RpcError = Readonly<{ message?: string; code?: string }>;

function rpcFailure(label: string, error: RpcError | null): Error {
  const detail = error?.message?.trim() || error?.code?.trim() || 'unknown database error';
  return new Error(`${label}: ${detail}`);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error(`${label} returned no operation row.`);
  }
  return row as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is missing.`);
  return value;
}

const CLAIM_STATUSES = new Set<TopUpPurchaseClaimStatus>(['claimed', 'replayed']);
const OPERATION_STATES = new Set<TopUpPurchaseOperationState>([
  'claimed',
  'submitted',
  'checkout_created',
  'indeterminate',
  'failed',
]);

function requireErrorCode(value: string): string {
  // The ledger rejects anything else, and it rejects it by raising rather than
  // by ignoring the write -- so a bad code turns a recoverable release into an
  // unhandled error at the worst possible moment.
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_]{2,63}$/.test(value)) {
    throw new Error('Top-up purchase error code is not a ledger-legal code.');
  }
  return value;
}

/** Service-role implementation. The migration revokes every direct table write. */
export class SupabaseTopUpPurchaseOperationStore implements TopUpPurchaseOperationStore {
  constructor(private readonly admin = createAdminClient()) {}

  async claim(input: TopUpPurchaseClaimInput): Promise<TopUpPurchaseClaim> {
    const { data, error } = await this.admin.rpc('claim_stripe_top_up_purchase', {
      p_account_id: input.workspaceId,
      p_operation_id: input.operationId,
      p_top_up_id: input.topUpId,
      p_resource_code: input.resourceCode,
      p_units: input.units,
      p_catalog_version: input.catalogVersion,
      p_livemode: input.livemode,
      p_stripe_price_id: input.priceId,
      p_stripe_product_id: input.productId,
      p_unit_amount_cents: input.unitAmountCents,
      p_stripe_idempotency_key: input.stripeIdempotencyKey,
    });
    if (error) throw rpcFailure('Unable to claim top-up purchase operation', error);

    const row = requireRecord(data, 'Top-up purchase claim');
    const status = requireString(row.claim_status, 'Top-up purchase claim status');
    // The RPC names this column `state`, not `operation_state`.
    const operationState = requireString(row.state, 'Top-up purchase operation state');
    if (!CLAIM_STATUSES.has(status as TopUpPurchaseClaimStatus)) {
      throw new Error(`Top-up purchase claim returned unsupported status: ${status}.`);
    }
    if (!OPERATION_STATES.has(operationState as TopUpPurchaseOperationState)) {
      throw new Error(`Top-up purchase claim returned unsupported operation state: ${operationState}.`);
    }

    const claimToken = row.claim_token == null
      ? null
      : requireString(row.claim_token, 'Top-up purchase claim token');
    let providerObjectId: string | null = null;
    if (row.provider_object_id != null) {
      providerObjectId = requireString(row.provider_object_id, 'Top-up purchase provider object ID');
      if (!CHECKOUT_SESSION_ID_PATTERN.test(providerObjectId)) {
        throw new Error('Top-up purchase provider object ID is invalid.');
      }
    }

    if (status === 'claimed' && (!claimToken || operationState !== 'claimed')) {
      throw new Error('Top-up purchase database claim did not return an owned, claimed row.');
    }

    return Object.freeze({
      status: status as TopUpPurchaseClaimStatus,
      operationPk: requireString(row.operation_pk, 'Top-up purchase operation primary key'),
      claimToken,
      operationState: operationState as TopUpPurchaseOperationState,
      providerObjectId,
    });
  }

  async beginSubmission(input: {
    operationPk: string;
    claimToken: string;
    requestFingerprint: string;
  }): Promise<void> {
    const { data, error } = await this.admin.rpc('begin_stripe_top_up_purchase_submission', {
      p_operation_pk: input.operationPk,
      p_claim_token: input.claimToken,
      p_request_fingerprint: input.requestFingerprint,
    });
    if (error) throw rpcFailure('Unable to begin top-up purchase submission', error);
    if (data !== true) throw new Error('Top-up purchase begin RPC did not confirm the transition.');
  }

  async complete(input: {
    operationPk: string;
    claimToken: string;
    checkoutSessionId: string;
  }): Promise<void> {
    const { data, error } = await this.admin.rpc('complete_stripe_top_up_purchase', {
      p_operation_pk: input.operationPk,
      p_claim_token: input.claimToken,
      p_checkout_session_id: input.checkoutSessionId,
    });
    if (error) throw rpcFailure('Unable to complete top-up purchase operation', error);
    if (data !== true) throw new Error('Top-up purchase completion RPC did not confirm the transition.');
  }

  async markIndeterminate(input: {
    operationPk: string;
    claimToken: string;
    errorCode: string;
  }): Promise<void> {
    const { data, error } = await this.admin.rpc('mark_stripe_top_up_purchase_indeterminate', {
      p_operation_pk: input.operationPk,
      p_claim_token: input.claimToken,
      p_error_code: requireErrorCode(input.errorCode),
    });
    if (error) throw rpcFailure('Unable to mark top-up purchase indeterminate', error);
    if (data !== true) throw new Error('Top-up purchase indeterminate RPC did not confirm the transition.');
  }

  async fail(input: {
    operationPk: string;
    claimToken: string;
    errorCode: string;
  }): Promise<void> {
    const { data, error } = await this.admin.rpc('fail_stripe_top_up_purchase', {
      p_operation_pk: input.operationPk,
      p_claim_token: input.claimToken,
      p_error_code: requireErrorCode(input.errorCode),
    });
    if (error) throw rpcFailure('Unable to release top-up purchase claim', error);
    if (data !== true) throw new Error('Top-up purchase failure RPC did not confirm the transition.');
  }
}

/**
 * Create the Session on the PLATFORM account.
 *
 * No Stripe-Account request option, no application fee, no transfer_data: a
 * top-up is LGQ's own product, not a contractor's job. The projector retrieves
 * the same Session with no `stripeAccount` header for the same reason.
 */
export async function createPlatformTopUpCheckoutSession(
  call: TopUpPurchaseCheckoutCall,
): Promise<Stripe.Checkout.Session> {
  assertConfiguredStripeBillingMode(call.contract.livemode);
  return getStripeClient().checkout.sessions.create(call.params, call.options);
}

export async function retrievePlatformTopUpCheckoutSession(
  checkoutSessionId: string,
): Promise<Stripe.Checkout.Session> {
  if (!CHECKOUT_SESSION_ID_PATTERN.test(checkoutSessionId)) {
    throw new Error('Stored top-up Checkout Session ID is invalid.');
  }
  return getStripeClient().checkout.sessions.retrieve(checkoutSessionId);
}

/** Metadata search, wired to the platform Stripe client. */
export async function resolveDefaultTopUpPrice(input: {
  sku: TopUpDefinition;
  livemode: boolean;
}): Promise<ResolvedTopUpPrice> {
  assertConfiguredStripeBillingMode(input.livemode);
  return resolveTopUpPrice(
    (query) => getStripeClient().prices.search({ query, limit: 2 }),
    input.sku,
    PRICING_CATALOG_VERSION,
  );
}

export type TopUpPurchaseCheckoutInput = Readonly<{
  workspaceId: string;
  operationId: string;
  sku: TopUpDefinition;
  livemode: boolean;
  successUrl: string;
  cancelUrl: string;
}>;

export type TopUpPurchaseCheckoutDependencies = Readonly<{
  store: TopUpPurchaseOperationStore;
  resolvePrice(input: { sku: TopUpDefinition; livemode: boolean }): Promise<ResolvedTopUpPrice>;
  createSession(call: TopUpPurchaseCheckoutCall): Promise<Stripe.Checkout.Session>;
  retrieveSession(checkoutSessionId: string): Promise<Stripe.Checkout.Session>;
}>;

export type TopUpPurchaseCheckoutResult = Readonly<{
  outcome: 'created' | 'replayed';
  operationPk: string;
  session: Stripe.Checkout.Session;
}>;

export class TopUpPurchaseCheckoutUnavailableError extends Error {
  override readonly name = 'TopUpPurchaseCheckoutUnavailableError';

  constructor(
    readonly operationState: TopUpPurchaseOperationState | string,
    readonly claimStatus: TopUpPurchaseClaimStatus | string,
  ) {
    super(`Top-up purchase is ${operationState}; no new Stripe request was sent.`);
  }
}

export class TopUpPurchaseCheckoutIndeterminateError extends Error {
  override readonly name = 'TopUpPurchaseCheckoutIndeterminateError';

  constructor(
    readonly providerError: unknown,
    readonly persistenceError?: unknown,
  ) {
    super('Top-up purchase submission outcome is unknown; no automatic retry is allowed.');
  }
}

export class TopUpPurchaseCheckoutPersistenceError extends Error {
  override readonly name = 'TopUpPurchaseCheckoutPersistenceError';

  constructor(readonly persistenceError: unknown) {
    super('Stripe returned a Checkout Session, but durable completion was not confirmed; do not create again.');
  }
}

function defaultDependencies(): TopUpPurchaseCheckoutDependencies {
  return Object.freeze({
    store: new SupabaseTopUpPurchaseOperationStore(),
    resolvePrice: resolveDefaultTopUpPrice,
    createSession: createPlatformTopUpCheckoutSession,
    retrieveSession: retrievePlatformTopUpCheckoutSession,
  });
}

/**
 * RELEASE POINTS -- where fail_stripe_top_up_purchase is called, and why only
 * there.
 *
 * It is called at exactly the two points where Stripe provably has not been
 * asked: a post-claim contract check that throws, and a begin-submission RPC
 * that throws. Both leave a claim nobody will ever finish, and a `claimed` row
 * whose lease merely expires is indistinguishable, forever, from one an operator
 * has to look at. Releasing it to `failed` says "nothing exists, stop looking"
 * in the row itself.
 *
 * It is deliberately NOT called once createSession has been entered. From that
 * instant a Session may exist even if the call threw, and `failed` asserts that
 * nothing does. That case is `indeterminate`, which keeps the claim precisely so
 * that no later attempt invents a second Session.
 *
 * The release is best-effort: if it throws, the original error is still what
 * propagates. A failed release leaves a recoverable row, not a wrong one.
 */
async function releaseClaim(
  store: TopUpPurchaseOperationStore,
  operationPk: string,
  claimToken: string,
  errorCode: string,
): Promise<void> {
  try {
    await store.fail({ operationPk, claimToken, errorCode });
  } catch {
    // Intentionally swallowed: see RELEASE POINTS.
  }
}

export async function orchestrateTopUpPurchaseCheckout(
  input: TopUpPurchaseCheckoutInput,
  dependencies: TopUpPurchaseCheckoutDependencies = defaultDependencies(),
): Promise<TopUpPurchaseCheckoutResult> {
  // The process credential, explicit deployment switch, caller intent, Price and
  // durable claim must all agree on test/live mode before anything is claimed.
  assertConfiguredStripeBillingMode(input.livemode);

  const price = await dependencies.resolvePrice({ sku: input.sku, livemode: input.livemode });

  // Pure construction validates the whole Price/catalog/mode contract before the
  // durable claim, so a mismatch costs a thrown error rather than a wasted row.
  const call = buildTopUpPurchaseCheckoutCall({
    workspaceId: input.workspaceId,
    operationId: input.operationId,
    sku: input.sku,
    price,
    livemode: input.livemode,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
  });

  const claim = await dependencies.store.claim({
    workspaceId: call.contract.workspaceId,
    operationId: call.contract.operationId,
    topUpId: call.contract.topUpId,
    resourceCode: call.contract.resourceCode,
    units: call.contract.units,
    catalogVersion: call.contract.catalogVersion,
    livemode: call.contract.livemode,
    priceId: call.contract.priceId,
    productId: call.contract.productId,
    unitAmountCents: call.contract.unitAmountCents,
    stripeIdempotencyKey: call.options.idempotencyKey,
  });

  if (claim.status === 'replayed') {
    // All five states an earlier attempt can be in, and they are not
    // interchangeable:
    //
    // checkout_created -- the only one with a Session. Hand back the SAME one.
    // claimed          -- another attempt holds the lease and has not asked
    //                     Stripe yet. Adopting its token would be legal (the
    //                     begin RPC serializes on state) but pointless: the
    //                     winner is already producing the URL this caller wants,
    //                     and after the five-minute lease no attempt can begin
    //                     at all. Report in-progress instead of racing.
    // submitted        -- Stripe was asked. A Session may exist. Never create.
    // indeterminate    -- Stripe was asked and never answered. Reconcile by hand.
    // failed           -- terminal and clean; nothing exists. The business key is
    //                     spent, so this intent needs a NEW operation ID.
    if (claim.operationState === 'checkout_created' && claim.providerObjectId) {
      const session = await dependencies.retrieveSession(claim.providerObjectId);
      assertTopUpCheckoutSession(session, call);
      return Object.freeze({ outcome: 'replayed', operationPk: claim.operationPk, session });
    }
    throw new TopUpPurchaseCheckoutUnavailableError(claim.operationState, claim.status);
  }

  const claimToken = claim.claimToken;
  if (!claimToken || claim.operationState !== 'claimed') {
    throw new Error('Claimed top-up purchase is missing its owner token.');
  }

  try {
    // Recheck immediately before the durable submitted boundary. Mode is process
    // state and the claim round trip is not instantaneous.
    assertConfiguredStripeBillingMode(call.contract.livemode);
    if (claim.providerObjectId) {
      throw new Error('Freshly claimed top-up purchase already carries a Checkout Session.');
    }
  } catch (validationError) {
    await releaseClaim(
      dependencies.store,
      claim.operationPk,
      claimToken,
      TOP_UP_PURCHASE_ERROR_CODES.claimContractMismatch,
    );
    throw validationError;
  }

  try {
    // If this RPC's response is lost the row stays submitted, and no later call
    // creates again.
    await dependencies.store.beginSubmission({
      operationPk: claim.operationPk,
      claimToken,
      requestFingerprint: call.requestFingerprint,
    });
  } catch (submissionError) {
    await releaseClaim(
      dependencies.store,
      claim.operationPk,
      claimToken,
      TOP_UP_PURCHASE_ERROR_CODES.submissionNotRecorded,
    );
    throw submissionError;
  }

  const holdIndeterminate = async (
    providerError: unknown,
    errorCode: string,
  ): Promise<never> => {
    let persistenceError: unknown;
    try {
      await dependencies.store.markIndeterminate({
        operationPk: claim.operationPk,
        claimToken,
        errorCode,
      });
    } catch (markError) {
      persistenceError = markError;
    }
    throw new TopUpPurchaseCheckoutIndeterminateError(providerError, persistenceError);
  };

  let session: Stripe.Checkout.Session;
  try {
    session = await dependencies.createSession(call);
  } catch (providerError) {
    // A thrown create is not proof that nothing was created -- a timeout looks
    // exactly like this from here.
    await holdIndeterminate(providerError, TOP_UP_PURCHASE_ERROR_CODES.providerRequestFailed);
    throw providerError;
  }

  try {
    assertTopUpCheckoutSession(session, call);
  } catch (contractError) {
    // A Session definitely exists and it is not the one that was claimed. Kept
    // separate from the code above because the two need different reconciliation:
    // here the operator has an object ID to look at.
    await holdIndeterminate(contractError, TOP_UP_PURCHASE_ERROR_CODES.providerContractMismatch);
    throw contractError;
  }

  try {
    await dependencies.store.complete({
      operationPk: claim.operationPk,
      claimToken,
      checkoutSessionId: session.id,
    });
  } catch (persistenceError) {
    throw new TopUpPurchaseCheckoutPersistenceError(persistenceError);
  }

  return Object.freeze({ outcome: 'created', operationPk: claim.operationPk, session });
}

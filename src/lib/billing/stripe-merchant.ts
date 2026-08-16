import 'server-only';

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

import { APP_ORIGIN } from '@/lib/app-origin';
import { getStripeClient, STRIPE_API_VERSION } from '@/lib/stripe';

/**
 * Dark-launched Accounts v2 Merchant onboarding and readiness boundary.
 *
 * This module is intentionally not imported by a route or by the existing
 * recipient/destination-charge path. `accounts.stripe_connect_id` continues to
 * identify that legacy Recipient account. Every function here reads or writes
 * only the separate `stripe_merchant_account_id` readiness fields introduced
 * for the future direct-charge rail.
 *
 * Stripe's full-Dashboard Merchant configuration is immutable in the two facts
 * that matter most to LGQ's margin and liability model: Stripe collects its own
 * processing fees, and Stripe is responsible for connected-account losses.
 * Build those facts into account creation and then prove them again from a
 * freshly retrieved Account before a direct payment can become eligible.
 */

export const STRIPE_MERCHANT_CONFIGURATION_VERSION = 'lgq.stripe-merchant.v1' as const;
export const STRIPE_MERCHANT_COUNTRY = 'us' as const;
export const STRIPE_MERCHANT_CURRENCY = 'usd' as const;

type MerchantRetrieveInclude = Stripe.V2.Core.AccountRetrieveParams.Include;
export const STRIPE_MERCHANT_RETRIEVE_PARAMS: Readonly<{ include: MerchantRetrieveInclude[] }> = Object.freeze({
  include: ['configuration.merchant', 'defaults', 'requirements'] as MerchantRetrieveInclude[],
});

const CONFIGURED_APP_ORIGIN = new URL(APP_ORIGIN).origin;
const STRIPE_ACCOUNT_ID_PATTERN = /^acct_[A-Za-z0-9]{8,}$/;
const STRIPE_SECRET_KEY_MODE_PATTERN = /^(?:sk|rk)_(test|live)_/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export type MerchantOnboardingState = 'pending' | 'restricted' | 'ready' | 'disabled';

export type MerchantReadinessIssue =
  | 'stripe_response_invalid'
  | 'account_closed'
  | 'merchant_configuration_not_applied'
  | 'merchant_configuration_inactive'
  | 'dashboard_not_full'
  | 'card_payments_not_active'
  | 'payouts_not_active'
  | 'fees_collector_not_stripe'
  | 'losses_collector_not_stripe'
  | 'requirements_collector_not_stripe'
  | 'requirements_not_included'
  | 'requirements_past_due'
  | 'api_version_missing'
  | 'api_version_mismatch'
  | 'stripe_request_id_missing';

export type MerchantReadinessSnapshot = Readonly<{
  schema_version: typeof STRIPE_MERCHANT_CONFIGURATION_VERSION;
  account_id: string;
  object: string;
  livemode: boolean | null;
  closed: boolean;
  dashboard: string | null;
  applied_configurations: readonly string[];
  merchant: Readonly<{
    applied: boolean;
    card_payments_status: string | null;
    ach_debit_payments_status: string | null;
    payouts_status: string | null;
  }>;
  responsibilities: Readonly<{
    fees_collector: string | null;
    losses_collector: string | null;
    requirements_collector: string | null;
  }>;
  requirements: Readonly<{
    included: boolean;
    minimum_deadline_status: string | null;
    minimum_deadline_time: string | null;
    entry_count: number;
    user_action_entry_count: number;
    error_count: number;
  }>;
  stripe_response: Readonly<{
    api_version: string | null;
    expected_api_version: typeof STRIPE_API_VERSION;
    request_id: string | null;
    status_code: number | null;
  }>;
  verification: Readonly<{
    ready: boolean;
    issues: readonly MerchantReadinessIssue[];
    verified_at: string;
  }>;
}>;

export type MerchantReadinessEvidence = Readonly<{
  accountId: string;
  livemode: boolean | null;
  dashboardType: string | null;
  cardPaymentsActive: boolean;
  usBankAccountPaymentsActive: boolean;
  payoutsActive: boolean;
  feesCollector: string | null;
  lossesCollector: string | null;
  apiVersion: string | null;
  verifiedAt: string;
  onboardingState: MerchantOnboardingState;
  ready: boolean;
  issues: readonly MerchantReadinessIssue[];
  snapshot: MerchantReadinessSnapshot;
  snapshotSha256: string;
}>;

export type MerchantAccountCreateInput = Readonly<{
  workspaceId: string;
  businessName: string;
  contactEmail: string;
}>;

export type MerchantAccountCreateCall = Readonly<{
  params: Readonly<Stripe.V2.Core.AccountCreateParams>;
  options: Readonly<{ idempotencyKey: string }>;
  requestFingerprint: string;
}>;

export type MerchantOnboardingLinkInput = Readonly<{
  merchantAccountId: string;
  returnUrl: string;
  refreshUrl: string;
}>;

export type MerchantOnboardingLinkCall = Readonly<{
  params: Readonly<Stripe.V2.Core.AccountLinkCreateParams>;
}>;

export type MerchantReadinessDatabaseUpdate = Readonly<{
  merchant_onboarding_state: MerchantOnboardingState;
  merchant_requirements_checked_at: string;
  merchant_ready_at: string | null;
  merchant_disabled_at: string | null;
  merchant_livemode: boolean | null;
  merchant_dashboard_type: string | null;
  merchant_card_payments_active: boolean;
  merchant_us_bank_account_payments_active: boolean;
  merchant_payouts_active: boolean;
  merchant_fees_collector: string | null;
  merchant_losses_collector: string | null;
  merchant_configuration_api_version: string | null;
  merchant_configuration_snapshot: MerchantReadinessSnapshot;
  merchant_configuration_snapshot_sha256: string;
  merchant_configuration_verified_at: string;
}>;

export type MerchantProvisioningClaimStatus =
  | 'claimed'
  | 'replay'
  | 'in_progress'
  | 'submitted'
  | 'indeterminate';

export type MerchantProvisioningOperationState =
  | 'claimed'
  | 'submitted'
  | 'succeeded'
  | 'indeterminate';

export type MerchantProvisioningClaim = Readonly<{
  status: MerchantProvisioningClaimStatus;
  operationPk: string;
  claimToken: string | null;
  operationState: MerchantProvisioningOperationState;
  providerAccountId: string | null;
}>;

export type MerchantProvisioningClaimInput = Readonly<{
  workspaceId: string;
  livemode: boolean;
  stripeIdempotencyKey: string;
  requestFingerprint: string;
}>;

export interface MerchantProvisioningOperationStore {
  claim(input: MerchantProvisioningClaimInput): Promise<MerchantProvisioningClaim>;
  beginSubmission(input: { operationPk: string; claimToken: string }): Promise<void>;
  complete(input: {
    operationPk: string;
    claimToken: string;
    providerAccountId: string;
    evidence: MerchantReadinessDatabaseUpdate;
  }): Promise<void>;
  markIndeterminate(input: {
    operationPk: string;
    claimToken: string;
    providerAccountId: string | null;
    error: string;
  }): Promise<void>;
}

export type MerchantProvisioningDependencies = Readonly<{
  store: MerchantProvisioningOperationStore;
  createAccount(call: MerchantAccountCreateCall): Promise<Stripe.Response<Stripe.V2.Core.Account>>;
}>;

function assertNonEmptyString(value: string, label: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maxLength) throw new Error(`${label} is too long.`);
  if (/\p{Cc}/u.test(normalized)) throw new Error(`${label} contains control characters.`);
  return normalized;
}

function validateWorkspaceId(workspaceId: string): string {
  const normalized = workspaceId.trim();
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error('workspaceId must be a valid UUID.');
  }
  return normalized.toLowerCase();
}

export function validateStripeMerchantAccountId(merchantAccountId: string): string {
  const normalized = merchantAccountId.trim();
  if (!STRIPE_ACCOUNT_ID_PATTERN.test(normalized)) {
    throw new Error('merchantAccountId must be a valid Stripe acct_ ID.');
  }
  return normalized;
}

/** Prove a Stripe Account was created for this exact LGQ workspace/config. */
export function assertMerchantWorkspaceBinding(
  response: Stripe.V2.Core.Account,
  workspaceId: string,
): void {
  const normalizedWorkspaceId = validateWorkspaceId(workspaceId);
  if (
    response.metadata?.lgq_workspace_id !== normalizedWorkspaceId ||
    response.metadata?.lgq_configuration !== STRIPE_MERCHANT_CONFIGURATION_VERSION
  ) {
    throw new Error('Stripe Merchant account metadata does not match the intended LGQ workspace.');
  }
}

function validateContactEmail(contactEmail: string): string {
  const normalized = assertNonEmptyString(contactEmail, 'contactEmail', 320).toLowerCase();
  const separator = normalized.indexOf('@');
  if (separator <= 0 || separator === normalized.length - 1 || normalized.includes(' ')) {
    throw new Error('contactEmail must be a valid email address.');
  }
  return normalized;
}

function validateReturnUrl(value: string, label: string): string {
  const normalized = assertNonEmptyString(value, label, 2_048);
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`${label} must be an absolute http(s) URL.`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${label} must be an absolute http(s) URL.`);
  }
  if (parsed.origin !== CONFIGURED_APP_ORIGIN) {
    throw new Error(`${label} must use the configured LGQ app origin.`);
  }
  return parsed.toString();
}

function buildMerchantAccountCreateIdempotencyKey(workspaceId: string): string {
  const digest = createHash('sha256')
    .update(`${STRIPE_MERCHANT_CONFIGURATION_VERSION}\0${workspaceId}\0account.create`)
    .digest('hex');
  return `lgq:merchant:v1:account.create:${digest}`;
}

function hashCanonicalJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalizeJson(value))).digest('hex');
}

/** Build the immutable-liability Merchant shape documented by Stripe. */
export function buildMerchantAccountCreateCall(input: MerchantAccountCreateInput): MerchantAccountCreateCall {
  const workspaceId = validateWorkspaceId(input.workspaceId);
  const businessName = assertNonEmptyString(input.businessName, 'businessName', 150);
  const contactEmail = validateContactEmail(input.contactEmail);

  const params: Stripe.V2.Core.AccountCreateParams = Object.freeze({
    contact_email: contactEmail,
    display_name: businessName,
    dashboard: 'full',
    identity: Object.freeze({ country: STRIPE_MERCHANT_COUNTRY }),
    configuration: Object.freeze({
      merchant: Object.freeze({
        capabilities: Object.freeze({
          card_payments: Object.freeze({ requested: true }),
        }),
      }),
    }),
    defaults: Object.freeze({
      currency: STRIPE_MERCHANT_CURRENCY,
      locales: ['en-US'] as Array<Stripe.V2.Core.AccountCreateParams.Defaults.Locale>,
      responsibilities: Object.freeze({
        fees_collector: 'stripe',
        losses_collector: 'stripe',
      }),
    }),
    include: [...STRIPE_MERCHANT_RETRIEVE_PARAMS.include],
    metadata: Object.freeze({
      lgq_workspace_id: workspaceId,
      lgq_configuration: STRIPE_MERCHANT_CONFIGURATION_VERSION,
    }),
  });

  const options = Object.freeze({ idempotencyKey: buildMerchantAccountCreateIdempotencyKey(workspaceId) });
  return Object.freeze({
    params,
    // Accounts are platform-level resources. Deliberately no stripeAccount or
    // stripeContext belongs here.
    options,
    requestFingerprint: hashCanonicalJson({
      operation: 'account.create',
      configuration_version: STRIPE_MERCHANT_CONFIGURATION_VERSION,
      params,
      options,
    }),
  });
}

/**
 * Build only an account_onboarding link. Stripe forbids account_update links
 * for accounts with a hosted Dashboard, so this API does not expose that mode.
 */
export function buildMerchantOnboardingLinkCall(input: MerchantOnboardingLinkInput): MerchantOnboardingLinkCall {
  const merchantAccountId = validateStripeMerchantAccountId(input.merchantAccountId);
  const params: Stripe.V2.Core.AccountLinkCreateParams = Object.freeze({
    account: merchantAccountId,
    use_case: Object.freeze({
      type: 'account_onboarding',
      account_onboarding: Object.freeze({
        configurations: ['merchant'] as Array<
          Stripe.V2.Core.AccountLinkCreateParams.UseCase.AccountOnboarding.Configuration
        >,
        collection_options: Object.freeze({
          fields: 'eventually_due',
        }),
        return_url: validateReturnUrl(input.returnUrl, 'returnUrl'),
        refresh_url: validateReturnUrl(input.refreshUrl, 'refreshUrl'),
      }),
    }),
  });
  return Object.freeze({ params });
}

async function submitConfiguredMerchantAccount(call: MerchantAccountCreateCall) {
  return getStripeClient().v2.core.accounts.create(call.params, call.options);
}

export async function createMerchantOnboardingLink(input: MerchantOnboardingLinkInput): Promise<string> {
  const call = buildMerchantOnboardingLinkCall(input);
  const link = await getStripeClient().v2.core.accountLinks.create(call.params);
  return link.url;
}

export async function retrieveMerchantAccountForReadiness(merchantAccountId: string) {
  return getStripeClient().v2.core.accounts.retrieve(
    validateStripeMerchantAccountId(merchantAccountId),
    STRIPE_MERCHANT_RETRIEVE_PARAMS,
  );
}

function canonicalizeJson(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Merchant readiness evidence must contain finite numbers.');
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => canonicalizeJson(item));
  if (typeof value === 'object') {
    const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(value).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) output[key] = canonicalizeJson(child);
    }
    return output;
  }
  throw new Error('Merchant readiness evidence must be JSON-compatible.');
}

export function hashMerchantReadinessSnapshot(snapshot: MerchantReadinessSnapshot): string {
  const digest = createHash('sha256').update(JSON.stringify(canonicalizeJson(snapshot))).digest('hex');
  if (!SHA256_PATTERN.test(digest)) throw new Error('Unable to hash Merchant readiness evidence.');
  return digest;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function validDateIso(now: Date): string {
  if (!Number.isFinite(now.getTime())) throw new Error('verifiedAt must be a valid Date.');
  return now.toISOString();
}

function deriveNotReadyState(input: {
  closed: boolean;
  merchantApplied: boolean;
  cardPaymentsStatus: string | null;
  payoutsStatus: string | null;
  issues: readonly MerchantReadinessIssue[];
}): MerchantOnboardingState {
  if (input.closed || !input.merchantApplied) return 'disabled';

  const structuralIssue = input.issues.some((issue) =>
    issue !== 'card_payments_not_active' && issue !== 'payouts_not_active',
  );
  const stillOnboarding =
    input.cardPaymentsStatus === null ||
    input.cardPaymentsStatus === 'pending' ||
    input.payoutsStatus === null ||
    input.payoutsStatus === 'pending';
  if (stillOnboarding && !structuralIssue) return 'pending';
  return 'restricted';
}

/**
 * Convert one freshly retrieved Accounts v2 response into the exact evidence
 * persisted by the readiness schema. The snapshot intentionally excludes
 * identity, email, metadata, and requirement reference tokens.
 */
export function inspectMerchantReadiness(
  response: Stripe.Response<Stripe.V2.Core.Account>,
  expectedAccountId: string,
  options: { now?: Date; expectedApiVersion?: typeof STRIPE_API_VERSION } = {},
): MerchantReadinessEvidence {
  const accountId = validateStripeMerchantAccountId(expectedAccountId);
  if (response.id !== accountId) {
    throw new Error('Stripe returned a different Merchant account than requested.');
  }

  const now = options.now ?? new Date();
  const verifiedAt = validDateIso(now);
  const expectedApiVersion = options.expectedApiVersion ?? STRIPE_API_VERSION;
  const merchant = response.configuration?.merchant;
  const cardPaymentsStatus = asTrimmedString(merchant?.capabilities?.card_payments?.status);
  const achDebitPaymentsStatus = asTrimmedString(merchant?.capabilities?.ach_debit_payments?.status);
  const payoutsStatus = asTrimmedString(merchant?.capabilities?.stripe_balance?.payouts?.status);
  const feesCollector = asTrimmedString(response.defaults?.responsibilities?.fees_collector);
  const lossesCollector = asTrimmedString(response.defaults?.responsibilities?.losses_collector);
  const requirementsCollector = asTrimmedString(response.defaults?.responsibilities?.requirements_collector);
  const dashboardType = asTrimmedString(response.dashboard);
  const apiVersion = asTrimmedString(response.lastResponse?.apiVersion);
  const requestId = asTrimmedString(response.lastResponse?.requestId);
  const statusCode = Number.isSafeInteger(response.lastResponse?.statusCode)
    ? response.lastResponse.statusCode
    : null;
  const requirements = response.requirements;
  const requirementsStatus = asTrimmedString(requirements?.summary?.minimum_deadline?.status);
  const requirementsEntries = requirements?.entries ?? [];
  const merchantApplied = response.applied_configurations.includes('merchant') && merchant?.applied === true;
  const livemode = typeof response.livemode === 'boolean' ? response.livemode : null;
  const closed = response.closed === true;

  const issues: MerchantReadinessIssue[] = [];
  if (response.object !== 'v2.core.account' || livemode === null || statusCode === null || statusCode < 200 || statusCode >= 300) {
    issues.push('stripe_response_invalid');
  }
  if (closed) issues.push('account_closed');
  if (!response.applied_configurations.includes('merchant')) issues.push('merchant_configuration_not_applied');
  if (merchant?.applied !== true) issues.push('merchant_configuration_inactive');
  if (dashboardType !== 'full') issues.push('dashboard_not_full');
  if (cardPaymentsStatus !== 'active') issues.push('card_payments_not_active');
  if (payoutsStatus !== 'active') issues.push('payouts_not_active');
  if (feesCollector !== 'stripe') issues.push('fees_collector_not_stripe');
  if (lossesCollector !== 'stripe') issues.push('losses_collector_not_stripe');
  if (requirementsCollector !== 'stripe') issues.push('requirements_collector_not_stripe');
  if (requirements === undefined) issues.push('requirements_not_included');
  if (requirementsStatus === 'past_due') issues.push('requirements_past_due');
  if (!apiVersion) issues.push('api_version_missing');
  else if (apiVersion !== expectedApiVersion) issues.push('api_version_mismatch');
  if (!requestId) issues.push('stripe_request_id_missing');

  const ready = issues.length === 0;
  const onboardingState: MerchantOnboardingState = ready
    ? 'ready'
    : deriveNotReadyState({ closed, merchantApplied, cardPaymentsStatus, payoutsStatus, issues });

  const snapshot: MerchantReadinessSnapshot = Object.freeze({
    schema_version: STRIPE_MERCHANT_CONFIGURATION_VERSION,
    account_id: accountId,
    object: response.object,
    livemode,
    closed,
    dashboard: dashboardType,
    applied_configurations: Object.freeze([...response.applied_configurations].sort()),
    merchant: Object.freeze({
      applied: merchantApplied,
      card_payments_status: cardPaymentsStatus,
      ach_debit_payments_status: achDebitPaymentsStatus,
      payouts_status: payoutsStatus,
    }),
    responsibilities: Object.freeze({
      fees_collector: feesCollector,
      losses_collector: lossesCollector,
      requirements_collector: requirementsCollector,
    }),
    requirements: Object.freeze({
      included: requirements !== undefined,
      minimum_deadline_status: requirementsStatus,
      minimum_deadline_time: asTrimmedString(requirements?.summary?.minimum_deadline?.time),
      entry_count: requirementsEntries.length,
      user_action_entry_count: requirementsEntries.filter((entry) => entry.awaiting_action_from === 'user').length,
      error_count: requirementsEntries.reduce((total, entry) => total + (entry.errors?.length ?? 0), 0),
    }),
    stripe_response: Object.freeze({
      api_version: apiVersion,
      expected_api_version: expectedApiVersion,
      request_id: requestId,
      status_code: statusCode,
    }),
    verification: Object.freeze({
      ready,
      issues: Object.freeze([...issues]),
      verified_at: verifiedAt,
    }),
  });

  return Object.freeze({
    accountId,
    livemode,
    dashboardType,
    cardPaymentsActive: cardPaymentsStatus === 'active',
    // Accounts v2 calls the US bank debit capability `ach_debit_payments`.
    usBankAccountPaymentsActive: achDebitPaymentsStatus === 'active',
    payoutsActive: payoutsStatus === 'active',
    feesCollector,
    lossesCollector,
    apiVersion,
    verifiedAt,
    onboardingState,
    ready,
    issues: Object.freeze([...issues]),
    snapshot,
    snapshotSha256: hashMerchantReadinessSnapshot(snapshot),
  });
}

export function buildMerchantReadinessDatabaseUpdate(
  evidence: MerchantReadinessEvidence,
): MerchantReadinessDatabaseUpdate {
  if (!SHA256_PATTERN.test(evidence.snapshotSha256)) {
    throw new Error('Merchant readiness snapshot hash is invalid.');
  }
  if (hashMerchantReadinessSnapshot(evidence.snapshot) !== evidence.snapshotSha256) {
    throw new Error('Merchant readiness snapshot hash does not match its payload.');
  }

  return Object.freeze({
    merchant_onboarding_state: evidence.onboardingState,
    merchant_requirements_checked_at: evidence.verifiedAt,
    merchant_ready_at: evidence.ready ? evidence.verifiedAt : null,
    merchant_disabled_at: evidence.onboardingState === 'disabled' ? evidence.verifiedAt : null,
    merchant_livemode: evidence.livemode,
    merchant_dashboard_type: evidence.dashboardType,
    merchant_card_payments_active: evidence.cardPaymentsActive,
    merchant_us_bank_account_payments_active: evidence.usBankAccountPaymentsActive,
    merchant_payouts_active: evidence.payoutsActive,
    merchant_fees_collector: evidence.feesCollector,
    merchant_losses_collector: evidence.lossesCollector,
    merchant_configuration_api_version: evidence.apiVersion,
    merchant_configuration_snapshot: evidence.snapshot,
    merchant_configuration_snapshot_sha256: evidence.snapshotSha256,
    merchant_configuration_verified_at: evidence.verifiedAt,
  });
}

/** Persist evidence only when it still belongs to this workspace's Merchant. */
export async function persistMerchantReadinessEvidence(
  admin: SupabaseClient,
  workspaceId: string,
  evidence: MerchantReadinessEvidence,
): Promise<void> {
  const normalizedWorkspaceId = validateWorkspaceId(workspaceId);
  const update = buildMerchantReadinessDatabaseUpdate(evidence);
  const { data, error } = await admin
    .from('accounts')
    .update(update)
    .eq('id', normalizedWorkspaceId)
    .eq('stripe_merchant_account_id', evidence.accountId)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Merchant readiness was not persisted because the workspace mapping changed.');
}

type RpcError = Readonly<{ message?: string; code?: string }>;

const MERCHANT_CLAIM_STATUSES = new Set<MerchantProvisioningClaimStatus>([
  'claimed',
  'replay',
  'in_progress',
  'submitted',
  'indeterminate',
]);
const MERCHANT_OPERATION_STATES = new Set<MerchantProvisioningOperationState>([
  'claimed',
  'submitted',
  'succeeded',
  'indeterminate',
]);

function rpcFailure(label: string, error: RpcError | null): Error {
  const detail = error?.message?.trim() || error?.code?.trim() || 'unknown database error';
  return new Error(`${label}: ${detail}`);
}

function requireRpcRecord(value: unknown, label: string): Record<string, unknown> {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error(`${label} returned no operation row.`);
  }
  return row as Record<string, unknown>;
}

function requireRpcString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is missing.`);
  return value;
}

/** Service-role adapter. The migration grants no direct ledger table access. */
export class SupabaseMerchantProvisioningOperationStore implements MerchantProvisioningOperationStore {
  constructor(private readonly admin: SupabaseClient) {}

  async claim(input: MerchantProvisioningClaimInput): Promise<MerchantProvisioningClaim> {
    const { data, error } = await this.admin.rpc('claim_stripe_merchant_provisioning_operation', {
      p_workspace_id: input.workspaceId,
      p_livemode: input.livemode,
      p_stripe_idempotency_key: input.stripeIdempotencyKey,
      p_request_fingerprint: input.requestFingerprint,
    });
    if (error) throw rpcFailure('Unable to claim Stripe Merchant provisioning operation', error);

    const row = requireRpcRecord(data, 'Stripe Merchant provisioning claim');
    const status = requireRpcString(row.claim_status, 'Stripe Merchant claim status');
    const operationState = requireRpcString(row.operation_state, 'Stripe Merchant operation state');
    if (!MERCHANT_CLAIM_STATUSES.has(status as MerchantProvisioningClaimStatus)) {
      throw new Error(`Stripe Merchant claim returned unsupported status: ${status}.`);
    }
    if (!MERCHANT_OPERATION_STATES.has(operationState as MerchantProvisioningOperationState)) {
      throw new Error(`Stripe Merchant claim returned unsupported operation state: ${operationState}.`);
    }

    const claimToken = row.claim_token == null
      ? null
      : requireRpcString(row.claim_token, 'Stripe Merchant claim token');
    const providerAccountId = row.provider_account_id == null
      ? null
      : validateStripeMerchantAccountId(requireRpcString(
        row.provider_account_id,
        'Stripe Merchant provider account ID',
      ));
    if (status === 'claimed' && !claimToken) {
      throw new Error('Stripe Merchant database claim did not return its owner token.');
    }
    if (status === 'replay' && !providerAccountId) {
      throw new Error('Stripe Merchant replay did not return its provider account ID.');
    }

    return Object.freeze({
      status: status as MerchantProvisioningClaimStatus,
      operationPk: requireRpcString(row.operation_pk, 'Stripe Merchant operation primary key'),
      claimToken,
      operationState: operationState as MerchantProvisioningOperationState,
      providerAccountId,
    });
  }

  async beginSubmission(input: { operationPk: string; claimToken: string }): Promise<void> {
    const { data, error } = await this.admin.rpc('begin_stripe_merchant_provisioning_submission', {
      p_operation_pk: input.operationPk,
      p_claim_token: input.claimToken,
    });
    if (error) throw rpcFailure('Unable to begin Stripe Merchant provisioning submission', error);
    if (data !== true) throw new Error('Stripe Merchant begin RPC did not confirm the transition.');
  }

  async complete(input: {
    operationPk: string;
    claimToken: string;
    providerAccountId: string;
    evidence: MerchantReadinessDatabaseUpdate;
  }): Promise<void> {
    const { data, error } = await this.admin.rpc('complete_stripe_merchant_provisioning_operation', {
      p_operation_pk: input.operationPk,
      p_claim_token: input.claimToken,
      p_provider_account_id: input.providerAccountId,
      p_evidence: input.evidence,
    });
    if (error) throw rpcFailure('Unable to complete Stripe Merchant provisioning operation', error);
    if (data !== true) throw new Error('Stripe Merchant completion RPC did not confirm the transition.');
  }

  async markIndeterminate(input: {
    operationPk: string;
    claimToken: string;
    providerAccountId: string | null;
    error: string;
  }): Promise<void> {
    const { data, error } = await this.admin.rpc('mark_stripe_merchant_provisioning_indeterminate', {
      p_operation_pk: input.operationPk,
      p_claim_token: input.claimToken,
      p_provider_account_id: input.providerAccountId,
      p_last_error: input.error,
    });
    if (error) throw rpcFailure('Unable to mark Stripe Merchant provisioning indeterminate', error);
    if (data !== true) throw new Error('Stripe Merchant indeterminate RPC did not confirm the transition.');
  }
}

export class MerchantProvisioningUnavailableError extends Error {
  override readonly name = 'MerchantProvisioningUnavailableError';

  constructor(readonly operationState: MerchantProvisioningOperationState) {
    super(`Stripe Merchant provisioning is ${operationState}; no new Stripe request was sent.`);
  }
}

export class MerchantProvisioningIndeterminateError extends Error {
  override readonly name = 'MerchantProvisioningIndeterminateError';

  constructor(
    message: string,
    readonly providerError: unknown,
    readonly persistenceError?: unknown,
  ) {
    super(message);
  }
}

export class MerchantProvisioningPersistenceError extends Error {
  override readonly name = 'MerchantProvisioningPersistenceError';

  constructor(readonly persistenceError: unknown) {
    super('Stripe returned a Merchant account, but durable completion was not confirmed; do not create again.');
  }
}

function configuredStripeLivemode(): boolean {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? '';
  const match = STRIPE_SECRET_KEY_MODE_PATTERN.exec(key);
  if (!match) {
    throw new Error('STRIPE_SECRET_KEY is missing or does not declare test/live mode.');
  }
  return match[1] === 'live';
}

function errorForAudit(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, 2000);
  if (typeof error === 'string') return error.slice(0, 2000);
  return 'Stripe Merchant submission failed with a non-Error value; outcome requires reconciliation.';
}

function observedMerchantAccountId(value: unknown): string | null {
  if (typeof value !== 'string' || !STRIPE_ACCOUNT_ID_PATTERN.test(value.trim())) return null;
  return value.trim();
}

function defaultMerchantProvisioningDependencies(admin: SupabaseClient): MerchantProvisioningDependencies {
  return Object.freeze({
    store: new SupabaseMerchantProvisioningOperationStore(admin),
    createAccount: submitConfiguredMerchantAccount,
  });
}

/**
 * Create an Accounts v2 Merchant behind a durable one-workspace operation.
 * This is dark launched: no route or existing Recipient flow imports it.
 */
export async function provisionMerchantAccount(
  admin: SupabaseClient,
  input: MerchantAccountCreateInput,
  options: { now?: Date } = {},
  dependencies: MerchantProvisioningDependencies = defaultMerchantProvisioningDependencies(admin),
): Promise<{ accountId: string; created: boolean; evidence: MerchantReadinessEvidence | null }> {
  // Pure construction validates and snapshots every caller-owned create value
  // before an await. The fingerprint and Stripe idempotency key are then
  // immutable inputs to the database claim.
  const call = buildMerchantAccountCreateCall({ ...input });
  const workspaceId = validateWorkspaceId(input.workspaceId);
  const livemode = configuredStripeLivemode();
  const claim = await dependencies.store.claim({
    workspaceId,
    livemode,
    stripeIdempotencyKey: call.options.idempotencyKey,
    requestFingerprint: call.requestFingerprint,
  });

  if (claim.status === 'replay') {
    return Object.freeze({
      accountId: validateStripeMerchantAccountId(claim.providerAccountId!),
      created: false,
      evidence: null,
    });
  }
  if (claim.status !== 'claimed' || !claim.claimToken) {
    throw new MerchantProvisioningUnavailableError(claim.operationState);
  }

  // If this response is lost after commit, the operation remains submitted and
  // every replay is blocked before Stripe. This branch must never auto-retry.
  await dependencies.store.beginSubmission({
    operationPk: claim.operationPk,
    claimToken: claim.claimToken,
  });

  let response: Stripe.Response<Stripe.V2.Core.Account> | undefined;
  let evidence: MerchantReadinessEvidence;
  try {
    response = await dependencies.createAccount(call);
    const providerAccountId = validateStripeMerchantAccountId(response.id);
    assertMerchantWorkspaceBinding(response, workspaceId);
    if (response.livemode !== livemode) {
      throw new Error('Stripe Merchant account livemode does not match the configured Stripe key.');
    }
    evidence = inspectMerchantReadiness(response, providerAccountId, options);
  } catch (providerError) {
    let persistenceError: unknown;
    try {
      await dependencies.store.markIndeterminate({
        operationPk: claim.operationPk,
        claimToken: claim.claimToken,
        providerAccountId: observedMerchantAccountId(response?.id),
        error: errorForAudit(providerError),
      });
    } catch (markError) {
      persistenceError = markError;
    }
    throw new MerchantProvisioningIndeterminateError(
      'Stripe Merchant submission outcome requires reconciliation; no automatic retry is allowed.',
      providerError,
      persistenceError,
    );
  }

  try {
    await dependencies.store.complete({
      operationPk: claim.operationPk,
      claimToken: claim.claimToken,
      providerAccountId: evidence.accountId,
      evidence: buildMerchantReadinessDatabaseUpdate(evidence),
    });
  } catch (persistenceError) {
    // Completion may have committed even if its HTTP response was lost. The
    // next database claim decides replay vs recovery; Stripe is not called here.
    throw new MerchantProvisioningPersistenceError(persistenceError);
  }

  return Object.freeze({ accountId: evidence.accountId, created: true, evidence });
}

/** Freshly retrieve the stored Merchant, verify it, then persist the evidence. */
export async function verifyAndPersistMerchantReadiness(
  admin: SupabaseClient,
  workspaceId: string,
  options: { now?: Date } = {},
): Promise<MerchantReadinessEvidence> {
  const normalizedWorkspaceId = validateWorkspaceId(workspaceId);
  const { data: account, error } = await admin
    .from('accounts')
    .select('stripe_merchant_account_id')
    .eq('id', normalizedWorkspaceId)
    .single();
  if (error) throw error;
  if (!account?.stripe_merchant_account_id) {
    throw new Error('Workspace does not have a Stripe Merchant account.');
  }

  const merchantAccountId = validateStripeMerchantAccountId(account.stripe_merchant_account_id);
  const response = await retrieveMerchantAccountForReadiness(merchantAccountId);
  assertMerchantWorkspaceBinding(response, normalizedWorkspaceId);
  const evidence = inspectMerchantReadiness(response, merchantAccountId, options);
  await persistMerchantReadinessEvidence(admin, normalizedWorkspaceId, evidence);
  return evidence;
}

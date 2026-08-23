import 'server-only';

import { requireOwnerContext } from '@/lib/auth';
import {
  BILLING_PLANS,
  PRICING_CATALOG_VERSION,
  basePriceCents,
  type BillingCycle,
  type BillingPlanId,
} from '@/lib/billing/catalog';
import {
  BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256,
  BASE_PLAN_RECURRING_CONSENT_VERSION,
} from '@/lib/billing/subscription-consent';
import { TERMS_VERSION } from '@/lib/terms';

export type PaidBasePlanId = Exclude<BillingPlanId, 'flex'>;

export type SubscriptionConsentOwnerContext = Pick<
  Awaited<ReturnType<typeof requireOwnerContext>>,
  'supabase' | 'accountId' | 'userId'
>;

export type AuthenticatedSubscriptionConsentEvidence = Readonly<{
  acceptanceId: string;
  workspaceId: string;
  operationId: string;
  acceptedBy: string;
  acceptedAt: string;
  expiresAt: string;
  planCode: PaidBasePlanId;
  billingInterval: BillingCycle;
  catalogVersion: typeof PRICING_CATALOG_VERSION;
  unitAmountCents: number;
  currency: 'usd';
  termsVersion: typeof TERMS_VERSION;
  recurringConsentVersion: typeof BASE_PLAN_RECURRING_CONSENT_VERSION;
  recurringConsentTextSha256: typeof BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256;
}>;

type RpcError = Readonly<{ message?: string; code?: string }>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requirePaidPlan(value: PaidBasePlanId): PaidBasePlanId {
  if (value !== 'solo' && value !== 'growth' && value !== 'scale') {
    throw new Error('Recurring subscription consent only supports Solo, Growth, or Scale.');
  }
  return value;
}

function requireBillingInterval(value: BillingCycle): BillingCycle {
  if (value !== 'monthly' && value !== 'annual') {
    throw new Error('Recurring subscription consent requires monthly or annual billing.');
  }
  return value;
}

function requireOperationId(value: string): string {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized.length > 200 || /\p{Cc}/u.test(normalized)) {
    throw new Error('Recurring subscription consent operation ID is invalid.');
  }
  return normalized;
}

function rpcFailure(error: RpcError | null): Error {
  const detail = error?.message?.trim() || error?.code?.trim() || 'unknown database error';
  return new Error(`Unable to record recurring subscription consent: ${detail}`);
}

function requireRecord(value: unknown): Record<string, unknown> {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error('Recurring subscription consent RPC returned no evidence row.');
  }
  return row as Record<string, unknown>;
}

function requireExactString(value: unknown, expected: string, label: string): string {
  if (value !== expected) throw new Error(`Recurring subscription consent ${label} drifted.`);
  return expected;
}

function requireUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new Error(`Recurring subscription consent ${label} is invalid.`);
  }
  return value.toLowerCase();
}

function requireTimestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error(`Recurring subscription consent ${label} is invalid.`);
  }
  return value;
}

/**
 * Records affirmative recurring-billing assent from the current authenticated
 * owner. This is dark: no route or button calls it yet. The database captures
 * auth.uid() itself and binds the resulting single-use evidence to the exact
 * future Checkout operation and price contract.
 */
export type RecordBasePlanSubscriptionConsentInput = Readonly<{
  operationId: string;
  planCode: PaidBasePlanId;
  billingInterval: BillingCycle;
  accepted: boolean;
}>;

/**
 * Records consent with an owner context already resolved by a surrounding
 * server action. Keeping this seam avoids a second auth/Terms redirect inside
 * an action's provider-error boundary while preserving the database's own
 * auth.uid(), membership, Flex, Terms, amount, and artifact checks.
 */
/**
 * The two recorders differ only in which RPC they call.
 *
 * `record_base_plan_recurring_consent` writes `purpose = 'base_plan_subscription'`
 * and demands the workspace be on active Flex;
 * `record_base_plan_plan_change_consent` writes `base_plan_plan_change` and
 * demands the inverse -- an active PAID workspace. Both pin the identical
 * artifact: same Terms version, same consent version, same text digest, same
 * canonical amounts. That is not a coincidence to be tidied away later; the
 * plan-change ledger's 13-column consent FK and the checkout table's own
 * hash CHECK both require exactly this artifact, so a divergence here fails
 * closed at the claim rather than silently accepting weaker evidence.
 */
async function recordConsentVia(
  rpc: 'record_base_plan_recurring_consent' | 'record_base_plan_plan_change_consent',
  owner: SubscriptionConsentOwnerContext,
  input: RecordBasePlanSubscriptionConsentInput,
): Promise<AuthenticatedSubscriptionConsentEvidence> {
  if (input.accepted !== true) {
    throw new Error('Recurring subscription consent must be affirmatively accepted.');
  }

  const operationId = requireOperationId(input.operationId);
  const planCode = requirePaidPlan(input.planCode);
  const billingInterval = requireBillingInterval(input.billingInterval);
  const unitAmountCents = basePriceCents(BILLING_PLANS[planCode], billingInterval);
  const { supabase, accountId, userId } = owner;

  const { data, error } = await supabase.rpc(rpc, {
    p_account_id: accountId,
    p_operation_id: operationId,
    p_plan_code: planCode,
    p_billing_interval: billingInterval,
    p_catalog_version: PRICING_CATALOG_VERSION,
    p_unit_amount_cents: unitAmountCents,
    p_currency: 'usd',
    p_terms_version: TERMS_VERSION,
    p_recurring_consent_version: BASE_PLAN_RECURRING_CONSENT_VERSION,
    p_recurring_consent_text_sha256: BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256,
  });
  if (error) throw rpcFailure(error);

  const row = requireRecord(data);
  const acceptedAt = requireTimestamp(row.accepted_at, 'accepted-at timestamp');
  const expiresAt = requireTimestamp(row.expires_at, 'expiry timestamp');
  if (Date.parse(expiresAt) <= Date.parse(acceptedAt)) {
    throw new Error('Recurring subscription consent evidence has an invalid validity window.');
  }
  if (row.unit_amount_cents !== unitAmountCents) {
    throw new Error('Recurring subscription consent amount drifted.');
  }

  return Object.freeze({
    acceptanceId: requireUuid(row.acceptance_id, 'acceptance ID'),
    workspaceId: requireExactString(row.account_id, accountId, 'workspace'),
    operationId: requireExactString(row.operation_id, operationId, 'operation ID'),
    acceptedBy: requireUuid(
      requireExactString(row.accepted_by, userId, 'authenticated actor'),
      'authenticated actor',
    ),
    acceptedAt,
    expiresAt,
    planCode: requireExactString(row.plan_code, planCode, 'plan') as PaidBasePlanId,
    billingInterval: requireExactString(
      row.billing_interval,
      billingInterval,
      'billing interval',
    ) as BillingCycle,
    catalogVersion: requireExactString(
      row.catalog_version,
      PRICING_CATALOG_VERSION,
      'catalog version',
    ) as typeof PRICING_CATALOG_VERSION,
    unitAmountCents,
    currency: requireExactString(row.currency, 'usd', 'currency') as 'usd',
    termsVersion: requireExactString(
      row.terms_version,
      TERMS_VERSION,
      'Terms version',
    ) as typeof TERMS_VERSION,
    recurringConsentVersion: requireExactString(
      row.recurring_consent_version,
      BASE_PLAN_RECURRING_CONSENT_VERSION,
      'artifact version',
    ) as typeof BASE_PLAN_RECURRING_CONSENT_VERSION,
    recurringConsentTextSha256: requireExactString(
      row.recurring_consent_text_sha256,
      BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256,
      'artifact hash',
    ) as typeof BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256,
  });
}

export async function recordBasePlanSubscriptionConsentForOwner(
  owner: SubscriptionConsentOwnerContext,
  input: RecordBasePlanSubscriptionConsentInput,
): Promise<AuthenticatedSubscriptionConsentEvidence> {
  return recordConsentVia('record_base_plan_recurring_consent', owner, input);
}

/**
 * Consent for a plan change, recorded before the operation is claimed.
 *
 * The acceptance is single-use and bound to the exact operation id, plan,
 * interval and amount, so it must be minted against the SAME operation id the
 * claim will use or `claim_stripe_billing_subscription_plan_change` refuses with
 * 'matching authenticated plan-change consent evidence was not found'.
 */
export async function recordBasePlanPlanChangeConsentForOwner(
  owner: SubscriptionConsentOwnerContext,
  input: RecordBasePlanSubscriptionConsentInput,
): Promise<AuthenticatedSubscriptionConsentEvidence> {
  return recordConsentVia('record_base_plan_plan_change_consent', owner, input);
}

export async function recordAuthenticatedBasePlanSubscriptionConsent(
  input: RecordBasePlanSubscriptionConsentInput,
): Promise<AuthenticatedSubscriptionConsentEvidence> {
  // Preserve the original boundary: refusal is rejected before auth or any
  // database call, even when this convenience wrapper is used directly.
  if (input.accepted !== true) {
    throw new Error('Recurring subscription consent must be affirmatively accepted.');
  }
  return recordBasePlanSubscriptionConsentForOwner(await requireOwnerContext(), input);
}

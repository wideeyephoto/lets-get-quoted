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
export async function recordAuthenticatedBasePlanSubscriptionConsent(input: {
  operationId: string;
  planCode: PaidBasePlanId;
  billingInterval: BillingCycle;
  accepted: boolean;
}): Promise<AuthenticatedSubscriptionConsentEvidence> {
  if (input.accepted !== true) {
    throw new Error('Recurring subscription consent must be affirmatively accepted.');
  }

  const operationId = requireOperationId(input.operationId);
  const planCode = requirePaidPlan(input.planCode);
  const billingInterval = requireBillingInterval(input.billingInterval);
  const unitAmountCents = basePriceCents(BILLING_PLANS[planCode], billingInterval);
  const { supabase, accountId, userId } = await requireOwnerContext();

  const { data, error } = await supabase.rpc('record_base_plan_recurring_consent', {
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

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createAdminClient } from '@/lib/auth';
import {
  BILLING_PLANS,
  BILLING_PLAN_IDS,
  PRICING_CATALOG_VERSION,
  platformFeeCents,
  type BillingPlanId,
} from '@/lib/billing/catalog';
import type { PaymentFeeSnapshot } from '@/lib/billing/payment-fee';

/**
 * Dark service-only adapter for the database-owned preparation transition.
 *
 * Nothing imports this module from a route or active payment path. The adapter
 * supplies identities only; the RPC derives and persists Merchant, entitlement,
 * invoice, allocation, and fee facts under locks before returning the immutable
 * snapshot consumed by the existing direct Checkout orchestrator.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STRIPE_ACCOUNT_ID_PATTERN = /^acct_[A-Za-z0-9]{8,}$/;

export type DirectPaymentPreparationInput = Readonly<{
  accountId: string;
  jobId: string;
  invoiceId: string;
  paymentId: string;
}>;

export type PreparedOneOffDirectInvoicePayment = Readonly<{
  status: 'prepared' | 'replay';
  accountId: string;
  jobId: string;
  invoiceId: string;
  paymentId: string;
  merchantAccountId: string;
  livemode: boolean;
  reconciliationStatus: 'pending';
  feeSnapshot: PaymentFeeSnapshot;
}>;

type RpcError = Readonly<{ message?: string; code?: string }>;

function rpcFailure(error: RpcError | null): Error {
  const detail = error?.message?.trim() || error?.code?.trim() || 'unknown database error';
  return new Error(`Unable to prepare one-off direct invoice payment: ${detail}`);
}

function normalizedUuid(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) throw new Error(`${label} must be a valid UUID.`);
  return normalized;
}

function preparationInput(input: DirectPaymentPreparationInput): DirectPaymentPreparationInput {
  return Object.freeze({
    accountId: normalizedUuid(input.accountId, 'accountId'),
    jobId: normalizedUuid(input.jobId, 'jobId'),
    invoiceId: normalizedUuid(input.invoiceId, 'invoiceId'),
    paymentId: normalizedUuid(input.paymentId, 'paymentId'),
  });
}

function rpcRecord(value: unknown): Record<string, unknown> {
  if (Array.isArray(value) && value.length !== 1) {
    throw new Error('Direct payment preparation must return exactly one snapshot row.');
  }
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error('Direct payment preparation returned no snapshot row.');
  }
  return row as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Direct payment preparation ${label} is missing.`);
  }
  return value.trim();
}

function requiredUuid(value: unknown, label: string): string {
  return normalizedUuid(requiredString(value, label), label);
}

function safeInteger(value: unknown, label: string): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^-?[0-9]+$/.test(value.trim())
      ? Number(value)
      : Number.NaN;
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Direct payment preparation ${label} must be a safe integer.`);
  }
  return parsed;
}

function finiteNumber(value: unknown, label: string): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(parsed)) {
    throw new Error(`Direct payment preparation ${label} must be finite.`);
  }
  return parsed;
}

function isBillingPlanId(value: string): value is BillingPlanId {
  return (BILLING_PLAN_IDS as readonly string[]).includes(value);
}

function parsePreparedPayment(
  value: unknown,
  expected: DirectPaymentPreparationInput,
): PreparedOneOffDirectInvoicePayment {
  const row = rpcRecord(value);
  const status = requiredString(row.preparation_status, 'status');
  if (status !== 'prepared' && status !== 'replay') {
    throw new Error(`Direct payment preparation returned unsupported status: ${status}.`);
  }

  const identity = Object.freeze({
    accountId: requiredUuid(row.account_id, 'accountId'),
    jobId: requiredUuid(row.job_id, 'jobId'),
    invoiceId: requiredUuid(row.invoice_id, 'invoiceId'),
    paymentId: requiredUuid(row.payment_id, 'paymentId'),
  });
  if (
    identity.accountId !== expected.accountId
    || identity.jobId !== expected.jobId
    || identity.invoiceId !== expected.invoiceId
    || identity.paymentId !== expected.paymentId
  ) {
    throw new Error('Direct payment preparation returned a different immutable row identity.');
  }

  const merchantAccountId = requiredString(row.merchant_account_id, 'Merchant account ID');
  if (!STRIPE_ACCOUNT_ID_PATTERN.test(merchantAccountId)) {
    throw new Error('Direct payment preparation returned an invalid Merchant account ID.');
  }
  if (typeof row.livemode !== 'boolean') {
    throw new Error('Direct payment preparation returned no explicit Stripe mode.');
  }

  const planCode = requiredString(row.plan_code, 'plan code');
  if (!isBillingPlanId(planCode)) {
    throw new Error(`Direct payment preparation returned unsupported plan: ${planCode}.`);
  }
  const catalogVersion = requiredString(row.catalog_version, 'catalog version');
  if (catalogVersion !== PRICING_CATALOG_VERSION) {
    throw new Error(`Direct payment preparation returned unsupported catalog: ${catalogVersion}.`);
  }

  const feeRateBps = safeInteger(row.fee_rate_bps, 'feeRateBps');
  const feeRate = finiteNumber(row.fee_rate, 'feeRate');
  const grossAmountCents = safeInteger(row.gross_amount_cents, 'grossAmountCents');
  const eligibleServiceSubtotalCents = safeInteger(
    row.eligible_service_subtotal_cents,
    'eligibleServiceSubtotalCents',
  );
  const applicationFeeCents = safeInteger(row.application_fee_cents, 'applicationFeeCents');
  const canonicalPlan = BILLING_PLANS[planCode];

  if (grossAmountCents <= 0) {
    throw new Error('Direct payment preparation grossAmountCents must be positive.');
  }
  if (
    eligibleServiceSubtotalCents < 0
    || eligibleServiceSubtotalCents > grossAmountCents
    || applicationFeeCents < 0
    || applicationFeeCents > eligibleServiceSubtotalCents
  ) {
    throw new Error('Direct payment preparation returned an invalid fee allocation.');
  }
  if (
    feeRateBps !== canonicalPlan.platformFeeBps
    || feeRate !== feeRateBps / 10_000
    || applicationFeeCents !== platformFeeCents(eligibleServiceSubtotalCents, canonicalPlan)
  ) {
    throw new Error('Direct payment preparation does not match the canonical plan fee.');
  }
  if (row.reconciliation_status !== 'pending') {
    throw new Error('Direct payment preparation must begin reconciliation pending.');
  }

  const feeSnapshot = Object.freeze({
    planCode,
    catalogVersion: PRICING_CATALOG_VERSION,
    feeRateBps,
    feeRate,
    grossAmountCents,
    eligibleServiceSubtotalCents,
    applicationFeeCents,
  }) satisfies PaymentFeeSnapshot;

  return Object.freeze({
    status,
    ...identity,
    merchantAccountId,
    livemode: row.livemode,
    reconciliationStatus: 'pending',
    feeSnapshot,
  });
}

export class SupabaseDirectPaymentPreparationStore {
  constructor(private readonly admin: SupabaseClient = createAdminClient()) {}

  async prepare(input: DirectPaymentPreparationInput): Promise<PreparedOneOffDirectInvoicePayment> {
    const normalized = preparationInput(input);
    const { data, error } = await this.admin.rpc('prepare_one_off_direct_invoice_payment', {
      p_account_id: normalized.accountId,
      p_job_id: normalized.jobId,
      p_invoice_id: normalized.invoiceId,
      p_payment_id: normalized.paymentId,
    });
    if (error) throw rpcFailure(error);
    return parsePreparedPayment(data, normalized);
  }
}

export async function prepareOneOffDirectInvoicePayment(
  input: DirectPaymentPreparationInput,
  store: Pick<SupabaseDirectPaymentPreparationStore, 'prepare'> = new SupabaseDirectPaymentPreparationStore(),
): Promise<PreparedOneOffDirectInvoicePayment> {
  return store.prepare(input);
}

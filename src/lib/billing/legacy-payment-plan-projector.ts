import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createAdminClient } from '@/lib/auth';

/**
 * Dark server-only adapter for the transactional legacy payment-plan projector.
 *
 * No route, webhook, payoff action, or cron imports this module. The caller must
 * already have persisted verified legacy destination-payment truth. This adapter
 * supplies only the payment identity and optional saved-card evidence; the RPC
 * locks, derives, verifies, and commits every plan-side effect in a single transaction.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STRIPE_CUSTOMER_PATTERN = /^cus_[A-Za-z0-9_]+$/;
const STRIPE_PAYMENT_METHOD_PATTERN = /^pm_[A-Za-z0-9_]+$/;
const CARD_LAST4_PATTERN = /^[0-9]{4}$/;

export const LEGACY_PAYMENT_PLAN_PROJECTION_STATUSES = [
  'activated',
  'activation_repaired',
  'activation_replay',
  'payoff_finalized',
  'payoff_repaired',
  'payoff_replay',
  'payoff_lock_released',
  'payoff_lock_release_replay',
  'stale_payoff_noop',
] as const;

export type LegacyPaymentPlanProjectionStatus =
  (typeof LEGACY_PAYMENT_PLAN_PROJECTION_STATUSES)[number];

export type LegacyPaymentPlanProjectionInput = Readonly<{
  paymentId: string;
  stripeCustomerId?: string | null;
  stripePaymentMethodId?: string | null;
  cardBrand?: string | null;
  cardLast4?: string | null;
}>;

export type LegacyPaymentPlanProjectionResult = Readonly<{
  status: LegacyPaymentPlanProjectionStatus;
  paymentId: string;
  paymentPlanId: string;
  planStatus: 'pending_deposit' | 'active' | 'paid_off' | 'canceled';
  installmentCount: number;
  canceledPaymentCount: number;
  feedRecorded: boolean;
}>;

type NormalizedProjectionInput = Readonly<{
  paymentId: string;
  stripeCustomerId: string | null;
  stripePaymentMethodId: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
}>;

type RpcError = Readonly<{ message?: string; code?: string }>;

function projectionFailure(error: RpcError | null): Error {
  const detail = error?.message?.trim() || error?.code?.trim() || 'unknown database error';
  return new Error(`Unable to project legacy payment-plan payment: ${detail}`);
}

function normalizedUuid(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) throw new Error(`${label} must be a valid UUID.`);
  return normalized;
}

function optionalPattern(
  value: string | null | undefined,
  pattern: RegExp,
  label: string,
): string | null {
  if (value == null) return null;
  const normalized = value.trim();
  if (!pattern.test(normalized)) throw new Error(`${label} is malformed.`);
  return normalized;
}

function optionalCardBrand(value: string | null | undefined): string | null {
  if (value == null) return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > 32) throw new Error('cardBrand is malformed.');
  return normalized;
}

function normalizedInput(input: LegacyPaymentPlanProjectionInput): NormalizedProjectionInput {
  return Object.freeze({
    paymentId: normalizedUuid(input.paymentId, 'paymentId'),
    stripeCustomerId: optionalPattern(
      input.stripeCustomerId,
      STRIPE_CUSTOMER_PATTERN,
      'stripeCustomerId',
    ),
    stripePaymentMethodId: optionalPattern(
      input.stripePaymentMethodId,
      STRIPE_PAYMENT_METHOD_PATTERN,
      'stripePaymentMethodId',
    ),
    cardBrand: optionalCardBrand(input.cardBrand),
    cardLast4: optionalPattern(input.cardLast4, CARD_LAST4_PATTERN, 'cardLast4'),
  });
}

function exactlyOneRow(value: unknown): Record<string, unknown> {
  if (!Array.isArray(value) || value.length !== 1) {
    throw new Error('Legacy payment-plan projection must return exactly one result row.');
  }
  const row = value[0];
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error('Legacy payment-plan projection returned no result row.');
  }
  return row as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Legacy payment-plan projection ${label} is missing.`);
  }
  return value.trim();
}

function nonnegativeSafeInteger(value: unknown, label: string): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^[0-9]+$/.test(value.trim())
      ? Number(value)
      : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Legacy payment-plan projection ${label} must be a nonnegative safe integer.`);
  }
  return parsed;
}

function isProjectionStatus(value: string): value is LegacyPaymentPlanProjectionStatus {
  return (LEGACY_PAYMENT_PLAN_PROJECTION_STATUSES as readonly string[]).includes(value);
}

function parseProjectionResult(
  value: unknown,
  input: NormalizedProjectionInput,
): LegacyPaymentPlanProjectionResult {
  const row = exactlyOneRow(value);
  const status = requiredString(row.projection_status, 'status');
  if (!isProjectionStatus(status)) {
    throw new Error(`Legacy payment-plan projection returned unsupported status: ${status}.`);
  }

  const paymentPlanId = normalizedUuid(
    requiredString(row.payment_plan_id, 'paymentPlanId'),
    'paymentPlanId',
  );
  const planStatus = requiredString(row.projected_plan_status, 'planStatus');
  if (!['pending_deposit', 'active', 'paid_off', 'canceled'].includes(planStatus)) {
    throw new Error(`Legacy payment-plan projection returned unsupported plan status: ${planStatus}.`);
  }

  const installmentCount = nonnegativeSafeInteger(
    row.projected_installment_count,
    'installmentCount',
  );
  const canceledPaymentCount = nonnegativeSafeInteger(
    row.canceled_payment_count,
    'canceledPaymentCount',
  );
  if (installmentCount > 24) {
    throw new Error('Legacy payment-plan projection installmentCount exceeds the supported maximum.');
  }
  if (canceledPaymentCount > installmentCount + 1) {
    throw new Error('Legacy payment-plan projection canceledPaymentCount exceeds plan capacity.');
  }
  if (typeof row.feed_recorded !== 'boolean') {
    throw new Error('Legacy payment-plan projection feedRecorded must be explicit.');
  }

  const activation = status === 'activated'
    || status === 'activation_repaired'
    || status === 'activation_replay';
  const finalized = status.startsWith('payoff_')
    && ['payoff_finalized', 'payoff_repaired', 'payoff_replay'].includes(status);
  const lockOnly = status === 'payoff_lock_released'
    || status === 'payoff_lock_release_replay'
    || status === 'stale_payoff_noop';

  if (activation && (planStatus !== 'active' || row.feed_recorded !== true || canceledPaymentCount !== 0)) {
    throw new Error('Legacy payment-plan activation result is internally inconsistent.');
  }
  if (finalized && (planStatus !== 'paid_off' || row.feed_recorded !== true)) {
    throw new Error('Legacy payment-plan payoff result is internally inconsistent.');
  }
  if (lockOnly && (row.feed_recorded !== false || canceledPaymentCount !== 0)) {
    throw new Error('Legacy payment-plan payoff-lock result is internally inconsistent.');
  }

  return Object.freeze({
    status,
    paymentId: input.paymentId,
    paymentPlanId,
    planStatus: planStatus as LegacyPaymentPlanProjectionResult['planStatus'],
    installmentCount,
    canceledPaymentCount,
    feedRecorded: row.feed_recorded,
  });
}

export class SupabaseLegacyPaymentPlanProjectionStore {
  constructor(private readonly admin: SupabaseClient = createAdminClient()) {}

  async project(
    input: LegacyPaymentPlanProjectionInput,
  ): Promise<LegacyPaymentPlanProjectionResult> {
    const normalized = normalizedInput(input);
    const { data, error } = await this.admin.rpc('project_legacy_payment_plan_payment', {
      p_payment_id: normalized.paymentId,
      p_stripe_customer_id: normalized.stripeCustomerId,
      p_stripe_payment_method_id: normalized.stripePaymentMethodId,
      p_card_brand: normalized.cardBrand,
      p_card_last4: normalized.cardLast4,
    });
    if (error) throw projectionFailure(error);
    return parseProjectionResult(data, normalized);
  }
}

export async function projectLegacyPaymentPlanPayment(
  input: LegacyPaymentPlanProjectionInput,
  store: Pick<SupabaseLegacyPaymentPlanProjectionStore, 'project'> =
    new SupabaseLegacyPaymentPlanProjectionStore(),
): Promise<LegacyPaymentPlanProjectionResult> {
  return store.project(input);
}

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createAdminClient } from '@/lib/auth';

/**
 * Dark adapter for binding an existing legacy payoff payment to its plan lock.
 *
 * The RPC derives all financial facts under database locks. This adapter sends
 * identities only; it never accepts an amount, lock timestamp, account, job, or
 * provider object from a caller.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const LEGACY_PAYOFF_OWNER_BINDING_STATUSES = [
  'bound',
  'already_bound',
] as const;

export type LegacyPayoffOwnerBindingStatus =
  (typeof LEGACY_PAYOFF_OWNER_BINDING_STATUSES)[number];

export type LegacyPayoffOwnerBindingInput = Readonly<{
  paymentPlanId: string;
  paymentId: string;
}>;

export type LegacyPayoffOwnerBindingResult = Readonly<{
  status: LegacyPayoffOwnerBindingStatus;
  paymentPlanId: string;
  paymentId: string;
  lockedAt: string;
  remainingCents: number;
}>;

type NormalizedInput = Readonly<{
  paymentPlanId: string;
  paymentId: string;
}>;

type RpcError = Readonly<{ message?: string; code?: string }>;

function normalizeUuid(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) throw new Error(`${label} must be a valid UUID.`);
  return normalized;
}

function normalizeInput(input: LegacyPayoffOwnerBindingInput): NormalizedInput {
  return Object.freeze({
    paymentPlanId: normalizeUuid(input.paymentPlanId, 'paymentPlanId'),
    paymentId: normalizeUuid(input.paymentId, 'paymentId'),
  });
}

function exactlyOneRow(value: unknown): Record<string, unknown> {
  if (!Array.isArray(value) || value.length !== 1) {
    throw new Error('Legacy payoff-owner binding must return exactly one result row.');
  }
  const row = value[0];
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error('Legacy payoff-owner binding returned no result row.');
  }
  return row as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Legacy payoff-owner binding ${label} is missing.`);
  }
  return value.trim();
}

function positiveSafeInteger(value: unknown, label: string): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^[0-9]+$/.test(value.trim())
      ? Number(value)
      : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Legacy payoff-owner binding ${label} must be a positive safe integer.`);
  }
  return parsed;
}

function exactIsoTimestamp(value: unknown): string {
  const timestamp = requiredString(value, 'lockedAt');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp)
      || Number.isNaN(Date.parse(timestamp))) {
    throw new Error('Legacy payoff-owner binding lockedAt must be an ISO timestamp with a timezone.');
  }
  return timestamp;
}

function bindingFailure(error: RpcError | null): Error {
  const detail = error?.message?.trim() || error?.code?.trim() || 'unknown database error';
  return new Error(`Unable to bind legacy payment-plan payoff owner: ${detail}`);
}

function parseResult(
  value: unknown,
  input: NormalizedInput,
): LegacyPayoffOwnerBindingResult {
  const row = exactlyOneRow(value);
  const status = requiredString(row.binding_status, 'status');
  if (!(LEGACY_PAYOFF_OWNER_BINDING_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`Legacy payoff-owner binding returned unsupported status: ${status}.`);
  }

  const paymentPlanId = normalizeUuid(
    requiredString(row.payment_plan_id, 'paymentPlanId'),
    'paymentPlanId',
  );
  const paymentId = normalizeUuid(
    requiredString(row.payoff_payment_id, 'paymentId'),
    'paymentId',
  );
  if (paymentPlanId !== input.paymentPlanId || paymentId !== input.paymentId) {
    throw new Error('Legacy payoff-owner binding returned a different plan or payment identity.');
  }

  return Object.freeze({
    status: status as LegacyPayoffOwnerBindingStatus,
    paymentPlanId,
    paymentId,
    lockedAt: exactIsoTimestamp(row.locked_at),
    remainingCents: positiveSafeInteger(row.remaining_cents, 'remainingCents'),
  });
}

export class SupabaseLegacyPayoffOwnerBindingStore {
  constructor(private readonly admin: SupabaseClient = createAdminClient()) {}

  async bind(
    input: LegacyPayoffOwnerBindingInput,
  ): Promise<LegacyPayoffOwnerBindingResult> {
    const normalized = normalizeInput(input);
    const { data, error } = await this.admin.rpc('bind_legacy_payment_plan_payoff_owner', {
      p_payment_plan_id: normalized.paymentPlanId,
      p_payment_id: normalized.paymentId,
    });
    if (error) throw bindingFailure(error);
    return parseResult(data, normalized);
  }
}

export async function bindLegacyPaymentPlanPayoffOwner(
  input: LegacyPayoffOwnerBindingInput,
  store: Pick<SupabaseLegacyPayoffOwnerBindingStore, 'bind'> =
    new SupabaseLegacyPayoffOwnerBindingStore(),
): Promise<LegacyPayoffOwnerBindingResult> {
  return store.bind(input);
}

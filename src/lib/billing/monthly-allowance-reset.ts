import 'server-only';

import { createAdminClient } from '@/lib/auth';

/**
 * DARK server-only adapter for one atomic paid-plan allowance reset.
 *
 * Nothing in src/app imports this module. A future scheduler supplies only a
 * workspace ID; plan, cadence, calendar window, catalog, and all four unit
 * amounts remain database-owned.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PaidPlanMonthlyAllowanceResetStatus =
  | 'completed'
  | 'blocked_catchup'
  | 'not_due'
  | 'not_eligible';

export type PaidPlanMonthlyAllowanceResetReason =
  | 'subscription_not_live'
  | 'subscription_not_active'
  | 'entitlement_not_active'
  | 'allowance_schedule_missing'
  | 'current_provider_period_not_paid'
  | 'waiting_for_provider_period'
  | 'allowance_window_not_started'
  | 'catchup_requires_reconciliation';

export type PaidPlanMonthlyAllowanceResetResult = Readonly<{
  status: PaidPlanMonthlyAllowanceResetStatus;
  operationId: string | null;
  workspaceId: string;
  billingSubscriptionId: string | null;
  allowanceWindowStart: string | null;
  allowanceWindowEnd: string | null;
  insertedLotCount: number;
  verifiedLotCount: number;
  nextAllowanceResetAt: string | null;
  reason: PaidPlanMonthlyAllowanceResetReason | null;
}>;

export interface PaidPlanMonthlyAllowanceResetStore {
  apply(workspaceId: string): Promise<PaidPlanMonthlyAllowanceResetResult>;
}
type RpcError = Readonly<{ message?: string; code?: string }>;

function requiredUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new Error(`${label} is invalid.`);
  }
  return value.toLowerCase();
}

function nullableUuid(value: unknown, label: string): string | null {
  return value == null ? null : requiredUuid(value, label);
}

function requiredCount(value: unknown, label: string): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed) || parsed < 0 || parsed > 4) {
    throw new Error(`${label} is invalid.`);
  }
  return parsed;
}

function nullableTimestamp(value: unknown, label: string): string | null {
  if (value == null) return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} is invalid.`);
  }
  return new Date(value).toISOString();
}

function rpcFailure(error: RpcError | null): Error {
  const detail = error?.message?.trim() || error?.code?.trim() || 'unknown database error';
  return new Error(`Unable to apply paid-plan monthly allowance reset: ${detail}`);
}

const RESET_STATUSES = new Set<PaidPlanMonthlyAllowanceResetStatus>([
  'completed',
  'blocked_catchup',
  'not_due',
  'not_eligible',
]);

const RESET_REASONS = new Set<PaidPlanMonthlyAllowanceResetReason>([
  'subscription_not_live',
  'subscription_not_active',
  'entitlement_not_active',
  'allowance_schedule_missing',
  'current_provider_period_not_paid',
  'waiting_for_provider_period',
  'allowance_window_not_started',
  'catchup_requires_reconciliation',
]);

export function parsePaidPlanMonthlyAllowanceResetResult(
  value: unknown,
  expectedWorkspaceId: string,
): PaidPlanMonthlyAllowanceResetResult {
  const expected = requiredUuid(expectedWorkspaceId, 'workspace ID');
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('Paid-plan monthly allowance reset RPC returned no row.');
  }
  const row = candidate as Record<string, unknown>;
  const status = row.reset_status;
  if (typeof status !== 'string' || !RESET_STATUSES.has(status as PaidPlanMonthlyAllowanceResetStatus)) {
    throw new Error('Paid-plan monthly allowance reset status is invalid.');
  }
  const typedStatus = status as PaidPlanMonthlyAllowanceResetStatus;
  const workspaceId = requiredUuid(row.workspace_id, 'returned workspace ID');
  if (workspaceId !== expected) {
    throw new Error('Paid-plan monthly allowance reset returned another workspace.');
  }

  const operationId = nullableUuid(row.operation_id, 'operation ID');
  const billingSubscriptionId = nullableUuid(
    row.billing_subscription_id,
    'billing subscription ID',
  );
  const allowanceWindowStart = nullableTimestamp(
    row.allowance_window_start,
    'allowance window start',
  );
  const allowanceWindowEnd = nullableTimestamp(
    row.allowance_window_end,
    'allowance window end',
  );
  const nextAllowanceResetAt = nullableTimestamp(
    row.next_allowance_reset_at,
    'next allowance reset time',
  );
  const insertedLotCount = requiredCount(row.inserted_lot_count, 'inserted lot count');
  const verifiedLotCount = requiredCount(row.verified_lot_count, 'verified lot count');
  const reasonValue = row.reason_code;
  const reason = reasonValue == null
    ? null
    : typeof reasonValue === 'string'
      && RESET_REASONS.has(reasonValue as PaidPlanMonthlyAllowanceResetReason)
      ? reasonValue as PaidPlanMonthlyAllowanceResetReason
      : null;
  if (reasonValue != null && reason == null) {
    throw new Error('Paid-plan monthly allowance reset reason is invalid.');
  }

  if (typedStatus === 'completed') {
    if (!operationId || !billingSubscriptionId || !allowanceWindowStart || !allowanceWindowEnd
        || insertedLotCount > 4 || verifiedLotCount !== 4 || reason !== null
        || nextAllowanceResetAt !== allowanceWindowEnd) {
      throw new Error('Completed paid-plan monthly allowance reset result is inconsistent.');
    }
  } else if (typedStatus === 'blocked_catchup') {
    if (!operationId || !billingSubscriptionId || !allowanceWindowStart || !allowanceWindowEnd
        || insertedLotCount !== 0 || verifiedLotCount !== 0
        || reason !== 'catchup_requires_reconciliation'
        || nextAllowanceResetAt !== allowanceWindowStart) {
      throw new Error('Blocked paid-plan monthly allowance reset result is inconsistent.');
    }
  } else if (operationId || insertedLotCount !== 0 || verifiedLotCount !== 0 || reason === null) {
    throw new Error('No-op paid-plan monthly allowance reset result is inconsistent.');
  }

  return Object.freeze({
    status: typedStatus,
    operationId,
    workspaceId,
    billingSubscriptionId,
    allowanceWindowStart,
    allowanceWindowEnd,
    insertedLotCount,
    verifiedLotCount,
    nextAllowanceResetAt,
    reason,
  });
}

/** Service-role store. The RPC is the only writer and accepts no usage inputs. */
export class SupabasePaidPlanMonthlyAllowanceResetStore
implements PaidPlanMonthlyAllowanceResetStore {
  private readonly admin = createAdminClient();

  async apply(workspaceId: string): Promise<PaidPlanMonthlyAllowanceResetResult> {
    const normalizedWorkspaceId = requiredUuid(workspaceId, 'workspace ID');
    const { data, error } = await this.admin.rpc('apply_paid_plan_monthly_allowance_reset', {
      p_account_id: normalizedWorkspaceId,
    });
    if (error) throw rpcFailure(error);
    return parsePaidPlanMonthlyAllowanceResetResult(data, normalizedWorkspaceId);
  }
}

/**
 * Future scheduler entry point. There is intentionally no batch loop: one call
 * can complete one exact window only, and blocked catch-up requires an operator.
 */
export async function applyPaidPlanMonthlyAllowanceReset(
  workspaceId: string,
  store: PaidPlanMonthlyAllowanceResetStore = new SupabasePaidPlanMonthlyAllowanceResetStore(),
): Promise<PaidPlanMonthlyAllowanceResetResult> {
  const normalizedWorkspaceId = requiredUuid(workspaceId, 'workspace ID');
  const result = await store.apply(normalizedWorkspaceId);
  if (result.workspaceId !== normalizedWorkspaceId) {
    throw new Error('Paid-plan monthly allowance reset store returned another workspace.');
  }
  return result;
}

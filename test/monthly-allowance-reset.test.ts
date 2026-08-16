import { describe, expect, it, vi } from 'vitest';
import {
  applyPaidPlanMonthlyAllowanceReset,
  parsePaidPlanMonthlyAllowanceResetResult,
  type PaidPlanMonthlyAllowanceResetStore,
} from '@/lib/billing/monthly-allowance-reset';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const SUBSCRIPTION_ID = '22222222-2222-4222-8222-222222222222';
const OPERATION_ID = '33333333-3333-4333-8333-333333333333';

describe('dark paid-plan monthly allowance reset adapter', () => {
  it('accepts a completed four-lot result and normalizes timestamps', () => {
    expect(parsePaidPlanMonthlyAllowanceResetResult([{
      reset_status: 'completed',
      operation_id: OPERATION_ID,
      workspace_id: WORKSPACE_ID,
      billing_subscription_id: SUBSCRIPTION_ID,
      allowance_window_start: '2026-09-15T00:00:00+00:00',
      allowance_window_end: '2026-10-15T00:00:00+00:00',
      inserted_lot_count: '4',
      verified_lot_count: 4,
      next_allowance_reset_at: '2026-10-15T00:00:00+00:00',
      reason_code: null,
    }], WORKSPACE_ID)).toEqual({
      status: 'completed',
      operationId: OPERATION_ID,
      workspaceId: WORKSPACE_ID,
      billingSubscriptionId: SUBSCRIPTION_ID,
      allowanceWindowStart: '2026-09-15T00:00:00.000Z',
      allowanceWindowEnd: '2026-10-15T00:00:00.000Z',
      insertedLotCount: 4,
      verifiedLotCount: 4,
      nextAllowanceResetAt: '2026-10-15T00:00:00.000Z',
      reason: null,
    });
  });

  it('accepts a durable catch-up block only when it grants no lots', () => {
    const result = parsePaidPlanMonthlyAllowanceResetResult({
      reset_status: 'blocked_catchup',
      operation_id: OPERATION_ID,
      workspace_id: WORKSPACE_ID,
      billing_subscription_id: SUBSCRIPTION_ID,
      allowance_window_start: '2026-09-15T00:00:00Z',
      allowance_window_end: '2026-10-15T00:00:00Z',
      inserted_lot_count: 0,
      verified_lot_count: 0,
      next_allowance_reset_at: '2026-09-15T00:00:00Z',
      reason_code: 'catchup_requires_reconciliation',
    }, WORKSPACE_ID);

    expect(result.status).toBe('blocked_catchup');
    expect(result.operationId).toBe(OPERATION_ID);
    expect(result.nextAllowanceResetAt).toBe(result.allowanceWindowStart);
  });

  it('rejects malformed completed, blocked, and cross-workspace responses', () => {
    const base = {
      reset_status: 'completed',
      operation_id: OPERATION_ID,
      workspace_id: WORKSPACE_ID,
      billing_subscription_id: SUBSCRIPTION_ID,
      allowance_window_start: '2026-09-15T00:00:00Z',
      allowance_window_end: '2026-10-15T00:00:00Z',
      inserted_lot_count: 4,
      verified_lot_count: 4,
      next_allowance_reset_at: '2026-10-15T00:00:00Z',
      reason_code: null,
    };

    expect(() => parsePaidPlanMonthlyAllowanceResetResult({
      ...base,
      verified_lot_count: 3,
    }, WORKSPACE_ID)).toThrow(/completed.+inconsistent/i);
    expect(() => parsePaidPlanMonthlyAllowanceResetResult({
      ...base,
      reset_status: 'blocked_catchup',
      inserted_lot_count: 1,
      verified_lot_count: 0,
      next_allowance_reset_at: base.allowance_window_start,
      reason_code: 'catchup_requires_reconciliation',
    }, WORKSPACE_ID)).toThrow(/blocked.+inconsistent/i);
    expect(() => parsePaidPlanMonthlyAllowanceResetResult({
      ...base,
      workspace_id: '44444444-4444-4444-8444-444444444444',
    }, WORKSPACE_ID)).toThrow(/another workspace/i);
  });

  it('passes only the normalized workspace identity to an injected store', async () => {
    const result = Object.freeze({
      status: 'not_due' as const,
      operationId: null,
      workspaceId: WORKSPACE_ID,
      billingSubscriptionId: SUBSCRIPTION_ID,
      allowanceWindowStart: null,
      allowanceWindowEnd: null,
      insertedLotCount: 0,
      verifiedLotCount: 0,
      nextAllowanceResetAt: '2026-10-15T00:00:00.000Z',
      reason: 'waiting_for_provider_period' as const,
    });
    const apply = vi.fn(async () => result);
    const store: PaidPlanMonthlyAllowanceResetStore = { apply };

    await expect(applyPaidPlanMonthlyAllowanceReset(WORKSPACE_ID.toUpperCase(), store))
      .resolves.toBe(result);
    expect(apply).toHaveBeenCalledWith(WORKSPACE_ID);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid workspace IDs before the store runs', async () => {
    const apply = vi.fn();
    await expect(applyPaidPlanMonthlyAllowanceReset('not-a-workspace', { apply }))
      .rejects.toThrow(/workspace id is invalid/i);
    expect(apply).not.toHaveBeenCalled();
  });
});

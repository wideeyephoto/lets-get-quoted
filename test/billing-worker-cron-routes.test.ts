import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const doubles = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  runProjectionBatch: vi.fn(),
  runConnectedProjectionBatch: vi.fn(),
  runAllowanceResetBatch: vi.fn(),
  runSettlementBatch: vi.fn(),
  runQuickStopLateRefundBatch: vi.fn(),
  quickStopExecutorConstructed: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: doubles.createAdminClient,
}));

vi.mock('@/lib/billing/subscription-projection-worker', () => ({
  runStripeBillingSubscriptionProjectionBatch: doubles.runProjectionBatch,
}));

vi.mock('@/lib/billing/connected-payment-projection-worker', () => ({
  runConnectedPaymentProjectionBatch: doubles.runConnectedProjectionBatch,
}));

vi.mock('@/lib/billing/monthly-allowance-reset-worker', () => ({
  runPaidPlanMonthlyAllowanceResetBatch: doubles.runAllowanceResetBatch,
}));

vi.mock('@/lib/billing/direct-payment-settlement-worker', () => ({
  runDirectPaymentSettlementBatch: doubles.runSettlementBatch,
}));

vi.mock('@/lib/billing/legacy-quick-stop-late-refund-worker', () => ({
  runLegacyQuickStopLateRefundBatch: doubles.runQuickStopLateRefundBatch,
}));

vi.mock('@/lib/billing/legacy-quick-stop-stripe-refund-executor', () => ({
  StripeLegacyQuickStopLateRefundExecutor: class {
    constructor() {
      doubles.quickStopExecutorConstructed();
    }
  },
}));

import { GET as runAllowanceResets } from '@/app/api/cron/billing-allowance-resets/route';
import { GET as runSubscriptionProjection } from '@/app/api/cron/billing-subscription-projection/route';
import { GET as runConnectedPaymentProjection } from '@/app/api/cron/connected-payment-projection/route';
import { GET as runDirectPaymentSettlement } from '@/app/api/cron/direct-payment-settlement/route';
import { GET as runQuickStopLateRefunds } from '@/app/api/cron/legacy-quick-stop-late-refunds/route';
import {
  DIRECT_PAYMENT_SETTLEMENT_BATCH_SIZE,
  DIRECT_PAYMENT_SETTLEMENT_WORKER_FLAG,
  LEGACY_QUICK_STOP_LATE_REFUND_BATCH_SIZE,
  LEGACY_QUICK_STOP_LATE_REFUND_WORKER_FLAG,
  PAID_PLAN_ALLOWANCE_RESET_BATCH_SIZE,
  PAID_PLAN_ALLOWANCE_RESET_WORKER_FLAG,
  STRIPE_CONNECTED_PAYMENT_PROJECTION_BATCH_SIZE,
  STRIPE_CONNECTED_PAYMENT_PROJECTION_WORKER_FLAG,
  STRIPE_SUBSCRIPTION_PROJECTION_BATCH_SIZE,
  STRIPE_SUBSCRIPTION_PROJECTION_WORKER_FLAG,
  directPaymentSettlementWorkerEnabled,
  legacyQuickStopLateRefundWorkerEnabled,
  paidPlanAllowanceResetWorkerEnabled,
  stripeConnectedPaymentProjectionWorkerEnabled,
  stripeSubscriptionProjectionWorkerEnabled,
  summarizeConnectedPaymentProjectionBatch,
  summarizePaidPlanAllowanceResetBatch,
  summarizeDirectPaymentSettlementBatch,
  summarizeLegacyQuickStopLateRefundBatch,
  summarizeStripeSubscriptionProjectionBatch,
} from '@/lib/billing/billing-worker-cron';
import { cronSummaryHasFailures } from '@/lib/cron-jobs';

const ORIGINAL_PROJECTION_FLAG = process.env[STRIPE_SUBSCRIPTION_PROJECTION_WORKER_FLAG];
const ORIGINAL_CONNECTED_PROJECTION_FLAG =
  process.env[STRIPE_CONNECTED_PAYMENT_PROJECTION_WORKER_FLAG];
const ORIGINAL_RESET_FLAG = process.env[PAID_PLAN_ALLOWANCE_RESET_WORKER_FLAG];
const ORIGINAL_SETTLEMENT_FLAG = process.env[DIRECT_PAYMENT_SETTLEMENT_WORKER_FLAG];
const ORIGINAL_QUICK_STOP_REFUND_FLAG =
  process.env[LEGACY_QUICK_STOP_LATE_REFUND_WORKER_FLAG];
const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function fakeCronAdmin() {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.insert = vi.fn(() => builder);
  builder.select = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => ({
    data: { id: '10000000-0000-4000-8000-000000000001' },
    error: null,
  }));
  builder.update = vi.fn(() => builder);
  builder.eq = vi.fn(async () => ({ data: null, error: null }));
  builder.delete = vi.fn(() => builder);
  builder.lt = vi.fn(async () => ({ data: null, error: null }));
  return {
    admin: { from: vi.fn(() => builder) },
    builder,
  };
}

function unreadRequest() {
  const get = vi.fn(() => {
    throw new Error('disabled worker route read request headers');
  });
  const text = vi.fn(async () => {
    throw new Error('disabled worker route read a request body');
  });
  return {
    request: { headers: { get }, text } as unknown as Request,
    get,
    text,
  };
}

beforeEach(() => {
  doubles.createAdminClient.mockReset();
  doubles.runProjectionBatch.mockReset().mockResolvedValue({
    status: 'completed',
    requestedBatchSize: STRIPE_SUBSCRIPTION_PROJECTION_BATCH_SIZE,
    claimedCount: 0,
    results: [],
    errorCode: null,
  });
  doubles.runConnectedProjectionBatch.mockReset().mockResolvedValue({
    status: 'completed',
    requestedBatchSize: STRIPE_CONNECTED_PAYMENT_PROJECTION_BATCH_SIZE,
    selectedCount: 0,
    claimedCount: 0,
    results: [],
    errorCode: null,
  });
  doubles.runAllowanceResetBatch.mockReset().mockResolvedValue({
    claimedCount: 0,
    outcomes: [],
  });
  doubles.runSettlementBatch.mockReset().mockResolvedValue({
    claimedCount: 0,
    outcomes: [],
  });
  doubles.runQuickStopLateRefundBatch.mockReset().mockResolvedValue({
    claimedCount: 0,
    outcomes: [],
  });
  doubles.quickStopExecutorConstructed.mockReset();
});

afterEach(() => {
  restoreEnvironment(STRIPE_SUBSCRIPTION_PROJECTION_WORKER_FLAG, ORIGINAL_PROJECTION_FLAG);
  restoreEnvironment(
    STRIPE_CONNECTED_PAYMENT_PROJECTION_WORKER_FLAG,
    ORIGINAL_CONNECTED_PROJECTION_FLAG,
  );
  restoreEnvironment(PAID_PLAN_ALLOWANCE_RESET_WORKER_FLAG, ORIGINAL_RESET_FLAG);
  restoreEnvironment(DIRECT_PAYMENT_SETTLEMENT_WORKER_FLAG, ORIGINAL_SETTLEMENT_FLAG);
  restoreEnvironment(
    LEGACY_QUICK_STOP_LATE_REFUND_WORKER_FLAG,
    ORIGINAL_QUICK_STOP_REFUND_FLAG,
  );
  restoreEnvironment('CRON_SECRET', ORIGINAL_CRON_SECRET);
  vi.restoreAllMocks();
});

describe('dark billing worker route gates', () => {
  it.each([undefined, '', '0', 'true', ' 1', '1 '])(
    'keeps projection dark unless its flag is exactly 1 (%s)',
    async (configured) => {
      restoreEnvironment(STRIPE_SUBSCRIPTION_PROJECTION_WORKER_FLAG, configured);
      process.env.CRON_SECRET = 'must-not-be-read';
      const unread = unreadRequest();

      const response = await runSubscriptionProjection(unread.request);

      expect(response.status).toBe(404);
      expect(await response.text()).toBe('');
      expect(unread.get).not.toHaveBeenCalled();
      expect(unread.text).not.toHaveBeenCalled();
      expect(doubles.createAdminClient).not.toHaveBeenCalled();
      expect(doubles.runProjectionBatch).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, '', '0', 'true', ' 1', '1 '])(
    'keeps connected-payment projection dark unless its flag is exactly 1 (%s)',
    async (configured) => {
      restoreEnvironment(STRIPE_CONNECTED_PAYMENT_PROJECTION_WORKER_FLAG, configured);
      process.env.CRON_SECRET = 'must-not-be-read';
      const unread = unreadRequest();

      const response = await runConnectedPaymentProjection(unread.request);

      expect(response.status).toBe(404);
      expect(await response.text()).toBe('');
      expect(unread.get).not.toHaveBeenCalled();
      expect(unread.text).not.toHaveBeenCalled();
      expect(doubles.createAdminClient).not.toHaveBeenCalled();
      expect(doubles.runConnectedProjectionBatch).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, '', '0', 'true', ' 1', '1 '])(
    'keeps allowance resets dark unless their flag is exactly 1 (%s)',
    async (configured) => {
      restoreEnvironment(PAID_PLAN_ALLOWANCE_RESET_WORKER_FLAG, configured);
      process.env.CRON_SECRET = 'must-not-be-read';
      const unread = unreadRequest();

      const response = await runAllowanceResets(unread.request);

      expect(response.status).toBe(404);
      expect(await response.text()).toBe('');
      expect(unread.get).not.toHaveBeenCalled();
      expect(unread.text).not.toHaveBeenCalled();
      expect(doubles.createAdminClient).not.toHaveBeenCalled();
      expect(doubles.runAllowanceResetBatch).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, '', '0', 'true', ' 1', '1 '])(
    'keeps direct payment settlement dark unless its flag is exactly 1 (%s)',
    async (configured) => {
      restoreEnvironment(DIRECT_PAYMENT_SETTLEMENT_WORKER_FLAG, configured);
      process.env.CRON_SECRET = 'must-not-be-read';
      const unread = unreadRequest();

      const response = await runDirectPaymentSettlement(unread.request);

      expect(response.status).toBe(404);
      expect(await response.text()).toBe('');
      expect(unread.get).not.toHaveBeenCalled();
      expect(unread.text).not.toHaveBeenCalled();
      expect(doubles.createAdminClient).not.toHaveBeenCalled();
      expect(doubles.runSettlementBatch).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, '', '0', 'true', ' 1', '1 '])(
    'keeps legacy Quick Stop late refunds dark unless their flag is exactly 1 (%s)',
    async (configured) => {
      restoreEnvironment(LEGACY_QUICK_STOP_LATE_REFUND_WORKER_FLAG, configured);
      process.env.CRON_SECRET = 'must-not-be-read';
      const unread = unreadRequest();

      const response = await runQuickStopLateRefunds(unread.request);

      expect(response.status).toBe(404);
      expect(await response.text()).toBe('');
      expect(unread.get).not.toHaveBeenCalled();
      expect(unread.text).not.toHaveBeenCalled();
      expect(doubles.createAdminClient).not.toHaveBeenCalled();
      expect(doubles.quickStopExecutorConstructed).not.toHaveBeenCalled();
      expect(doubles.runQuickStopLateRefundBatch).not.toHaveBeenCalled();
    },
  );

  it('recognizes only exact-1 values in an injected environment', () => {
    expect(stripeSubscriptionProjectionWorkerEnabled({
      [STRIPE_SUBSCRIPTION_PROJECTION_WORKER_FLAG]: '1',
    })).toBe(true);
    expect(stripeSubscriptionProjectionWorkerEnabled({
      [STRIPE_SUBSCRIPTION_PROJECTION_WORKER_FLAG]: 'true',
    })).toBe(false);
    expect(stripeConnectedPaymentProjectionWorkerEnabled({
      [STRIPE_CONNECTED_PAYMENT_PROJECTION_WORKER_FLAG]: '1',
    })).toBe(true);
    expect(stripeConnectedPaymentProjectionWorkerEnabled({
      [STRIPE_CONNECTED_PAYMENT_PROJECTION_WORKER_FLAG]: 'true',
    })).toBe(false);
    expect(paidPlanAllowanceResetWorkerEnabled({
      [PAID_PLAN_ALLOWANCE_RESET_WORKER_FLAG]: '1',
    })).toBe(true);
    expect(paidPlanAllowanceResetWorkerEnabled({
      [PAID_PLAN_ALLOWANCE_RESET_WORKER_FLAG]: '1 ',
    })).toBe(false);
    expect(directPaymentSettlementWorkerEnabled({
      [DIRECT_PAYMENT_SETTLEMENT_WORKER_FLAG]: '1',
    })).toBe(true);
    expect(directPaymentSettlementWorkerEnabled({
      [DIRECT_PAYMENT_SETTLEMENT_WORKER_FLAG]: 'TRUE',
    })).toBe(false);
    expect(legacyQuickStopLateRefundWorkerEnabled({
      [LEGACY_QUICK_STOP_LATE_REFUND_WORKER_FLAG]: '1',
    })).toBe(true);
    expect(legacyQuickStopLateRefundWorkerEnabled({
      [LEGACY_QUICK_STOP_LATE_REFUND_WORKER_FLAG]: 'yes',
    })).toBe(false);
  });

  it.each([
    [STRIPE_SUBSCRIPTION_PROJECTION_WORKER_FLAG, runSubscriptionProjection],
    [STRIPE_CONNECTED_PAYMENT_PROJECTION_WORKER_FLAG, runConnectedPaymentProjection],
    [PAID_PLAN_ALLOWANCE_RESET_WORKER_FLAG, runAllowanceResets],
    [DIRECT_PAYMENT_SETTLEMENT_WORKER_FLAG, runDirectPaymentSettlement],
    [LEGACY_QUICK_STOP_LATE_REFUND_WORKER_FLAG, runQuickStopLateRefunds],
  ] as const)('requires CRON_SECRET after %s is enabled', async (flag, handler) => {
    process.env[flag] = '1';
    delete process.env.CRON_SECRET;

    const response = await handler(new Request('https://letsgetquoted.com/api/cron/test'));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(doubles.createAdminClient).not.toHaveBeenCalled();
    expect(doubles.runProjectionBatch).not.toHaveBeenCalled();
    expect(doubles.runConnectedProjectionBatch).not.toHaveBeenCalled();
    expect(doubles.runAllowanceResetBatch).not.toHaveBeenCalled();
    expect(doubles.runSettlementBatch).not.toHaveBeenCalled();
    expect(doubles.quickStopExecutorConstructed).not.toHaveBeenCalled();
    expect(doubles.runQuickStopLateRefundBatch).not.toHaveBeenCalled();
  });

  it('uses one fixed legacy Quick Stop refund batch and only count-based monitoring', async () => {
    process.env[LEGACY_QUICK_STOP_LATE_REFUND_WORKER_FLAG] = '1';
    process.env.CRON_SECRET = 'cron-secret';
    const { admin, builder } = fakeCronAdmin();
    doubles.createAdminClient.mockReturnValue(admin);
    const secret = 'customer@example.com / payment-private / re_private';
    doubles.runQuickStopLateRefundBatch.mockResolvedValue({
      claimedCount: 3,
      outcomes: [
        { taskId: secret, status: 'completed' },
        { taskId: secret, status: 'failed_retryable' },
        { taskId: secret, status: 'already_completed' },
      ],
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const response = await runQuickStopLateRefunds(new Request(
      'https://letsgetquoted.com/api/cron/legacy-quick-stop-late-refunds?batch=999999',
      { headers: { authorization: 'Bearer cron-secret' } },
    ));
    const responseBody = await response.json();

    expect(response.status).toBe(500);
    expect(doubles.quickStopExecutorConstructed).toHaveBeenCalledOnce();
    expect(doubles.runQuickStopLateRefundBatch).toHaveBeenCalledWith(
      expect.anything(),
      LEGACY_QUICK_STOP_LATE_REFUND_BATCH_SIZE,
    );
    expect(responseBody).toMatchObject({
      summary: {
        requested: 10,
        claimed: 3,
        completed: 1,
        already_completed: 1,
        retryable_failures: 1,
        failures: 1,
      },
    });
    expect(JSON.stringify(responseBody)).not.toContain(secret);
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({
      ok: false,
      summary: expect.objectContaining({ requested: 10, claimed: 3, failures: 1 }),
    }));
  });

  it('collapses Quick Stop Stripe initialization failure to one PII-free count', async () => {
    process.env[LEGACY_QUICK_STOP_LATE_REFUND_WORKER_FLAG] = '1';
    process.env.CRON_SECRET = 'cron-secret';
    const { admin, builder } = fakeCronAdmin();
    doubles.createAdminClient.mockReturnValue(admin);
    const secret = 'sk_test_private / customer@example.com';
    doubles.quickStopExecutorConstructed.mockImplementationOnce(() => {
      throw new Error(secret);
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const response = await runQuickStopLateRefunds(new Request(
      'https://letsgetquoted.com/api/cron/legacy-quick-stop-late-refunds',
      { headers: { authorization: 'Bearer cron-secret' } },
    ));
    const responseBody = await response.json();

    expect(response.status).toBe(500);
    expect(responseBody).toMatchObject({
      summary: { claimed: 0, worker_errors: 1, failures: 1 },
    });
    expect(JSON.stringify(responseBody)).not.toContain(secret);
    expect(doubles.runQuickStopLateRefundBatch).not.toHaveBeenCalled();
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({
      ok: false,
      summary: expect.objectContaining({ worker_errors: 1, failures: 1 }),
      error: expect.stringContaining('reported logical failures'),
    }));
  });

  it('uses one fixed projection batch and returns only the monitored summary', async () => {
    process.env[STRIPE_SUBSCRIPTION_PROJECTION_WORKER_FLAG] = '1';
    process.env.CRON_SECRET = 'cron-secret';
    const { admin, builder } = fakeCronAdmin();
    doubles.createAdminClient.mockReturnValue(admin);
    doubles.runProjectionBatch.mockResolvedValue({
      status: 'completed',
      requestedBatchSize: STRIPE_SUBSCRIPTION_PROJECTION_BATCH_SIZE,
      claimedCount: 1,
      results: [{
        status: 'replay_processed',
        billingEventId: 'private-event-id',
      }],
      errorCode: null,
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const response = await runSubscriptionProjection(new Request(
      'https://letsgetquoted.com/api/cron/billing-subscription-projection?batch=999999',
      { headers: { authorization: 'Bearer cron-secret' } },
    ));
    const responseBody = await response.json();

    expect(response.status).toBe(200);
    expect(doubles.runProjectionBatch).toHaveBeenCalledOnce();
    expect(doubles.runProjectionBatch).toHaveBeenCalledWith(
      STRIPE_SUBSCRIPTION_PROJECTION_BATCH_SIZE,
    );
    expect(responseBody).toMatchObject({ requested: 10, claimed: 1, replayed: 1, failures: 0 });
    expect(JSON.stringify(responseBody)).not.toContain('private-event-id');
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({
      ok: true,
      summary: expect.objectContaining({ requested: 10, claimed: 1, failures: 0 }),
    }));
  });

  it('uses one fixed connected-payment batch and records only count-based monitoring', async () => {
    process.env[STRIPE_CONNECTED_PAYMENT_PROJECTION_WORKER_FLAG] = '1';
    process.env.CRON_SECRET = 'cron-secret';
    const { admin, builder } = fakeCronAdmin();
    doubles.createAdminClient.mockReturnValue(admin);
    const secret = 'private@example.com / payment-private / evt_private';
    doubles.runConnectedProjectionBatch.mockResolvedValue({
      status: 'completed',
      requestedBatchSize: STRIPE_CONNECTED_PAYMENT_PROJECTION_BATCH_SIZE,
      selectedCount: 2,
      claimedCount: 1,
      results: [
        {
          status: 'processed',
          billingEventId: secret,
          paymentId: secret,
          workspaceId: secret,
          applied: true,
          reconciliationStatus: 'pending',
        },
        {
          status: 'failed_terminal',
          billingEventId: secret,
          errorCode: 'projection_retry_attempt_limit',
        },
      ],
      errorCode: null,
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const response = await runConnectedPaymentProjection(new Request(
      'https://letsgetquoted.com/api/cron/connected-payment-projection?batch=999999',
      { headers: { authorization: 'Bearer cron-secret' } },
    ));
    const responseBody = await response.json();

    expect(response.status).toBe(500);
    expect(doubles.runConnectedProjectionBatch).toHaveBeenCalledOnce();
    expect(doubles.runConnectedProjectionBatch).toHaveBeenCalledWith(
      STRIPE_CONNECTED_PAYMENT_PROJECTION_BATCH_SIZE,
    );
    expect(responseBody).toMatchObject({
      summary: {
        requested: 10,
        selected: 2,
        claimed: 1,
        dead_lettered_without_provider: 1,
        processed: 1,
        pending_reconciliation: 1,
        terminal_failures: 1,
        failures: 1,
      },
    });
    expect(JSON.stringify(responseBody)).not.toContain(secret);
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({
      ok: false,
      summary: expect.objectContaining({
        requested: 10,
        selected: 2,
        failures: 1,
      }),
    }));
  });

  it('collapses a top-level connected-payment worker exception to one fixed count', async () => {
    process.env[STRIPE_CONNECTED_PAYMENT_PROJECTION_WORKER_FLAG] = '1';
    process.env.CRON_SECRET = 'cron-secret';
    const { admin, builder } = fakeCronAdmin();
    doubles.createAdminClient.mockReturnValue(admin);
    const secret = 'customer@example.com / acct_private / ch_private';
    doubles.runConnectedProjectionBatch.mockRejectedValue(new Error(secret));
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const response = await runConnectedPaymentProjection(new Request(
      'https://letsgetquoted.com/api/cron/connected-payment-projection',
      { headers: { authorization: 'Bearer cron-secret' } },
    ));
    const responseBody = await response.json();

    expect(response.status).toBe(500);
    expect(responseBody).toMatchObject({
      summary: {
        selected: 0,
        claimed: 0,
        worker_errors: 1,
        failures: 1,
      },
    });
    expect(JSON.stringify(responseBody)).not.toContain(secret);
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({
      ok: false,
      summary: expect.objectContaining({ worker_errors: 1, failures: 1 }),
      error: expect.stringContaining('reported logical failures'),
    }));
  });

  it('uses one fixed allowance-reset batch and records the heartbeat', async () => {
    process.env[PAID_PLAN_ALLOWANCE_RESET_WORKER_FLAG] = '1';
    process.env.CRON_SECRET = 'cron-secret';
    const { admin, builder } = fakeCronAdmin();
    doubles.createAdminClient.mockReturnValue(admin);
    doubles.runAllowanceResetBatch.mockResolvedValue({ claimedCount: 0, outcomes: [] });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const response = await runAllowanceResets(new Request(
      'https://letsgetquoted.com/api/cron/billing-allowance-resets?batch=999999',
      { headers: { authorization: 'Bearer cron-secret' } },
    ));

    expect(response.status).toBe(200);
    expect(doubles.runAllowanceResetBatch).toHaveBeenCalledOnce();
    expect(doubles.runAllowanceResetBatch).toHaveBeenCalledWith(
      PAID_PLAN_ALLOWANCE_RESET_BATCH_SIZE,
    );
    expect(await response.json()).toMatchObject({ requested: 10, claimed: 0, failures: 0 });
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({
      ok: true,
      summary: expect.objectContaining({ requested: 10, claimed: 0, failures: 0 }),
    }));
  });

  it('uses one fixed direct-settlement batch and returns only count-based monitoring', async () => {
    process.env[DIRECT_PAYMENT_SETTLEMENT_WORKER_FLAG] = '1';
    process.env.CRON_SECRET = 'cron-secret';
    const { admin, builder } = fakeCronAdmin();
    doubles.createAdminClient.mockReturnValue(admin);
    const secret = 'task/private@example.com/provider-private';
    doubles.runSettlementBatch.mockResolvedValue({
      claimedCount: 2,
      outcomes: [
        {
          taskId: secret,
          status: 'completed',
          feedStatus: 'recorded',
          smsStatus: 'sent',
        },
        {
          taskId: secret,
          status: 'completed',
          feedStatus: 'recorded',
          smsStatus: 'skipped_no_consent',
        },
      ],
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const response = await runDirectPaymentSettlement(new Request(
      'https://letsgetquoted.com/api/cron/direct-payment-settlement?batch=999999',
      { headers: { authorization: 'Bearer cron-secret' } },
    ));
    const responseBody = await response.json();

    expect(response.status).toBe(200);
    expect(doubles.runSettlementBatch).toHaveBeenCalledOnce();
    expect(doubles.runSettlementBatch).toHaveBeenCalledWith(
      DIRECT_PAYMENT_SETTLEMENT_BATCH_SIZE,
    );
    expect(responseBody).toMatchObject({
      requested: 10,
      claimed: 2,
      completed: 2,
      feed_recorded: 2,
      sms_sent: 1,
      sms_skipped_no_consent: 1,
      failures: 0,
    });
    expect(JSON.stringify(responseBody)).not.toContain(secret);
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({
      ok: true,
      summary: expect.objectContaining({ requested: 10, claimed: 2, failures: 0 }),
    }));
  });

  it('keeps an indeterminate SMS terminal and visible as count-only failed work', async () => {
    process.env[DIRECT_PAYMENT_SETTLEMENT_WORKER_FLAG] = '1';
    process.env.CRON_SECRET = 'cron-secret';
    const { admin, builder } = fakeCronAdmin();
    doubles.createAdminClient.mockReturnValue(admin);
    const secret = 'task/private@example.com/provider-private';
    doubles.runSettlementBatch.mockResolvedValue({
      claimedCount: 1,
      outcomes: [{
        taskId: secret,
        status: 'sms_indeterminate',
        feedStatus: 'recorded',
        smsStatus: 'indeterminate',
      }],
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const response = await runDirectPaymentSettlement(new Request(
      'https://letsgetquoted.com/api/cron/direct-payment-settlement',
      { headers: { authorization: 'Bearer cron-secret' } },
    ));
    const responseBody = await response.json();

    expect(response.status).toBe(500);
    expect(responseBody).toMatchObject({
      summary: {
        claimed: 1,
        sms_indeterminate: 1,
        retryable_failures: 0,
        failures: 1,
      },
    });
    expect(JSON.stringify(responseBody)).not.toContain(secret);
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({
      ok: false,
      summary: expect.objectContaining({ sms_indeterminate: 1, failures: 1 }),
    }));
  });

  it('collapses a top-level settlement exception to one PII-free worker error', async () => {
    process.env[DIRECT_PAYMENT_SETTLEMENT_WORKER_FLAG] = '1';
    process.env.CRON_SECRET = 'cron-secret';
    const { admin, builder } = fakeCronAdmin();
    doubles.createAdminClient.mockReturnValue(admin);
    const secret = 'private@example.com / payment-private / provider-private';
    doubles.runSettlementBatch.mockRejectedValue(new Error(secret));
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const response = await runDirectPaymentSettlement(new Request(
      'https://letsgetquoted.com/api/cron/direct-payment-settlement',
      { headers: { authorization: 'Bearer cron-secret' } },
    ));
    const responseBody = await response.json();

    expect(response.status).toBe(500);
    expect(responseBody).toMatchObject({
      summary: { claimed: 0, worker_errors: 1, failures: 1 },
    });
    expect(JSON.stringify(responseBody)).not.toContain(secret);
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({
      ok: false,
      summary: expect.objectContaining({ worker_errors: 1, failures: 1 }),
      error: expect.stringContaining('reported logical failures'),
    }));
  });
});

describe('PII-free billing worker heartbeat summaries', () => {
  it('drops subscription, workspace, provider, and error identifiers', () => {
    const secret = 'private@example.com / sub_private / evt_private';
    const summary = summarizeStripeSubscriptionProjectionBatch({
      status: 'completed',
      requestedBatchSize: 10,
      claimedCount: 3,
      results: [
        { status: 'replay_processed', billingEventId: secret },
        { status: 'failed_retryable', billingEventId: secret, errorCode: secret },
        { status: 'worker_error', billingEventId: secret, errorCode: 'projection_worker_execution_error' },
      ],
      errorCode: null,
    });

    expect(summary).toEqual({
      requested: 10,
      claimed: 3,
      processed: 0,
      ignored: 0,
      replayed: 1,
      in_progress: 0,
      retryable_failures: 1,
      terminal_failures: 0,
      worker_errors: 1,
      claim_errors: 0,
      failures: 2,
    });
    expect(JSON.stringify(summary)).not.toContain(secret);
    expect(cronSummaryHasFailures(summary)).toBe(true);
  });

  it('drops connected payment, workspace, Merchant, provider, and error identifiers', () => {
    const secret = 'private@example.com / acct_private / pi_private / evt_private';
    const summary = summarizeConnectedPaymentProjectionBatch({
      status: 'completed',
      requestedBatchSize: 10,
      selectedCount: 4,
      claimedCount: 3,
      results: [
        {
          status: 'processed',
          billingEventId: secret,
          paymentId: secret,
          workspaceId: secret,
          applied: true,
          reconciliationStatus: 'reconciled',
        },
        { status: 'failed_retryable', billingEventId: secret, errorCode: secret },
        { status: 'failed_terminal', billingEventId: secret, errorCode: secret },
        { status: 'worker_error', billingEventId: secret, errorCode: 'projection_worker_execution_error' },
      ],
      errorCode: null,
    });

    expect(summary).toEqual({
      requested: 10,
      selected: 4,
      claimed: 3,
      dead_lettered_without_provider: 1,
      processed: 1,
      reconciled: 1,
      pending_reconciliation: 0,
      replayed: 0,
      in_progress: 0,
      retryable_failures: 1,
      terminal_failures: 1,
      worker_errors: 1,
      claim_errors: 0,
      failures: 3,
    });
    expect(JSON.stringify(summary)).not.toContain(secret);
    expect(cronSummaryHasFailures(summary)).toBe(true);
  });

  it('drops allowance workspace and operation identifiers and flags dead letters', () => {
    const secret = 'private-workspace-or-operation-id';
    const summary = summarizePaidPlanAllowanceResetBatch({
      claimedCount: 3,
      outcomes: [
        { status: 'completed', workspaceId: secret },
        { status: 'blocked_catchup', workspaceId: secret },
        { status: 'failed_terminal', workspaceId: secret },
      ],
    } as never, 10);

    expect(summary).toEqual({
      requested: 10,
      claimed: 3,
      completed: 1,
      not_due: 0,
      not_eligible: 0,
      already_finished: 0,
      blocked: 1,
      retryable_failures: 0,
      terminal_failures: 1,
      failures: 2,
    });
    expect(JSON.stringify(summary)).not.toContain(secret);
    expect(cronSummaryHasFailures(summary)).toBe(true);
  });

  it('drops direct-settlement identifiers and keeps indeterminate separate from retryable work', () => {
    const secret = 'task/private@example.com/provider-private';
    const summary = summarizeDirectPaymentSettlementBatch({
      claimedCount: 4,
      outcomes: [
        { taskId: secret, status: 'completed', feedStatus: 'recorded', smsStatus: 'queued' },
        { taskId: secret, status: 'already_finished', feedStatus: 'recorded', smsStatus: 'sent' },
        { taskId: secret, status: 'failed_retryable', feedStatus: 'pending', smsStatus: 'pending' },
        { taskId: secret, status: 'sms_indeterminate', feedStatus: 'recorded', smsStatus: 'indeterminate' },
      ],
    }, 10);

    expect(summary).toEqual({
      requested: 10,
      claimed: 4,
      completed: 1,
      already_finished: 1,
      retryable_failures: 1,
      terminal_failures: 0,
      sms_indeterminate: 1,
      feed_recorded: 3,
      sms_queued: 1,
      sms_sent: 1,
      sms_skipped_no_consent: 0,
      sms_skipped_opted_out: 0,
      sms_pending: 1,
      worker_errors: 0,
      failures: 2,
    });
    expect(JSON.stringify(summary)).not.toContain(secret);
    expect(cronSummaryHasFailures(summary)).toBe(true);
  });

  it('drops legacy Quick Stop task, payment, request, and provider identifiers', () => {
    const secret = 'customer@example.com / payment-private / request-private / re_private';
    const summary = summarizeLegacyQuickStopLateRefundBatch({
      claimedCount: 5,
      outcomes: [
        { taskId: secret, status: 'completed' },
        { taskId: secret, status: 'already_completed' },
        { taskId: secret, status: 'already_finished' },
        { taskId: secret, status: 'failed_retryable' },
        { taskId: secret, status: 'failed_terminal' },
      ],
    }, 10);

    expect(summary).toEqual({
      requested: 10,
      claimed: 5,
      completed: 1,
      already_completed: 1,
      already_finished: 1,
      retryable_failures: 1,
      terminal_failures: 1,
      worker_errors: 0,
      failures: 2,
    });
    expect(JSON.stringify(summary)).not.toContain(secret);
    expect(cronSummaryHasFailures(summary)).toBe(true);
  });
});

describe('billing worker route source contracts', () => {
  it.each([
    ['billing-subscription-projection', 'stripeSubscriptionProjectionWorkerEnabled'],
    ['connected-payment-projection', 'stripeConnectedPaymentProjectionWorkerEnabled'],
    ['billing-allowance-resets', 'paidPlanAllowanceResetWorkerEnabled'],
    ['direct-payment-settlement', 'directPaymentSettlementWorkerEnabled'],
    ['legacy-quick-stop-late-refunds', 'legacyQuickStopLateRefundWorkerEnabled'],
  ])('keeps the %s exact gate in front of cronRoute execution', (job, gate) => {
    const source = readFileSync(
      join(process.cwd(), 'src', 'app', 'api', 'cron', job, 'route.ts'),
      'utf8',
    );
    const gateIndex = source.indexOf(`if (!${gate}())`);
    const executionIndex = source.indexOf('return authenticatedGET(request)');

    expect(source).toContain(`cronRoute('${job}'`);
    expect(gateIndex).toBeGreaterThan(-1);
    expect(executionIndex).toBeGreaterThan(gateIndex);
    expect(source).not.toContain('searchParams');
    expect(source).not.toContain('request.json');
    expect(source).not.toContain('request.text');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  runSmsDeliveryBatch,
  runPaymentSmsProducerBatch,
  reconcileSmsTextUsage,
  reconcileSmsMatchedStatuses,
} = vi.hoisted(() => ({
  runSmsDeliveryBatch: vi.fn(),
  runPaymentSmsProducerBatch: vi.fn(),
  reconcileSmsTextUsage: vi.fn(),
  reconcileSmsMatchedStatuses: vi.fn(),
}));

vi.mock('@/lib/sms-delivery-worker', () => ({ runSmsDeliveryBatch }));
vi.mock('@/lib/payment-sms-producer-worker', () => ({ runPaymentSmsProducerBatch }));
vi.mock('@/lib/sms-usage-reconciliation', () => ({
  reconcileSmsTextUsage,
  reconcileSmsMatchedStatuses,
}));

describe('SMS delivery cron accounting recovery', () => {
  beforeEach(() => {
    vi.resetModules();
    runSmsDeliveryBatch.mockReset();
    runPaymentSmsProducerBatch.mockReset().mockResolvedValue({
      claimed: 0, completed: 0, failed: 0,
    });
    reconcileSmsTextUsage.mockReset();
    reconcileSmsMatchedStatuses.mockReset();
    reconcileSmsMatchedStatuses.mockResolvedValue({ examined: 0, projected: 0, failed: 0 });
  });

  it('drains durable payment producers before claiming delivery work', async () => {
    const order: string[] = [];
    runPaymentSmsProducerBatch.mockImplementationOnce(async () => {
      order.push('producer');
      return { claimed: 1, completed: 1, failed: 0 };
    });
    runSmsDeliveryBatch.mockImplementationOnce(async () => {
      order.push('delivery');
      return {
        disabledReason: null, claimedCount: 1, completedCount: 1,
        cancelledCount: 0, deferredCount: 0, indeterminateCount: 0,
        failedCount: 0,
      };
    });
    reconcileSmsTextUsage.mockResolvedValueOnce({
      examined: 0, committed: 0, released: 0, unmetered: 0, failed: 0,
    });
    const { runSmsDeliveryCronBatch } = await import('@/lib/sms-delivery-cron');
    await expect(runSmsDeliveryCronBatch()).resolves.toMatchObject({
      producer_claimed: 1, producer_completed: 1, claimed: 1, completed: 1,
    });
    expect(order).toEqual(['producer', 'delivery']);
  });

  it('still reconciles prior text usage when delivery processing throws', async () => {
    runSmsDeliveryBatch.mockRejectedValueOnce(new Error('database unavailable'));
    reconcileSmsTextUsage.mockResolvedValueOnce({
      examined: 2,
      committed: 1,
      released: 1,
      unmetered: 0,
      failed: 0,
    });
    const { runSmsDeliveryCronBatch } = await import('@/lib/sms-delivery-cron');

    await expect(runSmsDeliveryCronBatch()).resolves.toMatchObject({
      claimed: 0,
      usage_examined: 2,
      usage_committed: 1,
      usage_released: 1,
      failures: 1,
    });
    expect(reconcileSmsTextUsage).toHaveBeenCalledWith(100);
    expect(reconcileSmsMatchedStatuses).toHaveBeenCalledWith(100);
  });

  it('preserves delivery aggregates and pages once when reconciliation throws', async () => {
    runSmsDeliveryBatch.mockResolvedValueOnce({
      disabledReason: null,
      claimedCount: 3,
      completedCount: 2,
      cancelledCount: 0,
      deferredCount: 0,
      indeterminateCount: 1,
      failedCount: 0,
    });
    reconcileSmsTextUsage.mockRejectedValueOnce(new Error('RPC unavailable'));
    const { runSmsDeliveryCronBatch } = await import('@/lib/sms-delivery-cron');

    await expect(runSmsDeliveryCronBatch()).resolves.toMatchObject({
      claimed: 3,
      completed: 2,
      indeterminate: 1,
      usage_examined: 0,
      failures: 2,
    });
  });
});

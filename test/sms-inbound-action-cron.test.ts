import { beforeEach, describe, expect, it, vi } from 'vitest';

const runSmsInboundActionBatch = vi.fn();
vi.mock('@/lib/sms-inbound-action-worker', () => ({ runSmsInboundActionBatch }));

describe('inbound SMS action recovery cron', () => {
  beforeEach(() => {
    vi.resetModules();
    runSmsInboundActionBatch.mockReset();
    delete process.env.LGQ_SMS_INBOUND_ACTION_WORKER_ENABLED;
  });

  it('is dark unless explicitly enabled', async () => {
    const { smsInboundActionWorkerEnabled } = await import('@/lib/sms-inbound-action-cron');
    expect(smsInboundActionWorkerEnabled()).toBe(false);
    process.env.LGQ_SMS_INBOUND_ACTION_WORKER_ENABLED = '1';
    expect(smsInboundActionWorkerEnabled()).toBe(true);
  });

  it('reports claimed, completed, and failed retry work', async () => {
    runSmsInboundActionBatch.mockResolvedValueOnce({
      claimedCount: 4,
      completedCount: 3,
      failedCount: 1,
    });
    const { runSmsInboundActionCronBatch } = await import('@/lib/sms-inbound-action-cron');
    await expect(runSmsInboundActionCronBatch()).resolves.toEqual({
      requested: 20,
      claimed: 4,
      completed: 3,
      failed: 1,
      failures: 1,
    });
  });

  it('returns one opaque failure without leaking task details', async () => {
    runSmsInboundActionBatch.mockRejectedValueOnce(new Error('recipient +12485550111 failed'));
    const { runSmsInboundActionCronBatch } = await import('@/lib/sms-inbound-action-cron');
    await expect(runSmsInboundActionCronBatch()).resolves.toEqual({
      requested: 20,
      claimed: 0,
      completed: 0,
      failed: 0,
      failures: 1,
    });
  });
});

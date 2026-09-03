import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

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
      requested: 5,
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
      requested: 5,
      claimed: 0,
      completed: 0,
      failed: 0,
      failures: 1,
    });
  });

  it('allows enough route time for bounded AI and media processing', () => {
    const route = readFileSync(
      new URL('../src/app/api/cron/sms-inbound-actions/route.ts', import.meta.url),
      'utf8',
    );
    expect(route).toContain('export const maxDuration = 300');
  });
});

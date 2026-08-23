import { describe, expect, it, vi } from 'vitest';

import { reconcileSmsTextUsage } from '@/lib/sms-usage-reconciliation';

describe('SMS text-usage reconciliation boundary', () => {
  it('returns only reconciled aggregate counts', async () => {
    const rpc = vi.fn(async () => ({
      data: [{ examined: 4, committed: 2, released: 1, unmetered: 1, failed: 0 }],
      error: null,
    }));
    await expect(reconcileSmsTextUsage(25, { rpc } as never)).resolves.toEqual({
      examined: 4, committed: 2, released: 1, unmetered: 1, failed: 0,
    });
    expect(rpc).toHaveBeenCalledWith('reconcile_sms_text_usage', { p_batch_size: 25 });
  });

  it('rejects malformed or non-reconciling database answers', async () => {
    const invalid = { rpc: vi.fn(async () => ({
      data: [{ examined: 2, committed: 1, released: 0, unmetered: 0, failed: 0 }],
      error: null,
    })) } as never;
    await expect(reconcileSmsTextUsage(25, invalid)).rejects.toThrow(/does not reconcile/i);

    const errored = { rpc: vi.fn(async () => ({ data: null, error: { message: 'secret' } })) } as never;
    await expect(reconcileSmsTextUsage(25, errored)).rejects.toThrow(
      'SMS text-usage reconciliation failed.',
    );
  });

  it('bounds the batch before reaching the database', async () => {
    const rpc = vi.fn();
    await expect(reconcileSmsTextUsage(0, { rpc } as never)).rejects.toThrow(/between 1 and 500/i);
    expect(rpc).not.toHaveBeenCalled();
  });
});

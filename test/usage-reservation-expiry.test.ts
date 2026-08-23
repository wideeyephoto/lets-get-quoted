import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/auth', () => ({ createAdminClient: () => ({ rpc }) }));

const {
  runUsageReservationExpirySweep,
  USAGE_RESERVATION_EXPIRY_BATCH_SIZE,
} = await import('@/lib/billing/usage-reservation-expiry-worker');
const {
  summarizeUsageReservationExpirySweep,
  usageReservationExpiryWorkerEnabled,
  USAGE_RESERVATION_EXPIRY_WORKER_FLAG,
} = await import('@/lib/billing/billing-worker-cron');

beforeEach(() => {
  rpc.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('the sweep that gives abandoned credits back', () => {
  it('asks the database for one bounded batch', async () => {
    rpc.mockResolvedValue({ data: 0, error: null });
    await runUsageReservationExpirySweep();
    expect(rpc).toHaveBeenCalledWith('expire_usage_reservations', {
      p_limit: USAGE_RESERVATION_EXPIRY_BATCH_SIZE,
    });
  });

  it('stays inside the bound the function itself enforces', () => {
    // expire_usage_reservations raises 22023 outside 1..1000. A batch size that
    // violates it would fail every run, at 2am, on a job nobody watches.
    expect(USAGE_RESERVATION_EXPIRY_BATCH_SIZE).toBeGreaterThanOrEqual(1);
    expect(USAGE_RESERVATION_EXPIRY_BATCH_SIZE).toBeLessThanOrEqual(1000);
  });

  it('reports what it released', async () => {
    rpc.mockResolvedValue({ data: 7, error: null });
    expect(await runUsageReservationExpirySweep()).toEqual({
      status: 'completed', expired: 7, saturated: false,
    });
  });

  it('treats a full batch as saturated, because more may be waiting', async () => {
    rpc.mockResolvedValue({ data: USAGE_RESERVATION_EXPIRY_BATCH_SIZE, error: null });
    const result = await runUsageReservationExpirySweep();
    expect(result).toMatchObject({ status: 'completed', saturated: true });
  });

  it('reads a count returned as a string', async () => {
    // PostgREST returns bigint-ish values as strings often enough that a worker
    // reading them as numbers silently reports zero forever.
    rpc.mockResolvedValue({ data: '4', error: null });
    expect(await runUsageReservationExpirySweep()).toMatchObject({ expired: 4 });
  });

  it('fails rather than inventing a count when the database errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await runUsageReservationExpirySweep()).toEqual({ status: 'failed' });
  });

  it('fails on a value that is not a whole non-negative count', async () => {
    for (const data of [null, undefined, -1, 1.5, 'many', {}]) {
      rpc.mockResolvedValue({ data, error: null });
      expect(await runUsageReservationExpirySweep()).toEqual({ status: 'failed' });
    }
  });

  it('fails rather than throwing out of the cron handler', async () => {
    rpc.mockRejectedValue(new Error('connection reset'));
    expect(await runUsageReservationExpirySweep()).toEqual({ status: 'failed' });
  });
});

describe('what cron_runs is told', () => {
  it('carries the batch size so saturation can be read back later', () => {
    expect(summarizeUsageReservationExpirySweep({
      status: 'completed', expired: 3, saturated: false,
    })).toEqual({
      status: 'completed',
      expired: 3,
      saturated: false,
      batch_size: USAGE_RESERVATION_EXPIRY_BATCH_SIZE,
    });
  });

  it('reports a failure as zero released, not as a quiet success', () => {
    expect(summarizeUsageReservationExpirySweep({ status: 'failed' })).toEqual({
      status: 'failed',
      expired: 0,
      saturated: false,
      batch_size: USAGE_RESERVATION_EXPIRY_BATCH_SIZE,
    });
  });
});

describe('the flag gate', () => {
  it('is off unless the value is exactly the string 1', () => {
    for (const value of [undefined, '', '0', 'true', 'yes', ' 1', '1 ', 'on']) {
      expect(usageReservationExpiryWorkerEnabled({
        [USAGE_RESERVATION_EXPIRY_WORKER_FLAG]: value,
      })).toBe(false);
    }
    expect(usageReservationExpiryWorkerEnabled({
      [USAGE_RESERVATION_EXPIRY_WORKER_FLAG]: '1',
    })).toBe(true);
  });
});

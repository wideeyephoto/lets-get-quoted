import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { getPlanAccountSettings, listDayJobs } from '@/lib/route-plan-day';

function readClient(results: Array<{ data: unknown; error: unknown }>) {
  const query = {
    select: () => query, eq: () => query, gte: () => query, lte: () => query,
    not: () => query, order: () => query, maybeSingle: () => query,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(results.shift()).then(resolve),
  };
  return { from: () => query } as unknown as SupabaseClient;
}
const span = { workDayHours: 8, workingWeekdays: null, requireSuccessfulRead: true };

describe('dispatch read safety', () => {
  it('rejects failed account settings reads instead of choosing a default time zone', async () => {
    const error = { code: '08006', message: 'Connection lost' };
    await expect(getPlanAccountSettings(readClient([{ data: null, error }]), 'account', { requireSuccessfulRead: true })).rejects.toEqual(error);
  });

  it('rejects a missing account rather than scheduling with fallback settings', async () => {
    await expect(getPlanAccountSettings(readClient([{ data: null, error: null }]), 'account', { requireSuccessfulRead: true })).rejects.toThrow('unavailable');
  });

  it('distinguishes failed schedule reads from an empty workday', async () => {
    const error = { code: '08006', message: 'Connection lost' };
    await expect(listDayJobs(readClient([{ data: null, error }]), 'account', '2026-09-06', null, span)).rejects.toEqual(error);
    const empty = await listDayJobs(readClient([{ data: [], error: null }]), 'account', '2026-09-06', null, span);
    expect(empty.jobs).toEqual([]);
  });

  it('also surfaces failure of the legacy-column fallback query', async () => {
    const error = { code: '08006', message: 'Connection lost' };
    const client = readClient([
      { data: null, error: { code: '42703', message: 'column scheduled_until does not exist' } },
      { data: null, error },
    ]);
    await expect(listDayJobs(client, 'account', '2026-09-06', null, span)).rejects.toEqual(error);
  });
});

import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_QUICK_STOP_TIME_ZONE,
  QUICK_STOP_NO_SHOW_GRACE_MS,
  loadQuickStopTimeZone,
  quickStopNoShowEligibility,
  quickStopWindowEndMs,
  quickStopZonedInstant,
} from '@/lib/quick-stop-time';

const originalHostZone = process.env.TZ;
afterEach(() => {
  if (originalHostZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalHostZone;
});

describe('Quick Stop account-local arrival times', () => {
  it.each(['UTC', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo'])(
    'uses the account zone when the host is %s',
    (hostZone) => {
      process.env.TZ = hostZone;
      expect(quickStopZonedInstant('2026-09-14', '15:00', 'America/Los_Angeles')?.toISOString()).toBe('2026-09-14T22:00:00.000Z');
      expect(quickStopZonedInstant('2026-01-14', '15:00:00', 'America/Los_Angeles')?.toISOString()).toBe('2026-01-14T23:00:00.000Z');
    },
  );

  it('uses the offset at the appointment across the spring-forward boundary', () => {
    expect(quickStopZonedInstant('2026-03-08', '01:30', 'America/New_York')?.toISOString()).toBe('2026-03-08T06:30:00.000Z');
    expect(quickStopZonedInstant('2026-03-08', '03:30', 'America/New_York')?.toISOString()).toBe('2026-03-08T07:30:00.000Z');
    expect(quickStopZonedInstant('2026-03-08', '02:30', 'America/New_York')).toBeNull();
  });

  it('uses the later occurrence when a clock time repeats during fall-back', () => {
    expect(quickStopZonedInstant('2026-11-01', '01:30', 'America/New_York')?.toISOString()).toBe('2026-11-01T06:30:00.000Z');
    expect(quickStopZonedInstant('2026-11-01', '03:30', 'America/New_York')?.toISOString()).toBe('2026-11-01T08:30:00.000Z');
  });

  it('supports fractional offsets, non-hour DST changes and date-line boundaries', () => {
    expect(quickStopZonedInstant('2026-09-14', '09:15', 'Asia/Kathmandu')?.toISOString()).toBe('2026-09-14T03:30:00.000Z');
    expect(quickStopZonedInstant('2026-10-04', '02:15', 'Australia/Lord_Howe')).toBeNull();
    expect(quickStopZonedInstant('2026-04-05', '01:45', 'Australia/Lord_Howe')?.toISOString()).toBe('2026-04-04T15:15:00.000Z');
    expect(quickStopZonedInstant('2026-09-14', '00:15', 'Pacific/Kiritimati')?.toISOString()).toBe('2026-09-13T10:15:00.000Z');
    expect(quickStopZonedInstant('2011-12-30', '12:00', 'Pacific/Apia')).toBeNull();
  });

  it.each([
    ['2026-02-29', '15:00', 'UTC'],
    ['2026-02-30', '15:00', 'UTC'],
    ['2026-13-01', '15:00', 'UTC'],
    ['2026-00-01', '15:00', 'UTC'],
    ['2026-09-00', '15:00', 'UTC'],
    ['2026-9-14', '15:00', 'UTC'],
    ['2026-09-14', '24:00', 'UTC'],
    ['2026-09-14', '15:60', 'UTC'],
    ['2026-09-14', '15:00:60', 'UTC'],
    ['2026-09-14', '15:00Z', 'UTC'],
    ['2026-09-14', '15:00', 'Unknown/Zone'],
    [null, '15:00', 'UTC'],
    ['2026-09-14', null, 'UTC'],
    ['2026-09-14', '15:00', null],
  ])('rejects invalid date/time/zone %s %s %s', (day, time, zone) => {
    expect(quickStopZonedInstant(day, time, zone)).toBeNull();
  });

  it('accepts a real leap day and preserves seconds', () => {
    expect(quickStopZonedInstant('2028-02-29', '23:59:59', 'UTC')?.toISOString()).toBe('2028-02-29T23:59:59.000Z');
  });
});

describe('Quick Stop no-show reporting eligibility', () => {
  const request = {
    status: 'confirmed',
    payment_id: 'payment-1',
    job_id: 'job-1',
    paid_at: '2026-09-14T17:00:00.000Z',
    arrived_at: null,
    arrival_date: '2026-09-14',
    arrival_start: '14:00',
    arrival_end: '15:00',
  };
  const endMs = Date.parse('2026-09-14T22:00:00.000Z');
  const zone = 'America/Los_Angeles';

  it('opens at the actual window end and remains open through exactly two elapsed hours', () => {
    expect(quickStopWindowEndMs(request, zone)).toBe(endMs);
    expect(quickStopNoShowEligibility(request, zone, endMs - 1)).toBe('early');
    expect(quickStopNoShowEligibility(request, zone, endMs)).toBe('eligible');
    expect(quickStopNoShowEligibility({ ...request, status: 'en_route' }, zone, endMs + QUICK_STOP_NO_SHOW_GRACE_MS)).toBe('eligible');
    expect(quickStopNoShowEligibility(request, zone, endMs + QUICK_STOP_NO_SHOW_GRACE_MS + 1)).toBe('late');
  });

  it.each([
    { status: 'requested' },
    { status: 'awaiting_customer_payment' },
    { status: 'arrived' },
    { status: 'completed' },
    { status: 'customer_canceled' },
    { paid_at: null },
    { paid_at: 'invalid' },
    { paid_at: '2026-09-15T12:00:00Z' },
    { payment_id: null },
    { job_id: null },
    { arrived_at: '2026-09-14T21:30:00Z' },
    { completed_at: '2026-09-14T21:30:00Z' },
    { arrival_date: null },
    { arrival_start: null },
    { arrival_end: null },
    { arrival_start: '16:00' },
    { arrival_start: '15:00' },
  ])('requires a paid unarrived scheduled request: %j', (overrides) => {
    expect(quickStopNoShowEligibility({ ...request, ...overrides }, zone, endMs)).toBe('state');
  });

  it('fails closed when the account zone or clock is unavailable', () => {
    expect(quickStopNoShowEligibility(request, null, endMs)).toBe('state');
    expect(quickStopNoShowEligibility(request, 'invalid', endMs)).toBe('state');
    expect(quickStopNoShowEligibility(request, zone, NaN)).toBe('state');
  });

  it('does not open at the first occurrence of a repeated window end', () => {
    const repeated = { ...request, arrival_date: '2026-11-01', arrival_start: '00:30', arrival_end: '01:30' };
    expect(quickStopNoShowEligibility(repeated, 'America/New_York', Date.parse('2026-11-01T05:30:00Z'))).toBe('early');
    expect(quickStopNoShowEligibility(repeated, 'America/New_York', Date.parse('2026-11-01T06:30:00Z'))).toBe('eligible');
    expect(quickStopNoShowEligibility(repeated, 'America/New_York', Date.parse('2026-11-01T08:30:00Z'))).toBe('eligible');
  });
});

describe('account timezone loading', () => {
  function client(data: unknown, error: unknown = null) {
    const chain = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    };
    return { admin: chain as unknown as SupabaseClient, chain };
  }

  it('scopes the lookup to the requested account', async () => {
    const { admin, chain } = client({ timezone: 'America/Los_Angeles' });
    expect(await loadQuickStopTimeZone(admin, 'account-1')).toBe('America/Los_Angeles');
    expect(chain.from).toHaveBeenCalledWith('accounts');
    expect(chain.select).toHaveBeenCalledWith('timezone');
    expect(chain.eq).toHaveBeenCalledWith('id', 'account-1');
  });

  it('uses the booking default only when an existing account has no zone', async () => {
    for (const timezone of [null, '', undefined]) {
      expect(await loadQuickStopTimeZone(client({ timezone }).admin, 'account-1')).toBe(DEFAULT_QUICK_STOP_TIME_ZONE);
    }
  });

  it('does not guess a zone after a missing account, invalid value or query failure', async () => {
    expect(await loadQuickStopTimeZone(client(null).admin, 'account-1')).toBeNull();
    expect(await loadQuickStopTimeZone(client({ timezone: 'Unknown/Zone' }).admin, 'account-1')).toBeNull();
    expect(await loadQuickStopTimeZone(client({ timezone: 5 }).admin, 'account-1')).toBeNull();
    expect(await loadQuickStopTimeZone(client({ timezone: 'UTC' }, { message: 'offline' }).admin, 'account-1')).toBeNull();
    const failing = client(null);
    failing.chain.maybeSingle.mockRejectedValue(new Error('offline'));
    expect(await loadQuickStopTimeZone(failing.admin, 'account-1')).toBeNull();
  });
});

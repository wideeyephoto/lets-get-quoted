import { describe, it, expect } from 'vitest';
import { computeCustomerRefundPercent } from '@/lib/quick-stop-refunds';
import type { QuickStopRequest } from '@/lib/quick-stop-requests';

// A fixed "now" and helpers to build a request at various lifecycle points.
// TZ is explicit and NOW is a real instant: the arrival window below is wall clock
// in TZ, so 20:00 in New York is 2026-07-30T00:00Z, and "now" has to be an
// absolute moment for the comparison to mean anything.
const TZ = 'America/New_York';
const NOW = new Date('2026-07-29T22:00:00Z').getTime(); // 18:00 in New York
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

function req(partial: Partial<QuickStopRequest>): QuickStopRequest {
  return {
    paid_at: null,
    en_route_at: null,
    arrived_at: null,
    arrival_date: '2026-07-29',
    arrival_end: '20:00', // window still open at NOW (18:00)
    ...partial,
  } as QuickStopRequest;
}

describe('computeCustomerRefundPercent — cancellation tiers', () => {
  it('unpaid → full (no-op) refund', () => {
    expect(computeCustomerRefundPercent(req({ paid_at: null }), TZ, NOW)).toBe(100);
  });

  it('within 5 minutes of paying → 100%', () => {
    expect(computeCustomerRefundPercent(req({ paid_at: minsAgo(2) }), TZ, NOW)).toBe(100);
    expect(computeCustomerRefundPercent(req({ paid_at: minsAgo(5) }), TZ, NOW)).toBe(100);
  });

  it('paid, before en route → 75%', () => {
    expect(computeCustomerRefundPercent(req({ paid_at: minsAgo(30) }), TZ, NOW)).toBe(75);
  });

  it('paid, en route but not arrived → 25%', () => {
    expect(computeCustomerRefundPercent(req({ paid_at: minsAgo(30), en_route_at: minsAgo(10) }), TZ, NOW)).toBe(25);
  });

  it('paid and arrived → 0%', () => {
    expect(computeCustomerRefundPercent(req({ paid_at: minsAgo(60), en_route_at: minsAgo(40), arrived_at: minsAgo(20) }), TZ, NOW)).toBe(0);
  });

  it('contractor missed the window (past end, never arrived) → 100%, overriding en-route tier', () => {
    // Window ended at 17:00, NOW is 18:00, en route but never arrived.
    const r = req({ paid_at: minsAgo(90), en_route_at: minsAgo(60), arrived_at: null, arrival_end: '17:00' });
    expect(computeCustomerRefundPercent(r, TZ, NOW)).toBe(100);
  });

  it('arrived counts even if the window later elapsed → 0%', () => {
    const r = req({ paid_at: minsAgo(120), arrived_at: minsAgo(70), arrival_end: '17:00' });
    expect(computeCustomerRefundPercent(r, TZ, NOW)).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import { calculateQuotePriceLock } from '../src/lib/quote-expiration';

describe('Quote Price Lock & Expiration', () => {
  it('calculates price lock expiration correctly for recent quotes', () => {
    const now = new Date('2026-08-24T12:00:00Z');
    const created = '2026-08-20T12:00:00Z'; // 4 days ago

    const lock = calculateQuotePriceLock(created, 14, now);

    expect(lock.daysRemaining).toBe(10);
    expect(lock.isExpired).toBe(false);
    expect(lock.isUrgent).toBe(false);
    expect(lock.badgeText).toContain('10 days left');
  });

  it('flags urgent state when 3 or fewer days remain', () => {
    const now = new Date('2026-08-24T12:00:00Z');
    const created = '2026-08-12T12:00:00Z'; // 12 days ago

    const lock = calculateQuotePriceLock(created, 14, now);

    expect(lock.daysRemaining).toBe(2);
    expect(lock.isExpired).toBe(false);
    expect(lock.isUrgent).toBe(true);
    expect(lock.badgeText).toContain('expires in 2 days');
  });

  it('flags expired state when expiration date passes', () => {
    const now = new Date('2026-08-24T12:00:00Z');
    const created = '2026-08-01T12:00:00Z'; // 23 days ago

    const lock = calculateQuotePriceLock(created, 14, now);

    expect(lock.daysRemaining).toBe(0);
    expect(lock.isExpired).toBe(true);
    expect(lock.badgeText).toContain('price lock expired');
  });
});

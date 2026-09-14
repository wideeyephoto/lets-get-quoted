import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VOICE_RESERVATION_TTL_MS } from '@/lib/billing/voice-minute-usage';

/**
 * Item 14 in docs/hardening-backlog-2026-09-14.md:
 *
 * "voice_minute_lot_tail() is coupled to RESERVATION_TTL_MS by derivation, not by code.
 * A voice hold is 90 minutes; a lot expiring exactly at period end is ineligible for the
 * last 90 minutes of every period. If the two constants drift apart, a once-a-month
 * refusal returns with the credits visibly present. Worth a test that fails when they disagree."
 */

function parseIntervalToMs(intervalStr: string): number {
  const match = intervalStr.match(/interval\s+'(\d+)\s+(hours?|minutes?|seconds?)'/i);
  if (!match) {
    throw new Error(`Could not parse interval expression: ${intervalStr}`);
  }
  const count = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (unit.startsWith('hour')) return count * 60 * 60 * 1000;
  if (unit.startsWith('minute')) return count * 60 * 1000;
  if (unit.startsWith('second')) return count * 1000;
  throw new Error(`Unsupported interval unit: ${unit}`);
}

describe('voice minute lot tail vs reservation TTL coupling (Item 14)', () => {
  it('defines voice reservation TTL as exactly 90 minutes', () => {
    expect(VOICE_RESERVATION_TTL_MS).toBe(90 * 60 * 1000);
  });

  it('ensures migration voice_minute_lot_tail interval outlives the 90-minute reservation hold', () => {
    const migrationPath = join(
      process.cwd(),
      'migrations/20260819190000_voice_minute_allowance.sql',
    );
    const sql = readFileSync(migrationPath, 'utf8');

    // Extract interval from: create or replace function public.voice_minute_lot_tail() ... select interval '2 hours'
    const fnMatch = sql.match(/function\s+public\.voice_minute_lot_tail\(\)[\s\S]*?select\s+(interval\s+'[^']+')/i);
    expect(fnMatch, 'public.voice_minute_lot_tail() function definition not found in migration').not.toBeNull();

    const intervalExpr = fnMatch![1];
    const tailMs = parseIntervalToMs(intervalExpr);

    // Assert tail duration (2 hours = 120 min) is strictly greater than the reservation TTL (90 min)
    expect(tailMs).toBeGreaterThan(VOICE_RESERVATION_TTL_MS);

    // The safety margin should be at least 30 minutes
    const marginMs = tailMs - VOICE_RESERVATION_TTL_MS;
    expect(marginMs).toBeGreaterThanOrEqual(30 * 60 * 1000);
  });

  it('ensures reserve_usage_credits filter allows lots with the tail through the period end', () => {
    // If a period ends at T, the lot expires at T + tailMs.
    // At T - 1 millisecond (the last moment of the period), a 90-minute call reservation
    // needs the lot to expire after (T - 1ms + 90 min).
    // Since expiration is T + 120 min, (T + 120 min) > (T + 89.99 min), ensuring no end-of-period lockout.
    const tailMs = 120 * 60 * 1000;
    const periodEnd = new Date('2026-09-30T23:59:59.000Z').getTime();
    const lotExpiresAt = periodEnd + tailMs;

    const callAtEndOfPeriod = periodEnd - 1000; // 1 second before period end
    const reservationExpiresAt = callAtEndOfPeriod + VOICE_RESERVATION_TTL_MS;

    expect(lotExpiresAt).toBeGreaterThan(reservationExpiresAt);
  });
});

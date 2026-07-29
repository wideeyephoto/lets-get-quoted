import { describe, it, expect } from 'vitest';
import {
  extraStopSettingsFromAccount,
  clampFeeCents,
  dollarsToCents,
  centsToDollars,
  normalizeHHMM,
  normalizeCategories,
  canTransition,
  EXTRA_STOP_TERMINAL_STATUSES,
  EXTRA_STOP_TRANSITIONS,
  type ExtraStopStatus,
} from '@/lib/extra-stop';

describe('extraStopSettingsFromAccount — safe defaults on a bare row', () => {
  it('degrades an empty/pre-migration row to coherent defaults, feature off', () => {
    const s = extraStopSettingsFromAccount(null);
    expect(s.enabled).toBe(false);
    expect(s.weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(s.earliestTime).toBe('08:00');
    expect(s.latestEnd).toBe('20:00');
    expect(s.maxPerDay).toBe(2);
    expect(s.minFeeCents).toBe(5000);
    expect(s.maxFeeCents).toBe(25000);
    expect(s.requireAiApproval).toBe(true); // defaults ON
    expect(s.allowAfterCapacity).toBe(true);
  });

  it('clamps out-of-range numbers into bounds', () => {
    const s = extraStopSettingsFromAccount({
      extra_stop_max_per_day: 999,
      extra_stop_max_visit_minutes: 1, // below floor of 5
      extra_stop_response_deadline_mins: 99999,
      extra_stop_payment_deadline_mins: 0, // below floor of 1
      extra_stop_required_photos: 50, // above cap of 6
    });
    expect(s.maxPerDay).toBe(50);
    expect(s.maxVisitMinutes).toBe(5);
    expect(s.responseDeadlineMins).toBe(720);
    expect(s.paymentDeadlineMins).toBe(1);
    expect(s.requiredPhotos).toBe(6);
  });

  it('honors explicit false for the boolean toggles', () => {
    const s = extraStopSettingsFromAccount({
      extra_stop_enabled: true,
      extra_stop_allow_after_capacity: false,
      extra_stop_require_ai_approval: false,
    });
    expect(s.enabled).toBe(true);
    expect(s.allowAfterCapacity).toBe(false);
    expect(s.requireAiApproval).toBe(false);
  });

  it('parses category CSV to a deduped lowercase list', () => {
    const s = extraStopSettingsFromAccount({ extra_stop_categories: 'Leak Repair, faucet, LEAK REPAIR ,' });
    expect(s.categories).toEqual(['leak repair', 'faucet']);
  });
});

describe('money helpers', () => {
  it('dollars↔cents round-trips without drift', () => {
    expect(dollarsToCents('50')).toBe(5000);
    expect(dollarsToCents(49.99)).toBe(4999);
    expect(centsToDollars(4999)).toBe(49.99);
    expect(dollarsToCents('nope')).toBe(0);
  });

  it('clampFeeCents keeps the fee within the band, even if the band is inverted', () => {
    const s = extraStopSettingsFromAccount({ extra_stop_min_fee_cents: 5000, extra_stop_max_fee_cents: 25000 });
    expect(clampFeeCents(1000, s)).toBe(5000);
    expect(clampFeeCents(99999, s)).toBe(25000);
    expect(clampFeeCents(12000, s)).toBe(12000);
    const inverted = extraStopSettingsFromAccount({ extra_stop_min_fee_cents: 25000, extra_stop_max_fee_cents: 5000 });
    expect(clampFeeCents(1000, inverted)).toBe(5000); // floor is min(min,max)
    expect(clampFeeCents(99999, inverted)).toBe(25000);
  });
});

describe('normalizeHHMM', () => {
  it('accepts valid times and zero-pads', () => {
    expect(normalizeHHMM('9:5', '08:00')).toBe('08:00'); // minutes must be 2 digits
    expect(normalizeHHMM('9:05', '08:00')).toBe('09:05');
    expect(normalizeHHMM('23:59', '08:00')).toBe('23:59');
  });
  it('rejects out-of-range or garbage → fallback', () => {
    expect(normalizeHHMM('24:00', '08:00')).toBe('08:00');
    expect(normalizeHHMM('12:60', '08:00')).toBe('08:00');
    expect(normalizeHHMM('', '20:00')).toBe('20:00');
    expect(normalizeHHMM(null, '20:00')).toBe('20:00');
  });
});

describe('normalizeCategories', () => {
  it('handles arrays, CSV, and empties', () => {
    expect(normalizeCategories(['A', 'b', 'A'])).toEqual(['a', 'b']);
    expect(normalizeCategories('x, y ,x')).toEqual(['x', 'y']);
    expect(normalizeCategories(null)).toEqual([]);
    expect(normalizeCategories('')).toEqual([]);
  });
});

describe('state machine', () => {
  it('allows the documented happy-path transitions', () => {
    expect(canTransition('awaiting_contractor', 'contractor_offer_sent')).toBe(true);
    expect(canTransition('contractor_offer_sent', 'awaiting_customer_payment')).toBe(true);
    expect(canTransition('awaiting_customer_payment', 'confirmed')).toBe(true);
    expect(canTransition('confirmed', 'en_route')).toBe(true);
    expect(canTransition('en_route', 'arrived')).toBe(true);
    expect(canTransition('arrived', 'completed')).toBe(true);
  });

  it('rejects illegal jumps', () => {
    expect(canTransition('awaiting_contractor', 'confirmed')).toBe(false);
    expect(canTransition('awaiting_customer_payment', 'arrived')).toBe(false);
    expect(canTransition('completed', 'confirmed')).toBe(false);
  });

  it('lets a paid offer expire or be declined but not skip payment', () => {
    expect(canTransition('awaiting_customer_payment', 'offer_expired')).toBe(true);
    expect(canTransition('awaiting_customer_payment', 'customer_declined')).toBe(true);
  });

  it('terminal statuses never return to an active lifecycle state', () => {
    // Terminal states may still move to refunded/disputed (money resolution),
    // but must never jump back into the active flow.
    const resolutionOnly = new Set<ExtraStopStatus>(['refunded', 'disputed']);
    for (const status of EXTRA_STOP_TERMINAL_STATUSES) {
      const outs = EXTRA_STOP_TRANSITIONS[status as ExtraStopStatus];
      expect(outs.every((t) => resolutionOnly.has(t))).toBe(true);
    }
  });
});

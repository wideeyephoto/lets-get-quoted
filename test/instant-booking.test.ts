import { describe, it, expect } from 'vitest';
import { evaluateBookingEligibility, normalizeInstantBookMinAmount, type BookingGateSignals } from '@/lib/instant-booking';

const base: BookingGateSignals = {
  enabled: true,
  minAmount: 1000,
  fullyBooked: false,
  estimateMax: 4000,
  inArea: true,
  excluded: false,
};

describe('evaluateBookingEligibility', () => {
  it('is open to everyone when the gate is off', () => {
    const v = evaluateBookingEligibility({ ...base, enabled: false, estimateMax: 20 });
    expect(v.tier).toBe('disabled');
    expect(v.eligible).toBe(true);
  });

  it('lets a qualified, in-area, above-floor job book instantly', () => {
    expect(evaluateBookingEligibility(base)).toMatchObject({ tier: 'instant', eligible: true });
  });

  it('routes a below-floor estimate to the value fallback (the $50-job case)', () => {
    const v = evaluateBookingEligibility({ ...base, estimateMax: 50 });
    expect(v).toMatchObject({ tier: 'value_fallback', eligible: false });
  });

  it('soft-passes an UNKNOWN estimate (booking is a request the owner approves)', () => {
    const v = evaluateBookingEligibility({ ...base, estimateMax: null });
    expect(v).toMatchObject({ tier: 'instant', eligible: true });
  });

  it('never blocks on value when no floor is set', () => {
    expect(evaluateBookingEligibility({ ...base, minAmount: 0, estimateMax: 20 })).toMatchObject({ tier: 'instant' });
  });

  it('fully-booked wins over everything', () => {
    expect(evaluateBookingEligibility({ ...base, fullyBooked: true }).tier).toBe('booked_fallback');
  });

  it('excluded work and out-of-area route to their own fallbacks', () => {
    expect(evaluateBookingEligibility({ ...base, excluded: true }).tier).toBe('excluded_fallback');
    expect(evaluateBookingEligibility({ ...base, inArea: false }).tier).toBe('area_fallback');
  });

  it('treats unknown in_area (null) as in-area (soft)', () => {
    expect(evaluateBookingEligibility({ ...base, inArea: null }).tier).toBe('instant');
  });

  it('checks posture before value — a below-floor out-of-area job reports out-of-area', () => {
    const v = evaluateBookingEligibility({ ...base, inArea: false, estimateMax: 50 });
    expect(v.tier).toBe('area_fallback');
  });
});

describe('normalizeInstantBookMinAmount', () => {
  it('keeps positive integers, else 0 (off)', () => {
    expect(normalizeInstantBookMinAmount('1500')).toBe(1500);
    expect(normalizeInstantBookMinAmount(0)).toBe(0);
    expect(normalizeInstantBookMinAmount(-5)).toBe(0);
    expect(normalizeInstantBookMinAmount('abc')).toBe(0);
  });
});

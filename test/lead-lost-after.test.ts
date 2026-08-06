import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LEAD_LOST_AFTER_DAYS,
  LEAD_LOST_AFTER_CHOICES,
  LEAD_LOST_NEVER,
  leadLostAfterLabel,
  normalizeLeadLostAfterDays,
} from '@/lib/leads';

// How long a lead gets before the app marks it Lost. This writes to real leads
// on four different page loads, so the parsing is worth pinning down: a wrong
// answer here closes somebody's live pipeline without asking.

describe('normalizeLeadLostAfterDays', () => {
  it('keeps a value the owner actually chose', () => {
    expect(normalizeLeadLostAfterDays(7)).toBe(7);
    expect(normalizeLeadLostAfterDays(90)).toBe(90);
    expect(normalizeLeadLostAfterDays('45')).toBe(45);
  });

  it('KEEPS ZERO, because zero is "never" and not "unset"', () => {
    // The whole reason this is a function rather than `Number(value) || 30`.
    // Falsy-checking would turn the one setting that means "stop closing my
    // leads" into the default that closes them after a month.
    expect(normalizeLeadLostAfterDays(0)).toBe(0);
    expect(normalizeLeadLostAfterDays('0')).toBe(0);
    expect(normalizeLeadLostAfterDays(LEAD_LOST_NEVER)).toBe(LEAD_LOST_NEVER);
  });

  it('falls back to the old fixed window when the column is missing', () => {
    // Between deploying the code and running the migration by hand, every read
    // comes back undefined — and the correct behaviour there is exactly what
    // the app did yesterday.
    expect(normalizeLeadLostAfterDays(undefined)).toBe(DEFAULT_LEAD_LOST_AFTER_DAYS);
    expect(normalizeLeadLostAfterDays(null)).toBe(DEFAULT_LEAD_LOST_AFTER_DAYS);
  });

  it('refuses nonsense rather than passing it to a date calculation', () => {
    expect(normalizeLeadLostAfterDays('soon')).toBe(DEFAULT_LEAD_LOST_AFTER_DAYS);
    expect(normalizeLeadLostAfterDays(-5)).toBe(DEFAULT_LEAD_LOST_AFTER_DAYS);
    expect(normalizeLeadLostAfterDays(99999)).toBe(DEFAULT_LEAD_LOST_AFTER_DAYS);
    expect(normalizeLeadLostAfterDays(Number.NaN)).toBe(DEFAULT_LEAD_LOST_AFTER_DAYS);
  });

  it('rounds a fractional day rather than producing a fractional cutoff', () => {
    expect(normalizeLeadLostAfterDays(30.4)).toBe(30);
    expect(normalizeLeadLostAfterDays(30.6)).toBe(31);
  });
});

describe('leadLostAfterLabel', () => {
  it('says never in words, not as a number', () => {
    expect(leadLostAfterLabel(LEAD_LOST_NEVER)).toContain('Never');
  });

  it('shows the week count for the short windows people think in', () => {
    expect(leadLostAfterLabel(7)).toBe('7 days (1 week)');
    expect(leadLostAfterLabel(14)).toBe('14 days (2 weeks)');
  });

  it('drops the week count once it stops helping', () => {
    expect(leadLostAfterLabel(90)).toBe('90 days');
    expect(leadLostAfterLabel(45)).toBe('45 days');
  });
});

describe('LEAD_LOST_AFTER_CHOICES', () => {
  it('offers the current default, so an untouched account sees its own value', () => {
    expect(LEAD_LOST_AFTER_CHOICES).toContain(DEFAULT_LEAD_LOST_AFTER_DAYS);
  });

  it('offers turning it off', () => {
    expect(LEAD_LOST_AFTER_CHOICES).toContain(LEAD_LOST_NEVER);
  });

  it('survives its own normaliser — every choice round-trips', () => {
    for (const days of LEAD_LOST_AFTER_CHOICES) {
      expect(normalizeLeadLostAfterDays(String(days))).toBe(days);
    }
  });
});

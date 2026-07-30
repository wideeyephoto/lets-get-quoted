import { describe, it, expect } from 'vitest';
import { AUTOMATION_COLUMNS, isAutomationKey } from '@/lib/automations';

describe('automation toggle map', () => {
  it('maps each switchable automation to its own accounts column', () => {
    expect(AUTOMATION_COLUMNS).toEqual({
      'extra-stop': 'extra_stop_enabled',
      'missed-call': 'call_textback_enabled',
      reviews: 'auto_review_request',
      followups: 'quote_followups_enabled',
      reminders: 'appointment_reminders_enabled',
      'daily-digest': 'daily_digest_enabled',
    });
  });

  it('never points two automations at the same column', () => {
    const columns = Object.values(AUTOMATION_COLUMNS);
    expect(new Set(columns).size).toBe(columns.length);
  });

  it('keys match the card anchors used for deep links', () => {
    // The <details id> on each card doubles as the toggle key, so #reviews and
    // friends keep resolving.
    for (const key of Object.keys(AUTOMATION_COLUMNS)) {
      expect(key).toMatch(/^[a-z-]+$/);
    }
  });

  it('rejects anything not on the list, so a bad key can never write a column', () => {
    expect(isAutomationKey('reviews')).toBe(true);
    expect(isAutomationKey('daily-digest')).toBe(true);
    // Real automations that deliberately have no switch.
    expect(isAutomationKey('intake-ai')).toBe(false);
    expect(isAutomationKey('booking')).toBe(false);
    // Junk and prototype-chain probes.
    expect(isAutomationKey('')).toBe(false);
    expect(isAutomationKey('suspended_at')).toBe(false);
    expect(isAutomationKey('toString')).toBe(false);
    expect(isAutomationKey('constructor')).toBe(false);
  });
});

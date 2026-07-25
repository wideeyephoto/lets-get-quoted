import { describe, it, expect } from 'vitest';
import { resolveTabForHash, shouldAutoOpenCreate } from '@/lib/nav-helpers';

// Mirrors the real settings tab config (id + the section ids each tab owns).
const TABS = [
  { id: 'account' },
  { id: 'payments', anchors: ['deposits'] },
  { id: 'automations', anchors: ['reviews', 'followups', 'reminders', 'daily-digest'] },
  { id: 'business', anchors: ['marketing-address', 'finances'] },
];

describe('resolveTabForHash', () => {
  it('matches a tab by its own id (with or without leading #)', () => {
    expect(resolveTabForHash(TABS, '#payments')).toBe('payments');
    expect(resolveTabForHash(TABS, 'account')).toBe('account');
  });

  it('resolves a deep-link anchor to the tab that owns it', () => {
    // The real deep links: #reviews / #daily-digest from other pages & emails,
    // #finances from the tax-year links, #deposits from Payments.
    expect(resolveTabForHash(TABS, '#reviews')).toBe('automations');
    expect(resolveTabForHash(TABS, '#daily-digest')).toBe('automations');
    expect(resolveTabForHash(TABS, '#reminders')).toBe('automations');
    expect(resolveTabForHash(TABS, '#finances')).toBe('business');
    expect(resolveTabForHash(TABS, '#marketing-address')).toBe('business');
    expect(resolveTabForHash(TABS, '#deposits')).toBe('payments');
  });

  it('returns null for empty, missing, or unknown hashes', () => {
    expect(resolveTabForHash(TABS, '')).toBeNull();
    expect(resolveTabForHash(TABS, '#')).toBeNull();
    expect(resolveTabForHash(TABS, null)).toBeNull();
    expect(resolveTabForHash(TABS, undefined)).toBeNull();
    expect(resolveTabForHash(TABS, '#nope')).toBeNull();
  });
});

describe('shouldAutoOpenCreate', () => {
  it('opens when the list is empty regardless of the flag', () => {
    expect(shouldAutoOpenCreate(0, undefined)).toBe(true);
    expect(shouldAutoOpenCreate(0, '1')).toBe(true);
  });

  it('opens when the URL flag is present (?new / ?add)', () => {
    expect(shouldAutoOpenCreate(12, '1')).toBe(true);
    expect(shouldAutoOpenCreate(12, '')).toBe(true);
  });

  it('stays closed with items and no flag', () => {
    expect(shouldAutoOpenCreate(12, undefined)).toBe(false);
    expect(shouldAutoOpenCreate(1, undefined)).toBe(false);
  });
});

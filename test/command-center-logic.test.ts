import { describe, it, expect } from 'vitest';
import { STAFF_ROLES, type StaffRole } from '../src/lib/staff';
import {
  isDateRange,
  rangeWindow,
  computeTrend,
  severityForDeadline,
  severityForDunningState,
  severityForIncident,
  severityForOnboardingAge,
  relativeAge,
  defaultCardOrder,
  moveWithinVisible,
  CARD_KEYS,
} from '../src/lib/command-center-logic';

describe('isDateRange', () => {
  it('accepts the three known ranges', () => {
    expect(isDateRange('7d')).toBe(true);
    expect(isDateRange('30d')).toBe(true);
    expect(isDateRange('90d')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isDateRange('60d')).toBe(false);
    expect(isDateRange('')).toBe(false);
    expect(isDateRange(undefined)).toBe(false);
    expect(isDateRange(null)).toBe(false);
  });
});

describe('rangeWindow', () => {
  const now = new Date('2026-08-06T00:00:00.000Z');

  it('makes the current window exactly one range-length ending at now', () => {
    const win = rangeWindow('7d', now);
    expect(win.currentEnd).toBe(now.toISOString());
    expect(win.currentStart).toBe(new Date('2026-07-30T00:00:00.000Z').toISOString());
  });

  it('butts the previous window up against the current one with no gap or overlap', () => {
    const win = rangeWindow('30d', now);
    expect(win.previousEnd).toBe(win.currentStart);
    expect(win.previousStart).toBe(new Date('2026-06-07T00:00:00.000Z').toISOString());
  });

  it('scales the window length per range', () => {
    const win = rangeWindow('90d', now);
    const spanDays = (new Date(win.currentEnd).getTime() - new Date(win.currentStart).getTime()) / (24 * 60 * 60 * 1000);
    expect(spanDays).toBe(90);
  });
});

describe('computeTrend', () => {
  it('flags up/down/flat correctly', () => {
    expect(computeTrend(10, 5).direction).toBe('up');
    expect(computeTrend(5, 10).direction).toBe('down');
    expect(computeTrend(5, 5).direction).toBe('flat');
  });

  it('returns a null deltaPct with no prior-period baseline', () => {
    const trend = computeTrend(5, 0);
    expect(trend.deltaPct).toBeNull();
    expect(trend.direction).toBe('up');
  });

  it('computes a signed percentage change off a nonzero baseline', () => {
    expect(computeTrend(150, 100).deltaPct).toBe(50);
    expect(computeTrend(50, 100).deltaPct).toBe(-50);
  });
});

describe('severityForDeadline', () => {
  const now = new Date('2026-08-06T12:00:00.000Z');

  it('is neutral with no deadline or an unparseable one', () => {
    expect(severityForDeadline(null, now)).toBe('neutral');
    expect(severityForDeadline('not-a-date', now)).toBe('neutral');
  });

  it('is warn for a deadline still in the future', () => {
    expect(severityForDeadline('2026-08-07T00:00:00.000Z', now)).toBe('warn');
  });

  it('is bad the instant a zero-grace deadline passes', () => {
    expect(severityForDeadline('2026-08-06T11:59:59.000Z', now)).toBe('bad');
  });

  it('stays warn while within the grace period, then escalates to bad past it', () => {
    const graceMs = 24 * 60 * 60 * 1000;
    expect(severityForDeadline('2026-08-06T00:00:00.000Z', now, graceMs)).toBe('warn');
    expect(severityForDeadline('2026-08-04T00:00:00.000Z', now, graceMs)).toBe('bad');
  });
});

describe('severityForDunningState', () => {
  it('maps exhausted to bad and needs_card to warn', () => {
    expect(severityForDunningState('exhausted')).toBe('bad');
    expect(severityForDunningState('needs_card')).toBe('warn');
  });

  it('treats anything else, including null, as neutral', () => {
    expect(severityForDunningState('retrying')).toBe('neutral');
    expect(severityForDunningState(null)).toBe('neutral');
  });
});

describe('severityForIncident', () => {
  it('maps critical to bad and warning to warn', () => {
    expect(severityForIncident('critical')).toBe('bad');
    expect(severityForIncident('warning')).toBe('warn');
  });

  it('treats anything else as neutral', () => {
    expect(severityForIncident('info')).toBe('neutral');
  });
});

describe('severityForOnboardingAge', () => {
  const now = new Date('2026-08-06T00:00:00.000Z');

  it('is neutral for a brand-new signup', () => {
    expect(severityForOnboardingAge('2026-08-05T00:00:00.000Z', now)).toBe('neutral');
  });

  it('warns once the signup is at least a week old', () => {
    expect(severityForOnboardingAge('2026-07-30T00:00:00.000Z', now)).toBe('warn');
  });

  it('stays neutral just under the week boundary', () => {
    expect(severityForOnboardingAge('2026-07-30T00:00:01.000Z', now)).toBe('neutral');
  });
});

describe('relativeAge', () => {
  const now = new Date('2026-08-06T12:00:00.000Z');

  it('collapses sub-minute gaps to "just now"', () => {
    expect(relativeAge('2026-08-06T11:59:31.000Z', now)).toBe('just now');
  });

  it('renders minutes, hours, and days ago', () => {
    expect(relativeAge('2026-08-06T11:30:00.000Z', now)).toBe('30m ago');
    expect(relativeAge('2026-08-06T09:00:00.000Z', now)).toBe('3h ago');
    expect(relativeAge('2026-08-04T12:00:00.000Z', now)).toBe('2d ago');
  });

  it('renders a future timestamp with a "from now" suffix instead of going negative', () => {
    expect(relativeAge('2026-08-06T13:00:00.000Z', now)).toBe('1h from now');
  });

  it('falls back to an em dash for an unparseable timestamp', () => {
    expect(relativeAge('not-a-date', now)).toBe('—');
  });
});

describe('defaultCardOrder', () => {
  // Drawn from STAFF_ROLES rather than a hand-written list, so a role added to
  // the permission model without a card order fails here instead of silently
  // falling back on the Command Center.
  it('gives every role a full permutation of every card key', () => {
    for (const role of STAFF_ROLES) {
      const order = defaultCardOrder(role);
      expect(new Set(order), `${role} is missing or duplicating cards`).toEqual(new Set(CARD_KEYS));
      expect(order.length, `${role} has the wrong number of cards`).toBe(CARD_KEYS.length);
    }
  });

  // Order is a preference, not a permission. Every role sees every card; what
  // a staff member may DO is lib/staff.ts's business, and if this ever started
  // hiding cards it would look like a security boundary while being neither.
  it('hides nothing from anybody, including read_only', () => {
    expect(new Set(defaultCardOrder('read_only'))).toEqual(new Set(CARD_KEYS));
  });

  it('falls back to the super-admin order for an unrecognized role', () => {
    expect(defaultCardOrder('superuser' as StaffRole)).toEqual(defaultCardOrder('super_admin'));
  });
});

describe('moveWithinVisible', () => {
  // The board lays out only the cards that have rows in them; the quiet ones
  // drop to the All-clear strip but keep their saved slot, so they come back
  // where you left them. That is what makes a plain neighbour-swap wrong.
  const order = ['a', 'b', 'c', 'd', 'e'];

  it('moves a card past the hidden ones between it and the next visible card', () => {
    // b, c and d are quiet. Moving `a` later must land it after `e` on screen,
    // which a swap with `b` would not do — nothing visible would have moved.
    expect(moveWithinVisible(order, ['a', 'e'], 'a', 1)).toEqual(['e', 'b', 'c', 'd', 'a']);
  });

  it('leaves the hidden cards in their own slots', () => {
    const next = moveWithinVisible(order, ['b', 'd'], 'd', -1);
    expect(next).toEqual(['a', 'd', 'c', 'b', 'e']);
    // a, c and e never moved: a quiet card returns to the position its owner
    // last chose for it, not to wherever a neighbour's move pushed it.
    expect(next[0]).toBe('a');
    expect(next[2]).toBe('c');
    expect(next[4]).toBe('e');
  });

  it('swaps adjacent visible cards the obvious way', () => {
    expect(moveWithinVisible(order, ['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c', 'd', 'e']);
    expect(moveWithinVisible(order, ['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b', 'd', 'e']);
  });

  it('does nothing at either end, rather than wrapping around', () => {
    expect(moveWithinVisible(order, ['a', 'c'], 'a', -1)).toEqual(order);
    expect(moveWithinVisible(order, ['a', 'c'], 'c', 1)).toEqual(order);
  });

  it('does nothing for a card that is not visible or not in the order', () => {
    expect(moveWithinVisible(order, ['a', 'c'], 'b', 1)).toEqual(order);
    expect(moveWithinVisible(order, ['a', 'zz'], 'zz', -1)).toEqual(order);
  });

  it('never drops, duplicates, or invents a key', () => {
    for (const visible of [['a', 'e'], ['b', 'c', 'd'], ['a', 'b', 'c', 'd', 'e']]) {
      for (const key of visible) {
        for (const dir of [-1, 1] as const) {
          const next = moveWithinVisible(order, visible, key, dir);
          expect(next.length).toBe(order.length);
          expect(new Set(next)).toEqual(new Set(order));
        }
      }
    }
  });

  it('returns a copy, so a caller cannot mutate the saved order by accident', () => {
    const next = moveWithinVisible(order, ['a', 'b'], 'a', 1);
    expect(next).not.toBe(order);
    expect(order).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

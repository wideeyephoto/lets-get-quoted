import { describe, it, expect } from 'vitest';
import { TRADES } from '@/lib/trades';
import {
  COMMON_TRADE_SLUGS,
  TRADE_CATEGORIES,
  categoryOf,
  searchIndexFor,
  tradeCategoryProblems,
  tradesAlphabetical,
  tradesBySlugs,
} from '@/lib/trade-categories';

/**
 * The /for directory is a filter over a hand-written mapping, and every way it
 * can be wrong is invisible in the browser: a trade filed in no category simply
 * vanishes when a filter is on, a trade filed in two appears twice, and a typo
 * in a slug does both at once. None of that throws, renders red, or fails a
 * build — the page just quietly stops listing somebody's trade.
 */

describe('the trade directory covers every trade exactly once', () => {
  it('files all 49 trades, each in one category, with no invented slugs', () => {
    // Reported rather than thrown so a bad edit shows every problem at once.
    expect(tradeCategoryProblems()).toEqual([]);
  });

  it('adds up to the number of trades that exist', () => {
    const filed = TRADE_CATEGORIES.flatMap((category) => category.slugs);
    expect(filed).toHaveLength(TRADES.length);
    expect(new Set(filed).size).toBe(TRADES.length);
  });

  it('gives every category a stable id and a label', () => {
    for (const category of TRADE_CATEGORIES) {
      expect(category.id).toMatch(/^[a-z-]+$/);
      expect(category.label.length).toBeGreaterThan(3);
      expect(category.slugs.length).toBeGreaterThan(0);
    }
    expect(new Set(TRADE_CATEGORIES.map((c) => c.id)).size).toBe(TRADE_CATEGORIES.length);
  });

  it('resolves a slug back to its category', () => {
    expect(categoryOf('plumbers')?.id).toBe('systems');
    expect(categoryOf('landscapers')?.id).toBe('outdoor');
    expect(categoryOf('not-a-trade')).toBeNull();
  });
});

describe('the shortlist and the A-Z list', () => {
  it('resolves every common slug to a real trade', () => {
    expect(tradesBySlugs(COMMON_TRADE_SLUGS)).toHaveLength(COMMON_TRADE_SLUGS.length);
  });

  it('sorts the full list by display name, not by slug', () => {
    const names = tradesAlphabetical().map((trade) => trade.name);
    expect(names).toHaveLength(TRADES.length);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
    // Sorting by SLUG would put "hvac" between "handyman" and "insulation";
    // by NAME, "HVAC Contractors" lands under H beside "Home Inspectors".
    expect(names[0]).toBe('Agricultural & Farm Fencing Companies');
  });
});

describe('search reaches past the trade name', () => {
  it('indexes the services, so a job leads to the trade that does it', () => {
    const plumbers = TRADES.find((t) => t.slug === 'plumbers')!;
    const index = searchIndexFor(plumbers);
    expect(index).toContain('water heaters');
    expect(index).toContain('plumbers');
    // Lower-cased once, here — not at every keystroke in the browser.
    expect(index).toBe(index.toLowerCase());
  });

  it('finds a trade whose name does not contain the word typed', () => {
    const match = (q: string) =>
      TRADES.filter((t) => searchIndexFor(t).includes(q)).map((t) => t.slug);
    expect(match('water heater')).toContain('plumbers');
    expect(match('mulch')).toContain('landscapers');
  });
});

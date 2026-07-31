import { describe, it, expect } from 'vitest';
import { formatUnitPrice, glyphsForServices, priceBookStats, unitSuffix } from '@/lib/price-book';
import { SERVICE_ICON_GLYPHS } from '@/lib/templates/service-icons.data';

describe('unit prices keep their cents', () => {
  // The bug this exists to stop: formatMoney() rounds to whole dollars, so sod at
  // $1.20/sqft printed as "$1" — a 17% error on every square foot quoted.
  it('shows cents when the price has them', () => {
    expect(formatUnitPrice(1.2)).toBe('$1.20');
    expect(formatUnitPrice(0.5)).toBe('$0.50');
    expect(formatUnitPrice(1234.5)).toBe('$1,234.50');
  });

  it('never pads a whole dollar with .00', () => {
    expect(formatUnitPrice(45)).toBe('$45');
    expect(formatUnitPrice(350)).toBe('$350');
    expect(formatUnitPrice(0)).toBe('$0');
  });

  it('rounds a computed average to cents, not to whole dollars', () => {
    expect(formatUnitPrice(119.925)).toBe('$119.93');
    // Rounds up to a whole dollar, so no stray ".00".
    expect(formatUnitPrice(2.999)).toBe('$3');
  });

  it('survives junk', () => {
    expect(formatUnitPrice(NaN)).toBe('$0');
    expect(formatUnitPrice(undefined as unknown as number)).toBe('$0');
  });
});

describe('unit suffix', () => {
  it('leaves "each" bare and spells the rest out', () => {
    expect(unitSuffix('each')).toBe('');
    expect(unitSuffix('sqft')).toBe('/sq ft');
    expect(unitSuffix('hour')).toBe('/hr');
    expect(unitSuffix(null)).toBe('');
  });

  it('falls back to the raw unit rather than dropping it', () => {
    expect(unitSuffix('pallet')).toBe('/pallet');
  });
});

describe('service icons', () => {
  const glyphs = (names: string[]) => glyphsForServices(names);

  it('only ever returns keys the icon set actually has', () => {
    const names = ['Weekly mowing', 'Panel upgrade', 'Zzzz', '', 'Trip charge'];
    for (const glyph of glyphs(names)) {
      expect(SERVICE_ICON_GLYPHS[glyph], `missing icon: ${glyph}`).toBeTruthy();
    }
  });

  // The reason the whole book is resolved at once: on its own, "Core aeration"
  // matches nothing, and a generic mark next to ten landscaping icons looks broken.
  it('gives an unmatched service the book its neighbours imply', () => {
    const [, , unmatched] = glyphs(['Weekly mowing', 'Bi-weekly mowing', 'Standard package']);
    expect(unmatched).toBe('scissors');
  });

  it('falls back to a generic verb only when nothing in the book matched', () => {
    expect(glyphs(['Standard install', 'Premium package'])[0]).toBe('hammer');
    expect(glyphs(['Standard package', 'Add-on'])).toEqual(['spark', 'spark']);
  });

  // The defect this replaced: a generic /install|repair/ rule ran before the trade
  // rules, so an electrician's book was three identical hammers.
  it('lets the trade beat the verb', () => {
    expect(glyphs(['Faucet install'])[0]).not.toBe('hammer');
    expect(glyphs(['Outlet install', 'Ceiling fan install', 'Recessed lighting'])).toEqual([
      'plug',
      'fan',
      'lightbulb',
    ]);
  });

  it('separates the line items every trade shares', () => {
    expect(glyphs(['Trip charge', 'Roof inspection', 'Emergency after-hours'])).toEqual([
      'truck',
      'ruler',
      'bolt',
    ]);
  });

  it('keeps a real book mostly distinguishable', () => {
    const book = ['Panel upgrade', 'Outlet install', 'Ceiling fan install', 'Generator service', 'Recessed lighting', 'Trip charge'];
    expect(new Set(glyphs(book)).size).toBe(6);
  });

  it('handles an empty book and blank names', () => {
    expect(glyphs([])).toEqual([]);
    expect(glyphs(['   '])).toEqual(['spark']);
  });
});

describe('price book stats', () => {
  it('summarizes a book', () => {
    const stats = priceBookStats([45, 55, 350])!;
    expect(stats.count).toBe(3);
    expect(stats.lowest).toBe(45);
    expect(stats.highest).toBe(350);
    expect(stats.average).toBeCloseTo(150, 5);
  });

  // A $0 placeholder would drag the average down and report a range starting at $0,
  // which makes a finished book look unfinished.
  it('ignores unpriced services', () => {
    const stats = priceBookStats([0, 100, 200])!;
    expect(stats.count).toBe(2);
    expect(stats.lowest).toBe(100);
    expect(stats.average).toBe(150);
  });

  it('returns null when nothing is priced', () => {
    expect(priceBookStats([])).toBeNull();
    expect(priceBookStats([0, 0])).toBeNull();
  });

  it('handles a single service without dividing by a zero span', () => {
    const stats = priceBookStats([180])!;
    expect(stats.lowest).toBe(stats.highest);
    expect(stats.average).toBe(180);
  });
});

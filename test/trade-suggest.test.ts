import { describe, it, expect } from 'vitest';
import { suggestTrades, TRADE_OPTIONS } from '@/lib/trade-suggest';

// Guessing the trade somebody is typing. The whole value is in the ranking —
// a list that puts the obvious answer third reads as random, and a list that
// matches inside words reads as broken.

const values = (query: string) => suggestTrades(query).map((s) => s.value);

describe('suggestTrades', () => {
  it('puts the trade that starts with what you typed first', () => {
    expect(values('plum')[0]).toBe('plumbing');
    expect(values('roof')[0]).toBe('roofing');
    expect(values('conc')[0]).toBe('concrete');
  });

  it('knows what people call themselves', () => {
    // Almost everybody types their job title, and the list is written the other
    // way round. Without the aliases the field looks broken for the commonest
    // trades in the product.
    expect(values('electrician')).toContain('electrical work');
    expect(values('plumber')).toContain('plumbing');
    expect(values('roofer')).toContain('roofing');
    expect(values('landscaper')).toContain('landscaping');
    expect(values('exterminator')).toContain('pest control');
    expect(values('mowing')).toContain('lawn care');
    expect(values('lawn service')).toContain('lawn care');
    expect(values('christmas lights')).toContain('holiday lighting');
    expect(values('mosquito')).toContain('mosquito & tick control');
    expect(values('duct cleaning')).toContain('air duct & dryer vent cleaning');
  });

  it('says why it jumped', () => {
    const suggestion = suggestTrades('electrician').find((s) => s.value === 'electrical work');
    expect(suggestion?.note).toContain('electrician');
  });

  it('handles the short ones people actually type', () => {
    expect(values('ac')).toContain('HVAC');
    expect(values('hvac')).toContain('HVAC');
    expect(values('lawn')).toContain('lawn care');
  });

  it('does not match inside a word', () => {
    // "ac" is in "contrACtor". Offering remodeling to somebody typing "ac" is
    // the hit that makes the whole list read as noise.
    expect(values('ac')).not.toContain('remodeling & renovation');
    // "ain" is in "pAINting" and "drAINage" — neither should surface.
    expect(values('ain')).toEqual([]);
  });

  it('matches a word in the middle of a phrase', () => {
    // Not the same thing as matching inside a word: "care" is the second word
    // of "lawn care" and absolutely should hit.
    expect(values('care')).toContain('lawn care');
    expect(values('removal')).toContain('junk removal & hauling');
  });

  it('is case-insensitive and ignores surrounding space', () => {
    expect(values('  PLUMB ')).toContain('plumbing');
    expect(values('HvAc')).toContain('HVAC');
  });

  it('still offers a value that differs only in case', () => {
    // Typing "hvac" and being offered "HVAC" looks like a no-op row and is not:
    // this value goes into website headlines, so the casing IS the improvement.
    expect(values('hvac')).toContain('HVAC');
    expect(values('HVAC')).not.toContain('HVAC');
  });

  it('offers something to open on, before anything is typed', () => {
    // The field is worth opening before you have typed. Returning nothing makes
    // the picker invisible to anybody who does not already know it is there.
    expect(suggestTrades('').length).toBeGreaterThan(0);
  });

  it('never offers back exactly what is already in the field', () => {
    // A row that fills the field with what it already holds does nothing.
    for (const option of TRADE_OPTIONS.slice(0, 12)) {
      expect(values(option), option).not.toContain(option);
    }
  });

  it('respects the limit and never repeats a value', () => {
    for (const query of ['', 'a', 'in', 'clean', 'ing', 'water']) {
      const results = suggestTrades(query, 6);
      expect(results.length, query).toBeLessThanOrEqual(6);
      expect(new Set(results.map((r) => r.value)).size, query).toBe(results.length);
    }
  });

  it('returns nothing for a trade nobody has a word for', () => {
    // And that is fine — the field takes free text. A picker that invented a
    // match for an unrelated trade would be worse than an empty list.
    expect(values('underwater basket weaving')).toEqual([]);
  });
});

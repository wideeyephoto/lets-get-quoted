import { describe, it, expect } from 'vitest';
import { matchTrades, findBestTradeMatch, damerauLevenshtein, phoneticNormalize } from '@/lib/trade-matching';

describe('trade-matching', () => {
  describe('damerauLevenshtein', () => {
    it('handles identical strings', () => {
      expect(damerauLevenshtein('painter', 'painter')).toBe(0);
    });

    it('handles transpositions as single edit', () => {
      expect(damerauLevenshtein('paitner', 'painter')).toBe(1);
      expect(damerauLevenshtein('havc', 'hvac')).toBe(1);
      expect(damerauLevenshtein('plubmer', 'plumber')).toBe(1);
    });

    it('handles deletions and insertions', () => {
      expect(damerauLevenshtein('paintr', 'painter')).toBe(1);
      expect(damerauLevenshtein('plumbr', 'plumber')).toBe(1);
      expect(damerauLevenshtein('paintter', 'painter')).toBe(1);
    });
  });

  describe('phoneticNormalize', () => {
    it('normalizes phonetic variations', () => {
      expect(phoneticNormalize('electrishun')).toBe(phoneticNormalize('electrician'));
      expect(phoneticNormalize('conkreet')).toBe(phoneticNormalize('concrete'));
    });
  });

  describe('findBestTradeMatch with typos', () => {
    it('identifies Painter with common typos', () => {
      expect(findBestTradeMatch('paintr')?.slug).toBe('painters');
      expect(findBestTradeMatch('paitner')?.slug).toBe('painters');
      expect(findBestTradeMatch('panting')?.slug).toBe('painters');
      expect(findBestTradeMatch('panter')?.slug).toBe('painters');
      expect(findBestTradeMatch('painters')?.slug).toBe('painters');
    });

    it('identifies Plumber with common typos', () => {
      expect(findBestTradeMatch('plumbr')?.slug).toBe('plumbers');
      expect(findBestTradeMatch('plubmer')?.slug).toBe('plumbers');
      expect(findBestTradeMatch('plumer')?.slug).toBe('plumbers');
      expect(findBestTradeMatch('plumbler')?.slug).toBe('plumbers');
      expect(findBestTradeMatch('plumbing')?.slug).toBe('plumbers');
    });

    it('identifies Electrician with phonetic and typo variations', () => {
      expect(findBestTradeMatch('electrishun')?.slug).toBe('electricians');
      expect(findBestTradeMatch('electrian')?.slug).toBe('electricians');
      expect(findBestTradeMatch('electrcian')?.slug).toBe('electricians');
      expect(findBestTradeMatch('elctrician')?.slug).toBe('electricians');
      expect(findBestTradeMatch('electrisian')?.slug).toBe('electricians');
    });

    it('identifies Roofer with typos and phonetic variants', () => {
      expect(findBestTradeMatch('rofer')?.slug).toBe('roofers');
      expect(findBestTradeMatch('roofin')?.slug).toBe('roofers');
      expect(findBestTradeMatch('rooferz')?.slug).toBe('roofers');
      expect(findBestTradeMatch('roofing')?.slug).toBe('roofers');
    });

    it('identifies HVAC / AC with typos', () => {
      expect(findBestTradeMatch('havc')?.slug).toBe('hvac');
      expect(findBestTradeMatch('hvca')?.slug).toBe('hvac');
      expect(findBestTradeMatch('h-vac')?.slug).toBe('hvac');
      expect(findBestTradeMatch('ac')?.slug).toBe('hvac');
      expect(findBestTradeMatch('furnace')?.slug).toBe('hvac');
      expect(findBestTradeMatch('heatng')?.slug).toBe('hvac');
    });

    it('identifies Landscaper with typos', () => {
      expect(findBestTradeMatch('landscapr')?.slug).toBe('landscapers');
      expect(findBestTradeMatch('landscapng')?.slug).toBe('landscapers');
      expect(findBestTradeMatch('lanscape')?.slug).toBe('landscapers');
    });

    it('identifies Concrete with sound-alikes', () => {
      expect(findBestTradeMatch('conkreet')?.slug).toBe('concrete');
      expect(findBestTradeMatch('concreat')?.slug).toBe('concrete');
      expect(findBestTradeMatch('concete')?.slug).toBe('concrete');
    });

    it('identifies Handyman with typos', () => {
      expect(findBestTradeMatch('handiman')?.slug).toBe('handyman');
      expect(findBestTradeMatch('handy man')?.slug).toBe('handyman');
    });

    it('identifies Locksmith with typos', () => {
      expect(findBestTradeMatch('locksmth')?.slug).toBe('locksmiths');
      expect(findBestTradeMatch('loksmith')?.slug).toBe('locksmiths');
    });

    it('identifies Appliance Repair with typos', () => {
      expect(findBestTradeMatch('apliance')?.slug).toBe('appliance-repair');
      expect(findBestTradeMatch('apliance repair')?.slug).toBe('appliance-repair');
    });

    it('identifies Exterminator / Pest Control with typos', () => {
      expect(findBestTradeMatch('extermintor')?.slug).toBe('pest-control');
      expect(findBestTradeMatch('exterminater')?.slug).toBe('pest-control');
    });

    it('returns null / empty for completely unrelated words', () => {
      expect(findBestTradeMatch('underwater basket weaving')).toBeNull();
      expect(matchTrades('underwater basket weaving')).toEqual([]);
    });
  });

  describe('matchTrades rankings', () => {
    it('ranks exact and prefix matches above loose typo matches', () => {
      const paintMatches = matchTrades('paint');
      expect(paintMatches[0].slug).toBe('painters');

      const plumbMatches = matchTrades('plumb');
      expect(plumbMatches[0].slug).toBe('plumbers');
    });

    it('returns featured trades when query is empty', () => {
      const emptyMatches = matchTrades('');
      expect(emptyMatches.length).toBeGreaterThan(0);
    });
  });
});

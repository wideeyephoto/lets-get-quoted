import { describe, expect, it } from 'vitest';
import {
  draftConfidenceNote, draftToQuoteItems, draftTotal, formatPriceBook, formatQuoteHistory,
  matchService, MAX_DRAFT_LINES, MAX_HISTORY_JOBS, normalizeServiceName, priceFromService,
  reconcileDraft, unitPhrase, type PriceBookEntry,
} from '@/lib/quote-draft';

// The safety boundary between a language model and a number somebody sends to a
// customer. Every test here is about one question: whose price is this?

const BOOK: PriceBookEntry[] = [
  { id: 's1', name: 'Water heater replacement', unitPrice: 1650, unit: 'job' },
  { id: 's2', name: 'Drain cleaning (main line)', unitPrice: 285, unit: 'each' },
  { id: 's3', name: 'Standard labor', unitPrice: 95, unit: 'hour' },
  { id: 's4', name: 'Tile floor', unitPrice: 12.5, unit: 'sqft' },
  { id: 's5', name: 'Service call', unitPrice: 89, unit: 'visit' },
];

describe('matching a drafted line to the price book', () => {
  it('matches on name, ignoring case and punctuation', () => {
    expect(matchService('water heater replacement', BOOK)?.id).toBe('s1');
    expect(matchService('Water-Heater  Replacement!', BOOK)?.id).toBe('s1');
  });

  it('matches when the model paraphrases a longer service name', () => {
    // "Drain cleaning" for "Drain cleaning (main line)" is right, and refusing
    // it would throw away the thing that makes this trustworthy.
    expect(matchService('Drain cleaning', BOOK)?.id).toBe('s2');
  });

  it('refuses an ambiguous match rather than picking one', () => {
    // Two candidates means we don't know which price the owner meant, and
    // guessing is a coin flip with their money.
    const ambiguous: PriceBookEntry[] = [
      { id: 'a', name: 'Roof repair — flat', unitPrice: 900, unit: 'job' },
      { id: 'b', name: 'Roof repair — pitched', unitPrice: 1400, unit: 'job' },
    ];
    expect(matchService('Roof repair', ambiguous)).toBeNull();
  });

  it('matches nothing for an unrelated name or an empty one', () => {
    expect(matchService('Helicopter rental', BOOK)).toBeNull();
    expect(matchService('   ', BOOK)).toBeNull();
  });

  it('normalizes predictably', () => {
    expect(normalizeServiceName('  Drain-Cleaning (MAIN line) ')).toBe('drain cleaning main line');
  });
});

describe('pricing from a matched service', () => {
  it('multiplies per-unit services by quantity', () => {
    expect(priceFromService(BOOK[2], 3)).toBe(285);       // 3 hours × $95
    expect(priceFromService(BOOK[3], 120)).toBe(1500);    // 120 sqft × $12.50
  });

  it('defaults to one unit when the model gave no quantity', () => {
    expect(priceFromService(BOOK[2], null)).toBe(95);
  });

  it('will not bill a fraction of a flat-rate job', () => {
    // "1.5 water heater installs" is not a thing, and rounding it up silently
    // would inflate the quote.
    expect(priceFromService(BOOK[0], 1.5)).toBe(3300);
    expect(priceFromService(BOOK[0], 0.4)).toBe(1650);
    expect(priceFromService(BOOK[0], null)).toBe(1650);
  });

  it('handles a whole number of flat jobs', () => {
    expect(priceFromService(BOOK[1], 2)).toBe(570);
  });
});

describe('reconciling a whole draft', () => {
  it("takes the OWNER's price, not the model's, whenever they disagree", () => {
    // The single most important behaviour in the feature.
    const draft = reconcileDraft(
      { lines: [{ label: 'Replace 40-gal water heater', service: 'Water heater replacement', amount: 1200, kind: 'base' }] },
      BOOK,
    );
    expect(draft.lines[0].amount).toBe(1650);
    expect(draft.lines[0].source).toBe('price-book');
    expect(draft.lines[0].serviceId).toBe('s1');
  });

  it('says so when the model wanted a very different number', () => {
    // Usually a sign the scope is bigger or smaller than the standard job —
    // worth the owner's eye rather than silently overwritten.
    const draft = reconcileDraft(
      { lines: [{ label: 'Water heater', service: 'Water heater replacement', amount: 400, kind: 'base' }] },
      BOOK,
    );
    expect(draft.lines[0].note).toContain('$400');
    expect(draft.lines[0].note).toContain('check the scope');
  });

  it('stays quiet when the model broadly agreed', () => {
    const draft = reconcileDraft(
      { lines: [{ label: 'Water heater', service: 'Water heater replacement', amount: 1600, kind: 'base' }] },
      BOOK,
    );
    expect(draft.lines[0].note).not.toContain('check the scope');
  });

  it('flags anything the model priced itself, loudly', () => {
    const draft = reconcileDraft(
      { lines: [{ label: 'Permit fee', amount: 220, kind: 'base' }] },
      BOOK,
    );
    expect(draft.lines[0].source).toBe('estimate');
    expect(draft.lines[0].amount).toBe(220);
    expect(draft.lines[0].note).toContain('check this price');
  });

  it('separates a price taken from past jobs from a pure guess', () => {
    const draft = reconcileDraft(
      { lines: [{ label: 'Haul-away', amount: 120, kind: 'base', priced_from: 'history' }] },
      BOOK,
    );
    expect(draft.lines[0].source).toBe('history');
    expect(draft.lines[0].note).toContain('charged before');
  });

  it('never drafts a subscription', () => {
    // Signing somebody up to a recurring charge is a deliberate act, not
    // something to be accepted by not reading carefully.
    const draft = reconcileDraft(
      { lines: [{ label: 'Monthly plan', amount: 49, kind: 'subscription' }] },
      BOOK,
    );
    expect(draft.lines[0].kind).toBe('base');
  });

  it('drops junk lines rather than drafting a blank row', () => {
    const draft = reconcileDraft({ lines: [{ label: '', amount: 100 }, { amount: 50 }, { label: 'Real line', amount: 10 }] }, BOOK);
    expect(draft.lines).toHaveLength(1);
    expect(draft.lines[0].label).toBe('Real line');
  });

  it('clamps an absurd amount and refuses a negative one', () => {
    const draft = reconcileDraft(
      { lines: [{ label: 'Oops', amount: 9e12 }, { label: 'Negative', amount: -500 }] },
      BOOK,
    );
    expect(draft.lines[0].amount).toBe(500_000);
    expect(draft.lines[1].amount).toBe(0);
  });

  it('caps how many lines a single draft can produce', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ label: `Line ${i}`, amount: 10 }));
    expect(reconcileDraft({ lines: many }, BOOK).lines).toHaveLength(MAX_DRAFT_LINES);
  });

  it('survives a model that returned nothing usable', () => {
    for (const raw of [{}, { lines: null }, { lines: 'nope' }, { lines: [] }]) {
      const draft = reconcileDraft(raw as never, BOOK);
      expect(draft.lines).toEqual([]);
      expect(draft.needsMoreInfo).toBe(true);
    }
  });

  it('carries the questions back when the scope was too thin to price', () => {
    const draft = reconcileDraft(
      { needs_more_info: true, lines: [], questions: ['How many square feet?', 'Is the old unit gas or electric?'] },
      BOOK,
    );
    expect(draft.needsMoreInfo).toBe(true);
    expect(draft.questions).toHaveLength(2);
  });

  it('counts provenance so the UI can lead with what needs checking', () => {
    const draft = reconcileDraft(
      {
        lines: [
          { label: 'Heater', service: 'Water heater replacement', amount: 1650, kind: 'base' },
          { label: 'Permit', amount: 200, kind: 'base' },
          { label: 'Haul-away', amount: 120, kind: 'base', priced_from: 'history' },
        ],
      },
      BOOK,
    );
    expect(draft.counts).toEqual({ 'price-book': 1, history: 1, estimate: 1 });
  });
});

describe('turning a draft into quote items', () => {
  const draft = reconcileDraft(
    {
      lines: [
        { label: 'Water heater replacement', service: 'Water heater replacement', kind: 'base', amount: 1650 },
        { label: 'Expansion tank', kind: 'addon', amount: 180 },
      ],
    },
    BOOK,
  );

  it('leaves add-ons UNSELECTED', () => {
    // A pre-ticked "option" is not an option, it's a line the owner has to
    // remember to remove — and the once they forget, the client sees a bigger
    // number than the job needs.
    const items = draftToQuoteItems(draft.lines);
    expect(items[0].selected).toBe(true);
    expect(items[1].kind).toBe('addon');
    expect(items[1].selected).toBe(false);
  });

  it('never marks its own suggestions as "recommended"', () => {
    // That badge is the contractor vouching for an upsell. A machine does not
    // get to put words in their mouth.
    expect(draftToQuoteItems(draft.lines).every((item) => item.recommended === false)).toBe(true);
  });

  it('gives every item a unique id', () => {
    const ids = draftToQuoteItems(draft.lines).map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('totals base lines only, like a real quote', () => {
    expect(draftTotal(draft.lines)).toBe(1650);
  });
});

describe('what the model is shown', () => {
  it('gives service names verbatim, so the echo can be matched exactly', () => {
    const text = formatPriceBook(BOOK);
    expect(text).toContain('"Drain cleaning (main line)": $285 each');
    expect(text).toContain('"Standard labor": $95 per hour');
    expect(text).toContain('"Tile floor": $12.5 per square foot');
  });

  it('reads as English rather than "per each"', () => {
    expect(unitPhrase('each')).toBe('each');
    expect(unitPhrase('sqft')).toBe('per square foot');
    expect(unitPhrase('weirdo')).toBe('per weirdo');
  });

  it('sends nothing at all when there is no price book', () => {
    expect(formatPriceBook([])).toBe('');
  });

  it('sends scope and money from past jobs — and no customer identity', () => {
    // A third-party model has no business holding a list of who lives where,
    // and none of it makes a price better.
    const text = formatQuoteHistory([
      { scope: 'Replace 40-gal water heater for Maria Alvarez at 12 Elm St', total: 1900, lines: [{ label: 'Heater', amount: 1650 }] },
    ]);
    // The scope is the owner's own free text, so it can contain anything — what
    // matters is that we never add fields of our own.
    expect(text).toContain('$1900');
    expect(text).toContain('Heater $1650');
    expect(text).not.toContain('phone');
    expect(text).not.toContain('@');
  });

  it('drops past jobs with no price — they teach nothing', () => {
    expect(formatQuoteHistory([{ scope: 'Some job', total: 0, lines: [] }])).toBe('');
  });

  it('caps history so a long-running account does not blow the prompt', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ scope: `Job ${i}`, total: 100 + i, lines: [] }));
    expect(formatQuoteHistory(many).split('\n')).toHaveLength(MAX_HISTORY_JOBS);
  });
});

describe('the confidence line', () => {
  const build = (lines: Parameters<typeof reconcileDraft>[0]['lines']) => reconcileDraft({ lines }, BOOK);

  it('leads with what needs checking, not with what worked', () => {
    const note = draftConfidenceNote(build([
      { label: 'Heater', service: 'Water heater replacement', amount: 1650 },
      { label: 'Permit', amount: 200 },
    ]));
    expect(note).toContain('1 of 2');
    expect(note).toContain('check');
  });

  it('says so plainly when everything came from the book', () => {
    const note = draftConfidenceNote(build([{ label: 'Heater', service: 'Water heater replacement', amount: 1650 }]));
    expect(note).toBe('All 1 line priced from your price book.');
  });

  it('handles an empty draft without claiming success', () => {
    expect(draftConfidenceNote(build([]))).toContain('Nothing could be drafted');
  });
});

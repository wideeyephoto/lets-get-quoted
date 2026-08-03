import { describe, it, expect } from 'vitest';
import { duplicateCostIds, findDuplicateCosts, type ExistingCost } from '@/lib/cost-truth';
import { normalizeReceiptRead, receiptBalances, describeReceiptRead } from '@/lib/receipt-ocr';

const DAY = 86_400_000;
const base = Date.parse('2026-08-03T12:00:00Z');
const at = (daysAgo: number) => new Date(base - daysAgo * DAY).toISOString();

function cost(overrides: Partial<ExistingCost> = {}): ExistingCost {
  return { id: 'c1', description: 'PVC fittings', amount: 47, supplier: 'Ferguson', createdAt: at(1), ...overrides };
}

describe('findDuplicateCosts', () => {
  const candidate = { description: 'PVC fittings', amount: 47, supplier: 'Ferguson', at: at(0) };

  it('flags the same spend logged twice', () => {
    const [match] = findDuplicateCosts(candidate, [cost()]);
    expect(match).toBeDefined();
    expect(match.reasons).toContain('same amount');
    expect(match.reasons).toContain('same supplier');
  });

  it('needs the amount to match, plus one more signal', () => {
    // Same amount alone fires constantly on round numbers.
    expect(findDuplicateCosts(candidate, [cost({ description: 'Copper pipe 3/4', supplier: 'Home Depot' })])).toEqual([]);
    // And same supplier + same description at a DIFFERENT price is not a
    // mistake — it's a second trip to the same yard.
    expect(findDuplicateCosts(candidate, [cost({ amount: 96 })])).toEqual([]);
  });

  it('lets a genuine second trip through once enough time has passed', () => {
    expect(findDuplicateCosts(candidate, [cost({ createdAt: at(30) })])).toEqual([]);
  });

  it('tolerates a couple of cents of difference', () => {
    const [match] = findDuplicateCosts(candidate, [cost({ amount: 47.5 })]);
    expect(match?.reasons).toContain('almost the same amount');
  });

  it('does not treat a very different amount as almost the same', () => {
    expect(findDuplicateCosts(candidate, [cost({ amount: 60 })])).toEqual([]);
    expect(findDuplicateCosts(candidate, [cost({ amount: 47.05 })])).toHaveLength(1);
  });

  it('ignores a zero-amount candidate rather than matching everything', () => {
    expect(findDuplicateCosts({ ...candidate, amount: 0 }, [cost()])).toEqual([]);
  });

  it('survives an unparseable timestamp on an existing row', () => {
    expect(findDuplicateCosts(candidate, [cost({ createdAt: 'not a date' })])).toEqual([]);
  });

  it('puts the closest in time first', () => {
    const matches = findDuplicateCosts(candidate, [
      cost({ id: 'old', createdAt: at(10) }),
      cost({ id: 'recent', createdAt: at(1) }),
    ]);
    expect(matches[0].cost.id).toBe('recent');
  });
});

describe('duplicateCostIds', () => {
  it('flags only the later of a pair', () => {
    // Badging both sides reads as though two separate mistakes were made.
    const flags = duplicateCostIds([
      cost({ id: 'first', createdAt: at(2) }),
      cost({ id: 'second', createdAt: at(1) }),
    ]);
    expect([...flags.keys()]).toEqual(['second']);
  });

  it('says nothing about a job with distinct costs', () => {
    const flags = duplicateCostIds([
      cost({ id: 'a', description: 'PVC fittings', amount: 47, supplier: 'Ferguson' }),
      cost({ id: 'b', description: 'Water heater', amount: 890, supplier: 'Home Depot' }),
    ]);
    expect(flags.size).toBe(0);
  });

  it('handles an empty or single-cost job', () => {
    expect(duplicateCostIds([]).size).toBe(0);
    expect(duplicateCostIds([cost()]).size).toBe(0);
  });
});

describe('normalizeReceiptRead', () => {
  it('keeps a clean read intact', () => {
    const read = normalizeReceiptRead({
      supplier: 'Ferguson Plumbing',
      purchased_at: '2026-08-01',
      total: 214.87,
      tax: 12.87,
      lines: [{ description: 'PVC 2in', amount: 102 }, { description: 'Fittings', amount: 100 }],
      confidence: 0.9,
      unreadable: [],
    });
    expect(read.supplier).toBe('Ferguson Plumbing');
    expect(read.purchasedAt).toBe('2026-08-01');
    expect(read.total).toBe(214.87);
    expect(read.lines).toHaveLength(2);
  });

  it('refuses a future date rather than back-dating a purchase', () => {
    const future = new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10);
    expect(normalizeReceiptRead({ purchased_at: future }).purchasedAt).toBeNull();
  });

  it('drops a malformed date instead of falling back to today', () => {
    // A receipt silently stamped with today's date is worse than a blank one:
    // nobody re-checks a field that looks filled in.
    expect(normalizeReceiptRead({ purchased_at: 'last Tuesday' }).purchasedAt).toBeNull();
    expect(normalizeReceiptRead({ purchased_at: '08/01/2026' }).purchasedAt).toBeNull();
  });

  it('drops negative and unparseable money', () => {
    expect(normalizeReceiptRead({ total: -20 }).total).toBeNull();
    expect(normalizeReceiptRead({ total: 'about two hundred' }).total).toBeNull();
  });

  it('drops half-read lines rather than inventing the missing half', () => {
    const read = normalizeReceiptRead({
      lines: [{ description: 'PVC', amount: 12 }, { description: '', amount: 9 }, { description: 'Smudged', amount: null }],
    });
    expect(read.lines).toEqual([{ description: 'PVC', amount: 12 }]);
  });

  it('returns an empty read for junk instead of throwing', () => {
    const read = normalizeReceiptRead(null);
    expect(read.total).toBeNull();
    expect(read.lines).toEqual([]);
    expect(read.confidence).toBe(0);
  });
});

describe('receiptBalances', () => {
  it('confirms a receipt that adds up', () => {
    const read = normalizeReceiptRead({ total: 114, tax: 14, lines: [{ description: 'a', amount: 100 }] });
    expect(receiptBalances(read)).toMatchObject({ balanced: true, lineSum: 100 });
  });

  it('reports a mismatch rather than adjusting to hide it', () => {
    const read = normalizeReceiptRead({ total: 200, tax: 0, confidence: 0.9, lines: [{ description: 'a', amount: 100 }] });
    const balance = receiptBalances(read)!;
    expect(balance.balanced).toBe(false);
    expect(balance.difference).toBe(100);
    expect(describeReceiptRead(read).message).toContain('Nothing was adjusted');
  });

  it('says nothing when there is nothing to compare', () => {
    expect(receiptBalances(normalizeReceiptRead({ total: 100 }))).toBeNull();
  });
});

describe('describeReceiptRead', () => {
  it('tells the person to retype a barely-legible one', () => {
    const read = normalizeReceiptRead({ total: 50, confidence: 0.2, unreadable: ['bottom third is out of focus'] });
    const verdict = describeReceiptRead(read);
    expect(verdict.tone).toBe('poor');
    expect(verdict.message).toContain('out of focus');
  });

  it('never claims more than "check it"', () => {
    const read = normalizeReceiptRead({ supplier: 'X', total: 100, confidence: 1, lines: [{ description: 'a', amount: 100 }] });
    expect(describeReceiptRead(read)).toEqual({ tone: 'ok', message: 'Read cleanly. Check it against the paper before saving.' });
  });

  it('says so when the photo was not a receipt at all', () => {
    expect(describeReceiptRead(normalizeReceiptRead({ confidence: 0 })).tone).toBe('poor');
  });
});

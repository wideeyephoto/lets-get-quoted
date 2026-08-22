import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { normalizeCreditLots } from '@/lib/billing/credit-lots';

/**
 * The meter this makes possible is the one the surface refused to draw for a
 * year, and the reason it refused is the thing these tests hold: a balance that
 * mixes a monthly allowance with credits somebody BOUGHT has no honest
 * denominator, and drawing one anyway produces "122% remaining" the first time
 * anyone tops up.
 *
 * The fix is not a clamp. It is measuring only the window that actually
 * refreshes, and stating the rest beside it.
 */

const ACCOUNT = 'acc-1';
const NOW = Date.parse('2026-08-21T00:00:00.000Z');
const PAST = '2026-08-01T00:00:00.000Z';
const FUTURE = '2026-09-01T00:00:00.000Z';
const LONG_GONE = '2026-07-01T00:00:00.000Z';

type LotOver = Partial<{
  resource_code: string;
  granted_units: unknown;
  consumed_units: unknown;
  reserved_units: unknown;
  revoked_units: unknown;
  available_from: unknown;
  expires_at: unknown;
  account_id: unknown;
}>;

const lot = (over: LotOver = {}) => ({
  account_id: ACCOUNT,
  resource_code: 'text_segments',
  granted_units: 500,
  consumed_units: 0,
  reserved_units: 0,
  revoked_units: 0,
  available_from: PAST,
  expires_at: FUTURE,
  ...over,
});

const ready = (rows: ReturnType<typeof lot>[]) => {
  const result = normalizeCreditLots(rows, ACCOUNT, NOW);
  if (result.kind !== 'ready') throw new Error('expected ready');
  return result;
};

const texts = (rows: ReturnType<typeof lot>[]) =>
  ready(rows).resources.find((r) => r.resourceCode === 'text_segments')!;

describe('a top-up can never push the meter past full', () => {
  it('measures the refreshing window only, with purchases stated beside it', () => {
    const resource = texts([
      lot({ granted_units: 500, consumed_units: 56 }),
      // Bought. Never expires, by CHECK constraint.
      lot({ granted_units: 1_000, expires_at: null }),
    ]);

    expect(resource.periodGranted).toBe(500);
    expect(resource.periodRemaining).toBe(444);
    expect(resource.periodUsed).toBe(56);
    expect(resource.nonExpiring).toBe(1_000);
    // 56 of 500, NOT 1444 of 500.
    expect(resource.percentUsed).toBe(11);
  });

  it('never reports a percentage above 100 for any shape of ledger', () => {
    const shapes = [
      [lot({ granted_units: 10, consumed_units: 10 }), lot({ granted_units: 9_999, expires_at: null })],
      [lot({ granted_units: 1, consumed_units: 1 }), lot({ granted_units: 1, expires_at: null })],
      [lot({ granted_units: 500, consumed_units: 500, reserved_units: 0 })],
    ];
    for (const rows of shapes) {
      const percent = texts(rows).percentUsed;
      expect(percent).not.toBeNull();
      expect(percent!).toBeLessThanOrEqual(100);
      expect(percent!).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('a workspace with no refreshing allowance has no meter, not an empty one', () => {
  it('reports Flex starter credits as non-expiring with no window', () => {
    // The Flex seed grants once and never re-grants; the lot has no expiry.
    const resource = texts([lot({ granted_units: 50, expires_at: null })]);
    expect(resource.periodGranted).toBeNull();
    expect(resource.periodRemaining).toBeNull();
    expect(resource.percentUsed).toBeNull();
    expect(resource.nonExpiring).toBe(50);
  });

  it('reports a resource with no lots at all as not issued, never as zero used', () => {
    const resource = ready([lot({ resource_code: 'text_segments' })])
      .resources.find((r) => r.resourceCode === 'ai_writing_drafts')!;
    expect(resource.periodGranted).toBeNull();
    expect(resource.nonExpiring).toBe(0);
    expect(resource.percentUsed).toBeNull();
  });
});

describe('what is counted, and what is deliberately not', () => {
  it('ignores a lot that has expired', () => {
    const resource = texts([
      lot({ granted_units: 500, consumed_units: 100, expires_at: LONG_GONE }),
      lot({ granted_units: 300, consumed_units: 30 }),
    ]);
    expect(resource.periodGranted).toBe(300);
    expect(resource.periodUsed).toBe(30);
  });

  it('ignores a lot that is not available yet', () => {
    // Granted ahead of its window. Counting it would show credits that cannot
    // be spent today.
    const resource = texts([
      lot({ granted_units: 500 }),
      lot({ granted_units: 900, available_from: '2026-12-01T00:00:00.000Z', expires_at: '2027-01-01T00:00:00.000Z' }),
    ]);
    expect(resource.periodGranted).toBe(500);
  });

  it('subtracts reserved and revoked units from what is left', () => {
    const resource = texts([lot({ granted_units: 500, consumed_units: 40, reserved_units: 10, revoked_units: 5 })]);
    expect(resource.periodRemaining).toBe(445);
    // periodUsed is consumed alone -- a revoked unit was never spent by anyone.
    expect(resource.periodUsed).toBe(40);
  });

  it('sums several open lots of the same resource', () => {
    const resource = texts([
      lot({ granted_units: 500, consumed_units: 100 }),
      lot({ granted_units: 250, consumed_units: 50, expires_at: '2026-09-15T00:00:00.000Z' }),
    ]);
    expect(resource.periodGranted).toBe(750);
    expect(resource.periodUsed).toBe(150);
    // The NEAREST expiry, which is what refreshes first.
    expect(resource.nextExpirationAt).toBe(FUTURE);
  });

  it('ignores ledgers that belong to other surfaces', () => {
    // voice_minutes and storage_gb share this table and are not part of this card.
    const result = ready([lot({ resource_code: 'voice_minutes', granted_units: 100 })]);
    expect(result.resources.map((r) => r.resourceCode)).toEqual([
      'text_segments', 'marketing_email_sends', 'ai_intake_threads', 'ai_writing_drafts',
    ]);
    expect(result.resources.every((r) => r.periodGranted === null)).toBe(true);
  });
});

describe('a read it cannot trust collapses, and does not guess', () => {
  it('refuses a row belonging to another account', () => {
    expect(normalizeCreditLots([lot({ account_id: 'someone-else' })], ACCOUNT, NOW).kind)
      .toBe('unavailable');
  });

  it('refuses a malformed unit count rather than treating it as zero', () => {
    for (const bad of [{ granted_units: 'many' }, { consumed_units: -1 }, { revoked_units: 1.5 }]) {
      expect(normalizeCreditLots([lot(bad)], ACCOUNT, NOW).kind, JSON.stringify(bad)).toBe('unavailable');
    }
  });

  it('refuses an unparseable timestamp rather than dropping the lot', () => {
    // Dropping it would silently shrink somebody's allowance.
    expect(normalizeCreditLots([lot({ expires_at: 'soon' })], ACCOUNT, NOW).kind).toBe('unavailable');
    expect(normalizeCreditLots([lot({ available_from: '' })], ACCOUNT, NOW).kind).toBe('unavailable');
  });

  it('reports a null row set as unavailable, not as an empty ledger', () => {
    expect(normalizeCreditLots(null, ACCOUNT, NOW).kind).toBe('unavailable');
  });

  it('treats no rows as a real, readable empty', () => {
    const result = normalizeCreditLots([], ACCOUNT, NOW);
    expect(result.kind).toBe('ready');
  });
});

describe('the split is by expiry, and the copy must not overclaim it', () => {
  it('cannot distinguish a purchase from a free starter grant', () => {
    // source_type is NOT granted to `authenticated`, so both arrive as "does not
    // expire". This is why the bucket is labelled Non-expiring and never
    // Purchased -- a Flex owner has bought nothing.
    const starter = texts([lot({ granted_units: 50, expires_at: null })]);
    const bought = texts([lot({ granted_units: 50, expires_at: null })]);
    expect(starter.nonExpiring).toBe(bought.nonExpiring);

    // Comment-free, because the loader explains at length WHY it cannot select
    // source_type -- and an absence assertion that reads prose fails on its own
    // explanation, which is how a guard gets rewritten to be satisfiable rather
    // than true.
    const loader = readFileSync(join(process.cwd(), 'src', 'lib', 'billing', 'credit-lots.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(loader).not.toContain('source_type');
    // And the query really does ask for the eight columns that ARE granted.
    expect(loader).toContain("from('usage_credit_lots')");
    expect(loader).toContain('granted_units, consumed_units, reserved_units, revoked_units');
  });
});

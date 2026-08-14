import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { formatMoney, formatMoneyExact } from '@/lib/jobs';

/**
 * ONE NUMBER, PRINTED TWICE, TWO DIFFERENT WAYS.
 *
 * A job stored at $99.94 showed "$100 quoted" in its header and "$99.94
 * approved / $99.94 remaining" in the money panel underneath. Same figure,
 * rounded in one place and not the other, on one screen — which does not read
 * as a formatting choice, it reads as two different amounts and sends somebody
 * hunting for six cents that were never missing.
 *
 * The same $99.94 service appeared as $100 on Recurring, where it also made the
 * arithmetic wrong out loud: the page reported "$1,695 expected" while the
 * monthly rows under it added to $1,696.
 *
 * formatMoney already says which is which in its own comment — whole dollars
 * are for a summary, never for something a customer pays or authorizes. These
 * are the places that were on the wrong side of that line.
 */

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const strip = (source: string) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('the two formatters still differ, which is the whole reason to pick', () => {
  it('rounds and does not round', () => {
    expect(formatMoney(99.94)).toBe('$100');
    expect(formatMoneyExact(99.94)).toBe('$99.94');
  });

  it('and the rounded one is what produced the mismatch', () => {
    // Three rows of 99.94 are 299.82. Rounded individually they read as $100
    // each and sum to $300 — a page whose parts do not add to its whole.
    const rows = [99.94, 99.94, 99.94];
    const roundedParts = rows.map((n) => formatMoney(n));
    expect(roundedParts).toEqual(['$100', '$100', '$100']);
    expect(formatMoney(rows.reduce((a, b) => a + b, 0))).toBe('$300');
    // Exact, the parts and the whole agree.
    expect(formatMoneyExact(rows.reduce((a, b) => a + b, 0))).toBe('$299.82');
  });
});

describe('the job header agrees with the money panel', () => {
  const PAGE = strip(read('src/app/dashboard/jobs/[id]/page.tsx'));

  it('prints the quoted amount to the cent in both places it appears', () => {
    expect(PAGE).toContain('{formatMoneyExact(job.quoted_amount)}</Link>');
    expect(PAGE).toContain('`${formatMoneyExact(job.quoted_amount)} quoted`');
  });

  it('never rounds the quoted amount anywhere on the page', () => {
    // The figure the money panel reconciles against. Every other use of
    // formatMoney on this page is a cost or a margin, which is a summary.
    expect(PAGE).not.toContain('formatMoney(job.quoted_amount)');
  });

  it('leaves the money panel exact, which it always was', () => {
    for (const field of ['approvedCents', 'requestedCents', 'paidCents', 'remainingCents']) {
      expect(PAGE).toContain(`formatMoneyExact(money.${field} / 100)`);
    }
  });
});

describe('recurring prints what the card will actually be charged', () => {
  const PAGE = strip(read('src/app/dashboard/recurring/page.tsx'));
  const SCREEN = strip(read('src/app/dashboard/recurring/RecurringScreen.tsx'));

  /**
   * These three are confirmation dialogs for turning on autopay and for
   * charging a card today. Telling an owner "$100 is charged" when $99.94 is
   * charged is the worst place on the page to round.
   */
  it('quotes the exact amount in every charge confirmation', () => {
    expect(PAGE).not.toContain('formatMoney(plan.amount)');
    expect(PAGE.match(/formatMoneyExact\(plan\.amount\)/g) ?? []).toHaveLength(3);
  });

  it('makes the plan rows and the totals add up to each other', () => {
    // The $1,695-vs-$1,696 finding: rounded rows over a rounded total.
    expect(SCREEN).not.toMatch(/formatMoney\(/);
    for (const value of ['next30.value', 'next90.value', 'monthlyRecurring', 'amount']) {
      expect(SCREEN, value).toContain(`formatMoneyExact(${value})`);
    }
  });
});

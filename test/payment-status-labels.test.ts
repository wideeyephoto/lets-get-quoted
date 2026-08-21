import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every surface that names a payment status must name all of them.
 *
 * These maps all render with a `|| payment.status` fallback, which is the right
 * choice -- a blank where a payment's state should be is worse than an
 * unfamiliar word. But it means an unlisted status reaches the page as the raw
 * database enum, in lowercase, in the same weight as the amount beside it.
 *
 * `canceled` was missing from the client statement, so a withdrawn payment
 * printed "canceled" on a document a contractor hands to their client. The pay
 * page had already learned this and fixed it for itself; nothing carried the fix
 * across, which is the whole reason for checking them as a set.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');

/** The union is the source of truth for what has to be covered. */
function paymentStatuses(): string[] {
  const union = read('src/lib/payments.ts').match(/export type PaymentStatus =([^;]+);/)?.[1] ?? '';
  const statuses = [...union.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  // Guards the guard: an empty union would satisfy every loop below.
  expect(statuses.length).toBeGreaterThan(4);
  return statuses;
}

const SURFACES = [
  ['pay page', 'src/app/pay/[id]/page.tsx'],
  ['client statement', 'src/app/dashboard/clients/[id]/statement/page.tsx'],
] as const;

describe('no payment status can fall through to its stored value', () => {
  for (const [name, file] of SURFACES) {
    it(`${name} labels every status the type allows`, () => {
      const source = read(file);
      const start = source.indexOf('const STATUS_LABEL');
      expect(start, 'no STATUS_LABEL found').toBeGreaterThan(-1);
      const block = source.slice(start, source.indexOf('};', start));
      for (const status of paymentStatuses()) {
        expect(block, `${name} is missing ${status}`).toContain(`${status}: '`);
      }
    });

    it(`${name} keeps the stored value as its fallback`, () => {
      // Deliberate, and worth pinning: the alternative to an unfamiliar word is
      // an empty cell where a payment's state should be.
      const source = read(file);
      expect(source).toMatch(/STATUS_LABEL\[payment\.status\](\s*(\?\?|\|\|)\s*payment\.status)/);
    });

    it(`${name} capitalises in the markup, not with a CSS transform`, () => {
      // A transform leaves the raw enum in the DOM, which is what gets read
      // aloud, copied, and pasted into an email asking what it means.
      const source = read(file);
      const start = source.indexOf('const STATUS_LABEL');
      const block = source.slice(start, source.indexOf('};', start));
      for (const [, label] of block.matchAll(/: '([A-Za-z ]+)'/g)) {
        expect(label[0], label).toBe(label[0].toUpperCase());
      }
    });
  }

  it('spells the cancelled label the same way on both', () => {
    // The stored enum is American and both labels are British. Two surfaces
    // spelling one state differently is the kind of thing somebody notices and
    // nobody can explain.
    for (const [, file] of SURFACES) {
      expect(read(file)).toContain("canceled: 'Cancelled'");
    }
  });
});

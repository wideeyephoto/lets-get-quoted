import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every route a customer can hand money over from needs an error boundary.
 *
 * Without one, an uncaught throw falls through to Next's own screen --
 * "Application error: a client-side exception has occurred", on a blank page --
 * which is what somebody who just pressed a button labelled Pay was being shown.
 *
 * These are not exotic failures. Both /pay/[id] and /invoice/[id] throw for
 * ordinary situations that are one reasonable action away: paying in another
 * tab, opening an emailed link a week late, pressing the button twice. The most
 * likely visitor to either boundary is somebody who has ALREADY PAID, which is
 * why the assertions below are mostly about what gets said first.
 */

const MONEY_ROUTES = [
  'src/app/pay/[id]',
  'src/app/invoice/[id]',
  'src/app/client/jobs/[token]',
] as const;

describe('the routes that take money can fail without looking broken', () => {
  for (const route of MONEY_ROUTES) {
    const file = join(process.cwd(), route, 'error.tsx');

    it(`${route} has an error boundary`, () => {
      expect(existsSync(file), `${route}/error.tsx is missing`).toBe(true);
    });

    it(`${route} logs the digest and renders neither it nor the raw message`, () => {
      // Next replaces Server Action messages with a generic string and a digest
      // in production, so the real sentence is not available -- and a digest on
      // screen is a support burden, not a support tool.
      const source = readFileSync(file, 'utf8');
      expect(source).toContain('error.digest');
      expect(source).toContain('console.error');
      expect(source).not.toMatch(/\{\s*error\.digest\s*\}/);
      expect(source).not.toMatch(/\{\s*error\.message\s*\}/);
    });

    it(`${route} offers a way forward`, () => {
      const source = readFileSync(file, 'utf8');
      expect(source).toMatch(/window\.location\.reload\(\)|onClick=\{reset\}/);
    });
  }
});

describe('the two card-taking routes promise the card was not charged', () => {
  // Only /pay and /invoice: the quote page can be reached before any amount is
  // agreed, so the same sentence there would answer a question nobody asked.
  // Neither of these pages ever touches a card -- Stripe collects details on the
  // page AFTER them -- so the promise is unconditional rather than a hope.
  for (const route of ['src/app/pay/[id]', 'src/app/invoice/[id]'] as const) {
    it(`${route} says it first, before the buttons`, () => {
      const source = readFileSync(join(process.cwd(), route, 'error.tsx'), 'utf8');
      expect(source).toContain('has not been charged');
      const beforeActions = source.slice(0, source.indexOf('workspace-actions'));
      expect(beforeActions, 'reassurance must precede the actions').toContain('has not been charged');
    });
  }
});

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

describe('neither page offers a button the contractor cannot honour', () => {
  /**
   * A contractor who has not finished Stripe onboarding cannot receive a
   * payment. createCheckoutSessionForPayment refuses with "This contractor has
   * not finished setting up payments yet."
   *
   * /pay/[id] has always checked and said so instead. /invoice/[id] did not --
   * it did not even LOAD connect_onboarded -- so it rendered a live
   * "Pay $4,237.50" that threw the moment it was pressed. The error boundary
   * added alongside this catches it now, but a button that cannot work should
   * not be offered in the first place.
   */
  const PAY = readFileSync(join(process.cwd(), 'src/app/pay/[id]/page.tsx'), 'utf8');
  const INVOICE = readFileSync(join(process.cwd(), 'src/app/invoice/[id]/page.tsx'), 'utf8');
  const INVOICES_LIB = readFileSync(join(process.cwd(), 'src/lib/invoices.ts'), 'utf8');

  it('the invoice page loads the flag at all', () => {
    // It could not have checked before this: the account join selected only
    // business_name.
    expect(INVOICES_LIB).toContain('account:accounts(business_name, connect_onboarded)');
  });

  for (const [name, source] of [['pay', PAY], ['invoice', INVOICE]] as const) {
    it(`${name} withholds the pay button when payouts are not set up`, () => {
      expect(source).toContain('connect_onboarded');
      expect(source).toContain("hasn&apos;t finished setting up payments yet");
    });
  }

  it('both say the same thing, because it is the same situation', () => {
    // Two customer-facing surfaces describing one state in two ways is how
    // somebody decides the product is unreliable rather than the contractor.
    const sentence = 'This contractor hasn&apos;t finished setting up payments yet. Please check back soon.';
    expect(PAY).toContain(sentence);
    expect(INVOICE).toContain(sentence);
  });
});

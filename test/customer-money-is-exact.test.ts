import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { formatMoneyExact } from '@/lib/jobs';

/**
 * A customer must never be shown two different numbers for one debt.
 *
 * This codebase keeps two formatters on purpose, and says so in @/lib/jobs:
 *
 *   formatMoney       rounds to whole dollars. "right for a summary and wrong
 *                     for a charge. Use formatMoneyExact for anything a
 *                     customer pays or authorizes."
 *   formatMoneyExact  to the cent.
 *
 * The customer portal imported the first one and used it for seven figures,
 * including the headline "Balance due" and a button reading "Pay $4,238" -- on a
 * balance of $4,237.50. Clicking that button landed on /invoice/[id], which has
 * always shown cents, and said "Still due $4,237.50".
 *
 * Two numbers for one debt on consecutive screens, the first on a button that
 * says Pay. This is the exact failure @/lib/money-format was extracted to
 * prevent; its own header records the last time it happened -- "a $1,750 deposit
 * and four rows of $438 totalling $3,502".
 */

/**
 * THE LIST IS THE POINT, AND IT WAS INCOMPLETE.
 *
 * It named PAGES and checked their imports. But a page's exact import says
 * nothing about the components it renders: client/jobs/[token]/page.tsx sat in
 * this list and passed, while the ChangeOrders and Selections blocks it renders
 * each declared their OWN money() at maximumFractionDigits: 0 -- rounding the
 * line items and the total directly above a "Type your name to confirm" box.
 *
 * It also named only things served over HTTP, so the invoice EMAIL and the PDF
 * attached to it were never looked at. Both rounded, so one invoice was stated
 * three ways: exact on the hosted page, rounded in the email body, and rounded
 * again in the attachment the customer files.
 *
 * A surface is anywhere a customer READS a number they owe -- a page, a
 * component that page renders, an email, or a document attached to one.
 */
const CUSTOMER_MONEY_SURFACES = [
  'src/app/portal/view/[token]/page.tsx',
  'src/app/invoice/[id]/page.tsx',
  'src/app/pay/[id]/page.tsx',
  'src/app/client/jobs/[token]/page.tsx',
  // Components the pages above render. Their parent's import does not cover them.
  'src/app/client/jobs/[token]/ChangeOrders.tsx',
  'src/app/client/jobs/[token]/Selections.tsx',
  // What lands in the customer's inbox, and what they keep.
  'src/emails/InvoiceEmail.tsx',
  'src/emails/InvoicePdf.ts',
] as const;

/**
 * Code with the prose removed.
 *
 * The first version of the rounding check below failed against the COMMENT
 * explaining why the rounding had been taken out -- which named the very
 * property it was asserting was gone. Block comments go whole, because a
 * per-line filter keyed on a leading star leaves every continuation line of a
 * JSDoc block behind — and those lines are exactly where the prose discusses
 * the thing it is explaining the absence of.
 */
const stripComments = (source: string) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split(/\r?\n/)
  .filter((line) => !/^\s*\/\//.test(line))
  .join('\n');

/** Either name for the one exact implementation; formatMoneyExact re-exports it. */
const EXACT = /formatMoneyExact|formatUsdExact/;

describe('every surface a customer settles a debt on shows cents', () => {
  for (const file of CUSTOMER_MONEY_SURFACES) {
    it(`${file.split('/').slice(-2).join('/')} uses the exact formatter`, () => {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      // Either imported under its own name or aliased -- several of these alias
      // it to `formatMoney` so the call sites read the same as everywhere else,
      // which is exactly how the portal's rounding import hid in plain sight.
      expect(source).toMatch(EXACT);
    });

    it(`${file.split('/').slice(-2).join('/')} does not import the rounding one`, () => {
      // The alias `formatMoneyExact as formatMoney` is removed before testing.
      // Several of these pages use it so their call sites read the same as
      // everywhere else -- which is precisely how the portal's rounding import
      // hid in plain sight, and why this test looks at the IMPORT rather than
      // the call.
      const source = readFileSync(join(process.cwd(), file), 'utf8')
        .split('formatMoneyExact as formatMoney').join('formatMoneyExact');
      const importsRounding = /import \{[^}]*\bformatMoney\b[^}]*\} from '@\/lib\/(jobs|invoices)'/.test(source);
      expect(importsRounding, 'imports the whole-dollar formatMoney').toBe(false);
    });

    it(`${file.split('/').slice(-2).join('/')} does not roll its own rounding formatter`, () => {
      // The mechanism that hid every one of the four surfaces added above: not
      // an import of the wrong helper, but a fresh local money() a few lines
      // from the top. Checking imports alone cannot see it.
      const code = stripComments(readFileSync(join(process.cwd(), file), 'utf8'));
      expect(code, 'declares a whole-dollar Intl formatter').not.toContain('maximumFractionDigits: 0');
      expect(code, 'declares a Math.round money formatter').not.toMatch(/\$' \+ Math\.round\(/);
    });
  }
});

describe('the two formatters really do differ where it matters', () => {
  it('keeps the cents that rounding would lose', () => {
    // Guards the guard. If these ever produced the same string, every assertion
    // above would pass while proving nothing.
    expect(formatMoneyExact(4237.5)).toBe('$4,237.50');
    expect(formatMoneyExact(4237.5)).not.toBe('$4,238');
  });

  it('is the difference a customer would notice on a statement', () => {
    // Half a dollar on one invoice is trivial; the point is that it does not
    // match what their bank shows, which is what makes somebody ring up.
    expect(formatMoneyExact(0.5)).toBe('$0.50');
    expect(formatMoneyExact(1234.05)).toBe('$1,234.05');
  });

  it('puts the sign outside the symbol on a credit', () => {
    expect(formatMoneyExact(-120)).toBe('-$120.00');
  });
});

describe('a summary may still round', () => {
  it('leaves the booking page alone', () => {
    // "from $150" on a service card is a genuine summary -- an opening price,
    // not a debt, and nobody reconciles it. This file is not a blanket ban on
    // the rounding formatter; it is a rule about pages where money is owed.
    const source = readFileSync(join(process.cwd(), 'src/app/book/[subdomain]/page.tsx'), 'utf8');
    expect(source).toContain('formatMoney(');
    expect(source).toContain('from ${formatMoney(service.unit_price)}');
  });
});

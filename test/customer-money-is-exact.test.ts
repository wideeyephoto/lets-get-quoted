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
  /**
   * AND WHAT THE CONTRACTOR PRINTS AND HANDS THEM.
   *
   * This one was missed because the list grew by asking "what does the customer
   * load?" — and this page loads for the OWNER, behind auth, under
   * /dashboard. It has a print button, and the paper goes to the customer to
   * settle up from. It imported the rounding formatMoney for every box, every
   * job row, the table total and every payment, so three $438.50 jobs printed
   * as three $439 rows over a $1,316 total.
   *
   * The rule was never about who fetches the URL. It is about who reads the
   * number and acts on it.
   */
  'src/app/dashboard/clients/[id]/statement/page.tsx',
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

/**
 * EMAIL IS TWO KINDS OF NUMBER IN ONE FILE.
 *
 * src/lib/email.ts sends both the messages that name ONE transaction -- the quote
 * a homeowner approves, the payment request they are sent, the invoice total --
 * and the daily digest, whose figures are day totals beside their counts.
 *
 * The first kind must be exact, and not only because two of them are the amount
 * charged: an owner alert reading $4,238 for a quote the customer received as
 * $4,237.50 is two people holding two numbers for one debt, which is the same
 * failure as two screens doing it.
 *
 * The second kind may round, and should: '3 - $1,240' is a summary nobody
 * reconciles, which is the case formatUsdRounded documents as its own. So this
 * asserts the SPLIT rather than banning the rounding formatter outright.
 */
describe('a transactional email names the figure exactly; a digest may round', () => {
  const EMAIL = readFileSync(join(process.cwd(), 'src/lib/email.ts'), 'utf8');
  const RENDERERS = readFileSync(join(process.cwd(), 'src/emails/renderers.ts'), 'utf8');
  const ALL_EMAIL = `${EMAIL}\n${RENDERERS}`;

  it('uses the exact formatter for every single-transaction figure', () => {
    for (const line of [
      '`Job ${input.jobRef} · ${formatMoneyExact(input.quotedAmount)}`',
      '`${input.label} · ${formatMoneyExact(input.amount)}`',
      '`${input.invoiceRef} · ${formatMoneyExact(input.total)}`',
    ]) {
      expect(EMAIL, line).toContain(line);
    }
    expect(ALL_EMAIL).toMatch(/formatUsdExact\(input\.quotedAmount\)|formatMoneyExact\(input\.quotedAmount\)/);
  });

  it('leaves the rounding formatter to the digest and the forecast', () => {
    // Every surviving rounded call must be a day total or a projection. If a new
    // transactional message picks up formatMoney, it lands outside this set and
    // this fails -- which is the point, since the file legitimately imports both.
    const rounded = [...EMAIL.matchAll(/formatMoney\((.*?)\)/g)].map((m) => m[1]);
    expect(rounded.length).toBeGreaterThan(0);
    for (const argument of rounded) {
      expect(argument, `formatMoney(${argument}) is not a summary figure`)
        .toMatch(/^d\.(moneyInTotal|failedTotal|openRequestsTotal|cash\.amount)$/);
    }
  });
});

/**
 * NOT ONLY CUSTOMERS. The rule is about whether somebody CHECKS the number
 * against something else, and two staff-facing surfaces fail that test as
 * squarely as any invoice.
 *
 * Crew pay is checked against hours worked. Labour cost is round2(hours * rate),
 * so 12.5 hours at $13.75 is $171.88 and printed "$172" -- on a panel showing
 * each row AND their total. Somebody checking their own pay does not have a
 * rounding convention in mind.
 *
 * The insights PDF says in its own comment that it is "for glancing, not
 * summing", and its tables disprove it: Revenue by service prints every slice
 * and then the Total beneath them.
 */
describe('a figure somebody reconciles is exact, staff-facing or not', () => {
  const RECONCILED_SURFACES = [
    // Each row and the total, against hours worked.
    'src/components/crew-work-history.tsx',
    // Slice rows against the Total printed under them.
    'src/lib/insights-export.ts',
    // What a customer has paid and still owes.
    'src/lib/client-detail.ts',
  ] as const;

  for (const file of RECONCILED_SURFACES) {
    it(`${file.split('/').pop()} formats to the cent`, () => {
      const code = stripComments(readFileSync(join(process.cwd(), file), 'utf8'));
      expect(code, 'declares a whole-dollar Intl formatter').not.toContain('maximumFractionDigits: 0');
      expect(code, 'rounds with Math.round before printing').not.toMatch(/\$' \+ Math\.round\(/);
      expect(code).toMatch(EXACT);
    });
  }

  it('leaves the recurring calendar rounding, deliberately', () => {
    // The counter-example, so this describe is not read as a blanket rule. A
    // month label on the recurring calendar -- "March 2026 · $1,200" -- is a
    // projection whose per-visit parts are not shown beside it, so nobody can
    // fail to add it up. It was audited and left alone.
    const code = stripComments(readFileSync(join(process.cwd(), 'src/lib/recurring-view.ts'), 'utf8'));
    expect(code).toContain('formatMoney(total)');
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

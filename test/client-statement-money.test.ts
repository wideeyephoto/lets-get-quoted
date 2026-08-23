import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The statement is the paper a contractor hands a customer to settle up from,
 * and it disagreed with the invoice three ways at once.
 *
 * 1. Every figure was rounded to whole dollars by `formatMoney`, whose own
 *    definition says to use `formatMoneyExact` for anything a customer pays.
 * 2. Refunds were invisible: `refunded_amount` was not even selected, so money
 *    that had gone back to the customer still counted as paid.
 * 3. The Quick Stop priority-visit fee was credited against the quote, while
 *    /pay/[id] tells the homeowner in as many words that it "is not taken off
 *    the cost of the job".
 *
 * The rounding half is guarded by customer-money-is-exact.test.ts, which now
 * lists this page. This file guards the arithmetic underneath it.
 */

const clients = readFileSync(join(process.cwd(), 'src', 'lib', 'clients.ts'), 'utf8');
const statement = readFileSync(
  join(process.cwd(), 'src', 'app', 'dashboard', 'clients', '[id]', 'statement', 'page.tsx'),
  'utf8',
);

describe('what the statement counts as paid', () => {
  it('selects refunded_amount, so a refund can be seen at all', () => {
    // It was absent from the select entirely -- not ignored, invisible.
    const select = clients.slice(clients.indexOf("from('payments')"));
    expect(select.slice(0, 400)).toContain('refunded_amount');
  });

  it('nets refunds off the amount rather than counting the gross', () => {
    expect(clients).toMatch(/Number\(payment\.amount\)\s*\|\|\s*0\)\s*-\s*\(Number\(payment\.refunded_amount\)/);
  });

  it('excludes the priority-visit fee from what pays down the job', () => {
    // The customer was told it is not credited. It was being credited.
    expect(clients).toContain('feePaymentIds');
    expect(clients).toContain("from('extra_stop_requests')");
    expect(clients).toMatch(/!feePaymentIds\.has\(/);
  });

  it('identifies the fee by its LINK, not by invoice_id or label', () => {
    // Filtering on invoice_id would have dropped genuine deposits: of the four
    // payments in production, two carry one and two do not. And matching the
    // label is a string that copywriting can change. extra_stop_requests
    // .payment_id is the row that actually says "this payment is that fee".
    const block = clients.slice(clients.indexOf('const feePaymentIds'), clients.indexOf('const paidByJob'));
    expect(block).toContain('payment_id');
    expect(block).not.toContain('invoice_id');
    expect(block).not.toContain('Quick Stop');
  });

  it('still scopes the fee lookup to the workspace', () => {
    const block = clients.slice(clients.indexOf('const feePaymentIds'), clients.indexOf('const paidByJob'));
    expect(block).toContain("eq('account_id', accountId)");
  });
});

describe('what the statement shows', () => {
  it('does not style an overpayment as settled', () => {
    // `outstanding > 0 ? 'due' : 'pos'` painted a NEGATIVE balance green, which
    // reads as "nothing owed" when the customer is in fact owed money back.
    expect(statement).not.toMatch(/outstanding > 0 \? 'due' : 'pos'/);
    expect(statement).toContain("statement.outstanding < 0 ? 'credit'");
  });

  it('says out loud that a credit is owed to the customer', () => {
    expect(statement).toContain('Credit owed to customer');
  });
});

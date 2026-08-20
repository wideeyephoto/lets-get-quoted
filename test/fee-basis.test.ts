import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The platform fee applies to the discount-adjusted service subtotal, not the
 * gross. /pricing says so outright: "Separately stated sales tax, tips, Stripe
 * fees, refunds, and credits are excluded. Deposits and installments allocate
 * that eligible subtotal proportionally."
 *
 * The charge path took the gross. For an invoice-derived payment
 * `payments.amount` is `invoice.total` = taxable + tax, so LGQ was charging a
 * percentage of the state's sales tax.
 *
 * The refund side needs no change, and it is worth writing down why, because it
 * was reported as a blocker and is not one. reversedPlatformFee is
 * `fee x (refunded / amount)`, and Stripe's refund_application_fee reverses
 * proportionally too. Since fee = basis x rate, the reversal is
 * basis x rate x R/G on both sides -- the proportionality constant cancels, so
 * moving the BASIS never desynchronises the reversal.
 */

const state = {
  invoice: null as Record<string, unknown> | null,
  items: [] as Array<{ amount: number }>,
  siblings: [] as Array<Record<string, unknown>>,
  invoiceError: null as { message: string } | null,
};

function adminDouble() {
  return {
    from: (table: string) => {
      const result = (data: unknown, error: unknown = null) => {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({ data, error }),
          then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data, error }).then(resolve),
        };
        return chain;
      };
      if (table === 'invoices') return result(state.invoice, state.invoiceError);
      if (table === 'invoice_items') return result(state.items);
      if (table === 'payments') return result(state.siblings);
      throw new Error(`unexpected table ${table}`);
    },
  } as never;
}

vi.mock('@/lib/auth', () => ({ createAdminClient: () => adminDouble() }));

const { resolveFeeBasisCents } = await import('@/lib/billing/fee-basis');

beforeEach(() => {
  // $1,000 of work, no discount, 8% tax -> total $1,080.
  state.invoice = { total: 1080, discount_percent: 0, tax_rate: 8 };
  state.items = [{ amount: 1000 }];
  state.siblings = [];
  state.invoiceError = null;
});

describe('what the fee is charged on', () => {
  it('excludes sales tax', async () => {
    const basis = await resolveFeeBasisCents(adminDouble(), { id: 'p1', amount: 1080, invoice_id: 'inv1' });
    expect(basis.source).toBe('invoice_subtotal');
    expect(basis.basisCents).toBe(100_000);
    expect(basis.grossCents).toBe(108_000);
    // At Flex's 1.25% that is $12.50, which is what /pricing advertises -- not
    // the $13.50 the gross basis produced.
    expect(Math.round(basis.basisCents * 0.0125)).toBe(1_250);
  });

  it('excludes the discount as well as the tax', async () => {
    // $1,000 of work, 10% off -> $900 taxable, 8% tax -> $972.
    state.invoice = { total: 972, discount_percent: 10, tax_rate: 8 };
    const basis = await resolveFeeBasisCents(adminDouble(), { id: 'p1', amount: 972, invoice_id: 'inv1' });
    expect(basis.basisCents).toBe(90_000);
  });

  it('allocates a deposit proportionally rather than front-loading it', async () => {
    // Half the invoice paid now. The promise is proportional allocation, so half
    // the eligible subtotal -- not "the first $540 is all service".
    const basis = await resolveFeeBasisCents(adminDouble(), { id: 'p1', amount: 540, invoice_id: 'inv1' });
    expect(basis.basisCents).toBe(50_000);
  });

  it('gives the remainder to the final payment, exactly', async () => {
    // The whole point of cumulative allocation: arbitrary splits must add back
    // to the eligible subtotal to the cent, with no tax rounding leaking in.
    state.siblings = [{ id: 'p1', amount: 540, refunded_amount: 0, status: 'paid' }];
    const basis = await resolveFeeBasisCents(adminDouble(), { id: 'p2', amount: 540, invoice_id: 'inv1' });
    expect(basis.basisCents).toBe(50_000);

    state.siblings = [{ id: 'p1', amount: 359.99, refunded_amount: 0, status: 'paid' }];
    const odd = await resolveFeeBasisCents(adminDouble(), { id: 'p2', amount: 720.01, invoice_id: 'inv1' });
    const first = await resolveFeeBasisCents(adminDouble(), { id: 'p1', amount: 359.99, invoice_id: 'inv1' });
    // p1's own allocation is computed with nothing paid before it.
    state.siblings = [];
    expect(first.basisCents + odd.basisCents).toBe(100_000);
  });

  it('treats a payment with no invoice as all service', async () => {
    // Tax only ever enters an amount through computeInvoiceTotals, which is
    // reachable only from an invoice. Quick stops, change orders and plan
    // installments carry an owner-typed figure with no tax term.
    const basis = await resolveFeeBasisCents(adminDouble(), { id: 'p1', amount: 250, invoice_id: null });
    expect(basis.source).toBe('gross_no_invoice');
    expect(basis.basisCents).toBe(25_000);
  });
});

describe('it never refuses, because refusing blocks a payment', () => {
  const cases: Array<[string, () => void, unknown]> = [
    ['the invoice cannot be read', () => { state.invoiceError = { message: 'boom' }; }, 1080],
    ['the invoice is missing', () => { state.invoice = null; }, 1080],
    ['the total disagrees with the line items', () => { state.items = [{ amount: 5 }]; }, 1080],
    ['the invoice is already overpaid', () => {
      state.siblings = [{ id: 'x', amount: 2000, refunded_amount: 0, status: 'paid' }];
    }, 1080],
  ];

  for (const [name, arrange, amount] of cases) {
    it(`falls back to gross when ${name}`, async () => {
      arrange();
      const basis = await resolveFeeBasisCents(adminDouble(), { id: 'p1', amount: amount as number, invoice_id: 'inv1' });
      expect(basis.source).toBe('gross_fallback');
      expect(basis.basisCents).toBe(basis.grossCents);
      expect(basis.reason, 'a fallback must say why').toBeTruthy();
    });
  }

  it('falls back when the payment collects more than the invoice', async () => {
    // Explicitly permitted elsewhere in the product, and prepay is attached to
    // an unrelated invoice. allocate throws on exactly this shape.
    const basis = await resolveFeeBasisCents(adminDouble(), { id: 'p1', amount: 5000, invoice_id: 'inv1' });
    expect(basis.source).toBe('gross_fallback');
    expect(basis.basisCents).toBe(500_000);
  });

  it('never charges on more than the payment itself', async () => {
    // payments_platform_fee_check enforces fee <= fee_basis_amount <= amount.
    for (const amount of [1080, 540, 0.01, 5000]) {
      const basis = await resolveFeeBasisCents(adminDouble(), { id: 'p1', amount, invoice_id: 'inv1' });
      expect(basis.basisCents).toBeLessThanOrEqual(basis.grossCents);
      expect(basis.basisCents).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('how it is wired', () => {
  const read = (...parts: string[]): string =>
    readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

  it('bills and stores the basis, not the gross', () => {
    const payments = read('src', 'lib', 'payments.ts');
    expect(payments).toContain('resolveFeeBasisCents');
    expect(payments).toContain('application_fee_amount: platformFeeCents');
    // The row has to record what it charged on, or a refund cannot be checked
    // against it later.
    expect(payments).toContain('fee_basis_amount:');
    // The old gross-based call must be gone from the charge path.
    expect(payments).not.toContain('computePlatformFeeCents(payment.amount, feeRate)');
  });

  it('quotes the same number the card will be charged', () => {
    // getQuotedFee takes only an amount and cannot know whether it carries tax.
    // Quoting with it here would print a different figure than the charge.
    const payPage = read('src', 'app', 'pay', '[id]', 'page.tsx');
    expect(payPage).toContain('quoteFeeForPayment(payment)');
    expect(payPage).not.toContain('getQuotedFee(');
  });

  it('leaves the refund proportionality alone, which is already correct', () => {
    // fee = basis x rate, so a reversal of fee x (R/G) is basis x rate x R/G --
    // exactly what a subtotal basis wants. Changing this would break it.
    const payments = read('src', 'lib', 'payments.ts');
    expect(payments).toContain('const share = Math.min(1, refunded / amount);');
    expect(payments).toContain('refund_application_fee: true');
  });
});

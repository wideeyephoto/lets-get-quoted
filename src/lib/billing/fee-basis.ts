import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  allocateEligibleServiceSubtotalCents,
  discountAdjustedServiceSubtotalCents,
} from '@/lib/billing/payment-fee';
import { computeInvoiceTotals } from '@/lib/invoices';
import { toCents } from '@/lib/stripe';

/**
 * What the platform fee is charged ON.
 *
 * /pricing says it plainly: "The fee applies only to the discount-adjusted
 * service subtotal successfully collected through LGQ... Separately stated sales
 * tax, tips, Stripe fees, refunds, and credits are excluded. Deposits and
 * installments allocate that eligible subtotal proportionally."
 *
 * The charge path billed the full gross instead. For an invoice-derived payment
 * `payments.amount` is `Number(invoice.total)`, which is `taxable + taxAmount` --
 * so sales tax sat inside the fee. On a $1,000 invoice at 8% tax that is $13.50
 * billed where $12.50 was advertised.
 *
 * Two things make this smaller than it looks:
 *
 *  - There is no tip or gratuity concept anywhere in the product, so "excluding
 *    tips" is vacuously satisfied. `taxable` in computeInvoiceTotals IS the
 *    promised basis.
 *  - Tax only ever enters an amount through computeInvoiceTotals, which is
 *    reachable only from an invoice. A payment with no invoice -- a quick stop, a
 *    change order, a payment-plan installment, a plan payoff -- has no tax
 *    component at all, so its gross IS its service subtotal and needs no lookup.
 *
 * One thing it cannot do: `invoice_items` has no category column, so "labor,
 * materials, equipment, and service-charge line items" cannot be told apart from
 * anything else on the invoice. Every line is treated as eligible. That is more
 * generous than the words, never less, so it cannot overcharge against the
 * promise.
 *
 * NEVER THROWS. A fee basis that refuses would block a homeowner from paying,
 * and there are legitimate shapes it cannot model -- a payment deliberately
 * collecting more than its invoice, or prepay attached to an unrelated one.
 * Every one of those falls back to gross, which is what was charged before this
 * existed, and reports why.
 */

export type FeeBasis = Readonly<{
  /** Cents the fee rate is applied to. */
  basisCents: number;
  /** Gross cents of the payment, for the caller's own bookkeeping. */
  grossCents: number;
  source: 'invoice_subtotal' | 'gross_no_invoice' | 'gross_fallback';
  /** Set only when source is gross_fallback -- why the promised basis was unavailable. */
  reason?: string;
}>;

type PaymentRow = {
  id?: string | null;
  amount: number | string;
  invoice_id?: string | null;
};

function grossBasis(grossCents: number, source: FeeBasis['source'], reason?: string): FeeBasis {
  return Object.freeze({ basisCents: grossCents, grossCents, source, ...(reason ? { reason } : {}) });
}

export async function resolveFeeBasisCents(
  admin: SupabaseClient,
  payment: PaymentRow,
): Promise<FeeBasis> {
  const grossCents = toCents(Number(payment.amount) || 0);
  if (grossCents <= 0) return grossBasis(grossCents, 'gross_fallback', 'non-positive amount');

  // No invoice means no tax was ever applied, so gross already IS the service
  // subtotal. This is the common case for quick stops, change orders and
  // payment-plan installments.
  if (!payment.invoice_id) return grossBasis(grossCents, 'gross_no_invoice');

  try {
    const [{ data: invoice, error: invoiceError }, { data: items, error: itemsError }, { data: siblings, error: siblingsError }] =
      await Promise.all([
        admin.from('invoices').select('total, discount_percent, tax_rate').eq('id', payment.invoice_id).maybeSingle(),
        admin.from('invoice_items').select('amount').eq('invoice_id', payment.invoice_id),
        admin.from('payments').select('id, amount, refunded_amount, status').eq('invoice_id', payment.invoice_id),
      ]);

    if (invoiceError || itemsError || siblingsError || !invoice) {
      return grossBasis(grossCents, 'gross_fallback', 'invoice could not be read');
    }

    const totals = computeInvoiceTotals(
      (items ?? []).map((item) => ({ amount: Number(item.amount) || 0 })),
      Number(invoice.discount_percent) || 0,
      Number(invoice.tax_rate) || 0,
    );

    // The invoice's own stored total is authority for gross; a line-item sum that
    // disagrees with it means the invoice moved under us and the allocation
    // below would be against the wrong denominator.
    const invoiceGrossCents = toCents(Number(invoice.total) || 0);
    if (invoiceGrossCents <= 0 || toCents(totals.total) !== invoiceGrossCents) {
      return grossBasis(grossCents, 'gross_fallback', 'invoice total does not match its line items');
    }

    // Net of refunds, and excluding this payment itself -- it has not landed yet.
    const paidBefore = (siblings ?? [])
      .filter((row) => row.status === 'paid' && row.id !== payment.id)
      .reduce((sum, row) => sum + (Number(row.amount) || 0) - (Number(row.refunded_amount) || 0), 0);
    const grossPaidBeforeCents = Math.max(0, toCents(paidBefore));

    // Deliberately guarded rather than caught: allocate throws on exactly these
    // two shapes, and both are legitimate here.
    if (grossPaidBeforeCents > invoiceGrossCents) {
      return grossBasis(grossCents, 'gross_fallback', 'invoice is already paid beyond its total');
    }
    if (grossPaidBeforeCents + grossCents > invoiceGrossCents) {
      // Collecting more than the invoice is explicitly permitted elsewhere in
      // the product, and prepay is attached to an unrelated invoice.
      return grossBasis(grossCents, 'gross_fallback', 'payment exceeds the invoice balance');
    }

    const basisCents = allocateEligibleServiceSubtotalCents({
      invoiceGrossCents,
      // The same function the direct rail and the SQL projector use, so the two
      // rails cannot answer this differently.
      invoiceEligibleServiceSubtotalCents: discountAdjustedServiceSubtotalCents(
        toCents(totals.subtotal),
        totals.discountPercent,
      ),
      grossPaidBeforeCents,
      grossPaymentCents: grossCents,
    });

    // payments_platform_fee_check enforces platform_fee <= fee_basis_amount, and
    // fee_basis_amount <= amount. A basis above gross would be refused by the
    // database; catching it here keeps the failure legible.
    if (basisCents < 0 || basisCents > grossCents) {
      return grossBasis(grossCents, 'gross_fallback', 'allocated basis fell outside the payment');
    }

    return Object.freeze({ basisCents, grossCents, source: 'invoice_subtotal' });
  } catch (error) {
    console.error('resolveFeeBasisCents fell back to gross:', error instanceof Error ? error.message : error);
    return grossBasis(grossCents, 'gross_fallback', 'unexpected failure');
  }
}

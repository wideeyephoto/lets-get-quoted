'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/auth';
import { computeInvoiceTotals, getPublicInvoice, signInvoice } from '@/lib/invoices';
import { invoicePayState, type InvoicePayment } from '@/lib/invoice-pay';

export async function signInvoiceAction(invoiceId: string, formData: FormData) {
  const signerName = (formData.get('signerName') ?? '').toString().trim();
  const agreed = formData.get('agree') === 'on';

  if (!signerName || !agreed) {
    throw new Error('A full name and the agreement checkbox are required to sign.');
  }

  await signInvoice(invoiceId, signerName);

  const record = await getPublicInvoice(invoiceId);
  revalidatePath(`/invoice/${invoiceId}`);
  if (record?.invoice.job_id) {
    revalidatePath(`/dashboard/jobs/${record.invoice.job_id}`);
    revalidatePath(`/dashboard/jobs/${record.invoice.job_id}/invoices/${invoiceId}`);
  }
}

/**
 * "Pay this invoice" — reuse the open payment request for this invoice, or mint
 * one, then hand off to the existing /pay page and its Stripe checkout.
 *
 * This is an UNAUTHENTICATED server action, which in this codebase means it is a
 * public endpoint that anyone who has the invoice link can call. What that is
 * allowed to do is deliberately narrow:
 *
 *   * The only input is the invoice id, which the caller already had — it is the
 *     URL they are standing on.
 *   * The amount is computed here from the invoice's own line items. Nothing the
 *     caller sends can influence what gets charged.
 *   * A draft or void invoice is refused. invoicePayState owns that rule, and it
 *     is unit-tested rather than restated here.
 *   * An existing open request for the same amount is REUSED. Without that,
 *     tapping the button twice leaves two live payment links for one invoice,
 *     and a part-payment makes one of them wrong.
 *
 * The worst a stranger with the link can do is create one payment row for the
 * exact amount of an invoice that was already sent — which they would then have
 * to pay.
 */
export async function payInvoiceAction(invoiceId: string) {
  const record = await getPublicInvoice(invoiceId);
  if (!record) throw new Error('Invoice not found.');

  const { invoice, items } = record;
  const totals = computeInvoiceTotals(items, Number(invoice.discount_percent) || 0, Number(invoice.tax_rate) || 0);

  const admin = createAdminClient();
  const { data: paymentRows } = await admin
    .from('payments')
    // async_payment_pending_at is REQUIRED, not optional detail. invoicePayState
    // distinguishes a bank transfer in flight from an abandoned checkout with
    // it, and both look like `status = 'processing'` without it. Omitting it
    // here made this action unable to reach its own `processing` branch, so it
    // and the page disagreed about the same invoice while reading the same
    // function.
    .select('id, amount, status, invoice_id, refunded_amount, async_payment_pending_at')
    .eq('account_id', invoice.account_id)
    .eq('invoice_id', invoiceId);

  const state = invoicePayState(invoice, totals.total, (paymentRows ?? []) as InvoicePayment[]);

  // Already in flight — send them to it rather than starting a second one.
  if (state.state === 'processing') redirect(`/pay/${state.paymentId}`);
  if (state.state !== 'payable') throw new Error('This invoice is not currently payable.');
  if (state.paymentId) redirect(`/pay/${state.paymentId}`);

  const { data: created, error } = await admin
    .from('payments')
    .insert({
      account_id: invoice.account_id,
      job_id: invoice.job_id,
      invoice_id: invoice.id,
      kind: 'final',
      label: `Invoice ${invoice.ref}`,
      amount: state.due,
      status: 'requested',
    })
    .select('id')
    .single();

  if (error || !created) throw new Error('Could not start this payment. Please try again.');

  revalidatePath(`/dashboard/jobs/${invoice.job_id}`);
  redirect(`/pay/${created.id}`);
}

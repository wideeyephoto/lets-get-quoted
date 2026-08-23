'use server';

import { redirect } from 'next/navigation';
import { parsePaymentAmount, paymentAmountError } from '@/lib/money-input';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { requireOwnerContext } from '@/lib/auth';
import { loadBusinessName } from '@/lib/business-name';
import { createJobFeedEvent } from '@/lib/job-feed';
import {
  addInvoiceItem,
  createInvoice,
  deleteInvoice,
  deleteInvoiceItem,
  updateInvoiceCharges,
  updateInvoiceStatus,
  getInvoiceWithItems,
  type InvoiceStatus,
} from '@/lib/invoices';
import { getJob } from '@/lib/jobs';
import { sendInvoiceEmail, sendInvoiceSentConfirmationEmail, type SentChannel } from '@/lib/email';

export async function createInvoiceAction(jobId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const status = (formData.get('status') as InvoiceStatus) || 'draft';
  const invoice = await createInvoice(supabase, accountId, jobId, status);

  await createJobFeedEvent(supabase, accountId, jobId, {
    kind: status === 'sent' ? 'invoice_sent' : 'invoice_created',
    title: status === 'sent' ? 'Invoice sent' : 'Invoice created',
    body: invoice.ref,
    visibility: status === 'sent' ? 'client_financial' : 'internal',
    amount: Number(invoice.total),
    sourceTable: 'invoices',
    sourceId: invoice.id,
    actionUrl: `/invoice/${invoice.id}`,
  });

  revalidatePath(`/dashboard/jobs/${jobId}`);
  redirect(`/dashboard/jobs/${jobId}/invoices/${invoice.id}`);
}

export async function addInvoiceItemAction(jobId: string, invoiceId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const description = (formData.get('description') ?? '').toString().trim() || 'Line item';
  // Parsed, not coerced. A dollar sign or a decimal comma makes Number() return
  // NaN, which slips past an "amount <= 0" guard -- NaN <= 0 is false -- and
  // lands on invoice_items.amount, which is numeric NOT NULL.
  const parsedAmount = parsePaymentAmount(formData.get('amount'));
  if (!parsedAmount.ok) throw new Error(paymentAmountError(parsedAmount.reason));
  const amount = parsedAmount.amount;

  await addInvoiceItem(supabase, accountId, invoiceId, { description, amount }, jobId);

  revalidatePath(`/dashboard/jobs/${jobId}/invoices/${invoiceId}`);
}

export async function updateInvoiceChargesAction(jobId: string, invoiceId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const discountPercent = Number(formData.get('discountPercent'));
  const taxRate = Number(formData.get('taxRate'));

  await updateInvoiceCharges(supabase, accountId, jobId, invoiceId, {
    discountPercent: Number.isFinite(discountPercent) ? discountPercent : 0,
    taxRate: Number.isFinite(taxRate) ? taxRate : 0,
  });

  revalidatePath(`/dashboard/jobs/${jobId}/invoices/${invoiceId}`);
}

export async function deleteInvoiceItemAction(jobId: string, invoiceId: string, itemId: string) {
  const { supabase, accountId } = await requireOwnerContext();

  await deleteInvoiceItem(supabase, accountId, jobId, invoiceId, itemId);

  revalidatePath(`/dashboard/jobs/${jobId}/invoices/${invoiceId}`);
}

export async function updateInvoiceStatusAction(jobId: string, invoiceId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const status = (formData.get('status') as InvoiceStatus) || 'draft';
  // Reject a forged nested route before any email, status, or feed side effect.
  // From here on, the invoice row is the source of truth for the job context.
  const invoiceData = await getInvoiceWithItems(supabase, accountId, invoiceId, jobId);
  if (!invoiceData) {
    throw new Error('Invoice not found for this job.');
  }
  const { invoice, items } = invoiceData;
  const verifiedJobId = invoice.job_id;

  // If status is changing to 'sent', send invoice email
  if (status === 'sent') {
    try {
      const businessName = await loadBusinessName(supabase, accountId);

      // Get job details
      const job = await getJob(supabase, accountId, verifiedJobId);
      if (!job) {
        throw new Error('Job not found');
      }

      const { data: { user } } = await supabase.auth.getUser();

      const h = headers();
      const proto = h.get('x-forwarded-proto') ?? 'http';
      const host = h.get('host');
      const origin = `${proto}://${host}`;

      // The invoice goes to the CLIENT. It is addressed to them, shows their
      // name, and carries a public no-login link to review, sign and pay —
      // which only works if it reaches the person doing those things. It used to
      // be sent to the contractor instead, so the homeowner never got the
      // invoice and the payment link never reached anyone who could use it.
      let channel: SentChannel = 'none';
      let sentTo: string | null = null;
      if (job.client_email) {
        await sendInvoiceEmail({
          invoice,
          items,
          businessName,
          clientName: job.client_name,
          jobRef: job.ref,
          recipientEmail: job.client_email,
          origin,
          accountId,
        });
        channel = 'email';
        sentTo = job.client_email;
      }

      // ...and the contractor gets a receipt of the fact, not a copy of the
      // customer's document. When there was nowhere to send it, that is what the
      // receipt says — better than letting them wait on a payment request the
      // customer never received.
      if (user?.email) {
        await sendInvoiceSentConfirmationEmail({
          accountId,
          recipientEmail: user.email,
          businessName,
          clientName: job.client_name,
          invoiceRef: invoice.ref,
          total: Number(invoice.total),
          channel,
          sentTo,
          jobUrl: `${origin}/dashboard/jobs/${verifiedJobId}`,
        });
      }
    } catch (err) {
      // Log it but never fail the status change over an email.
      console.error('Failed to send invoice email:', err);
    }
  }

  await updateInvoiceStatus(supabase, accountId, verifiedJobId, invoiceId, status);

  if (status === 'sent' || status === 'paid' || status === 'signed') {
    await createJobFeedEvent(supabase, accountId, verifiedJobId, {
      kind: status === 'paid' ? 'invoice_paid' : status === 'signed' ? 'invoice_signed' : 'invoice_sent',
      title: status === 'paid' ? 'Invoice paid' : status === 'signed' ? 'Invoice signed' : 'Invoice sent',
      body: invoice.ref,
      visibility: 'client_financial',
      amount: Number(invoice.total),
      sourceTable: 'invoices',
      sourceId: invoiceId,
      actionUrl: `/invoice/${invoiceId}`,
    });
  }

  revalidatePath(`/dashboard/jobs/${verifiedJobId}/invoices/${invoiceId}`);
}

export async function deleteInvoiceAction(jobId: string, invoiceId: string) {
  const { supabase, accountId } = await requireOwnerContext();

  const invoiceData = await getInvoiceWithItems(supabase, accountId, invoiceId, jobId);
  if (!invoiceData) throw new Error('Invoice not found for this job.');
  const verifiedJobId = invoiceData.invoice.job_id;

  await deleteInvoice(supabase, accountId, verifiedJobId, invoiceId);

  revalidatePath(`/dashboard/jobs/${verifiedJobId}`);
  redirect(`/dashboard/jobs/${verifiedJobId}?open=payment#request-payment`);
}

export async function cancelInvoiceAction(jobId: string, invoiceId: string) {
  const { supabase, accountId } = await requireOwnerContext();
  const invoiceData = await getInvoiceWithItems(supabase, accountId, invoiceId, jobId);
  if (!invoiceData) throw new Error('Invoice not found for this job.');
  const { invoice } = invoiceData;
  const verifiedJobId = invoice.job_id;

  if (invoice.status === 'paid') throw new Error('Paid invoices cannot be cancelled.');
  if (invoice.status === 'void') {
    revalidatePath(`/dashboard/jobs/${verifiedJobId}`);
    return;
  }

  await updateInvoiceStatus(supabase, accountId, verifiedJobId, invoiceId, 'void');

  await createJobFeedEvent(supabase, accountId, verifiedJobId, {
    kind: 'invoice_voided',
    title: 'Invoice cancelled',
    body: invoice.ref,
    visibility: 'client_financial',
    amount: Number(invoice.total),
  });

  revalidatePath(`/dashboard/jobs/${verifiedJobId}`);
  revalidatePath(`/dashboard/jobs/${verifiedJobId}/invoices/${invoiceId}`);
}

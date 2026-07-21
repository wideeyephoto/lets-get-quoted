'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { requireOwnerContext } from '@/lib/auth';
import { getJob } from '@/lib/jobs';
import { cancelPaymentRequest, createDepositRequest, getPaymentDetails, refundPayment, markPaymentFailed, markPaymentPaidManually, retryPayment, type PaymentKind } from '@/lib/payments';
import { addInvoiceItem, createInvoice, listInvoices, selectPrimaryInvoice } from '@/lib/invoices';
import { createPaymentFeedEvent, createJobFeedEvent } from '@/lib/job-feed';
import { normalizeUsPhone } from '@/lib/phone';
import { recordSmsConsent, retryFailedPaymentSmsEvent, sendPaymentSmsEvent } from '@/lib/sms';

async function ensureJobInvoice(supabase: Awaited<ReturnType<typeof requireOwnerContext>>['supabase'], accountId: string, jobId: string) {
  const invoices = await listInvoices(supabase, accountId, jobId);
  const invoice = selectPrimaryInvoice(invoices) ?? await createInvoice(supabase, accountId, jobId, 'draft');
  const job = await getJob(supabase, accountId, jobId);
  if (job && Number(invoice.total) <= 0 && Number(job.quoted_amount) > 0) {
    await addInvoiceItem(supabase, accountId, invoice.id, { description: 'Quoted job total', amount: Number(job.quoted_amount) });
    return { ...invoice, total: Number(job.quoted_amount) };
  }
  return invoice;
}

export async function createDepositRequestAction(jobId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const amount = Number(formData.get('amount'));
  const label = (formData.get('label') ?? '').toString().trim() || 'Deposit';
  const kind = (formData.get('kind') as PaymentKind) || 'deposit';
  const invoice = await ensureJobInvoice(supabase, accountId, jobId);
  const sendSms = formData.get('sendSms') === 'on';
  const phoneInput = (formData.get('homeownerPhone') ?? '').toString();
  const homeownerPhone = phoneInput ? normalizeUsPhone(phoneInput) : null;
  if (sendSms && !homeownerPhone) {
    throw new Error('Enter a valid homeowner mobile number before sending a text.');
  }

  if (sendSms && homeownerPhone) await recordSmsConsent(accountId, homeownerPhone);
  const payment = await createDepositRequest(supabase, accountId, jobId, {
    label,
    amount,
    kind,
    invoiceId: invoice.id,
    homeownerPhone,
    smsConsent: sendSms,
  });
  await createPaymentFeedEvent(supabase, payment.id, 'payment_requested');
  if (sendSms) await sendPaymentSmsEvent(payment.id, 'payment_requested');

  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function refundPaymentAction(jobId: string, paymentId: string) {
  const { supabase, accountId } = await requireOwnerContext();

  await refundPayment(supabase, accountId, paymentId);

  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function markPaymentFailedAction(jobId: string, paymentId: string) {
  const { supabase, accountId } = await requireOwnerContext();

  await markPaymentFailed(supabase, accountId, paymentId);

  revalidatePath(`/dashboard/jobs/${jobId}`);
}

// Record a cash/check payment collected outside Stripe.
export async function markPaymentPaidManuallyAction(jobId: string, paymentId: string, method: string) {
  const { supabase, accountId } = await requireOwnerContext();
  const safeMethod = (['cash', 'check', 'other'].includes(method) ? method : 'cash');
  const payment = await getPaymentDetails(supabase, accountId, paymentId);
  if (!payment || payment.job_id !== jobId) throw new Error('Payment not found for this job.');

  const settled = await markPaymentPaidManually(supabase, accountId, paymentId);
  if (settled) {
    await createJobFeedEvent(supabase, accountId, jobId, {
      kind: 'payment_paid',
      title: 'Payment received',
      body: `${payment.label ?? 'Payment'} marked paid (${safeMethod}).`,
      visibility: 'client_financial',
      amount: Number(payment.amount),
      sourceTable: 'payments',
      sourceId: paymentId,
      actionUrl: `/pay/${paymentId}`,
    });
  }

  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function retryPaymentAction(paymentId: string) {
  const h = headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('host');
  const origin = `${proto}://${host}`;

  const url = await retryPayment(paymentId, origin);

  return url;
}

export async function retryPaymentTextAction(jobId: string, paymentId: string) {
  const { supabase, accountId } = await requireOwnerContext();
  const payment = await getPaymentDetails(supabase, accountId, paymentId);
  if (!payment || payment.job_id !== jobId) throw new Error('Payment not found for this job.');
  const result = await retryFailedPaymentSmsEvent(paymentId, 'payment_requested');
  if (result.status === 'failed') throw new Error(result.error);
  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function cancelPaymentRequestAction(jobId: string, paymentId: string) {
  const { supabase, accountId } = await requireOwnerContext();
  const payment = await getPaymentDetails(supabase, accountId, paymentId);
  if (!payment || payment.job_id !== jobId) throw new Error('Payment not found for this job.');

  await cancelPaymentRequest(supabase, accountId, paymentId);

  await supabase
    .from('job_feed')
    .delete()
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .eq('source_table', 'payments')
    .eq('source_id', paymentId);

  await createJobFeedEvent(supabase, accountId, jobId, {
    kind: 'payment_cancelled',
    title: 'Payment request cancelled',
    body: payment.label ?? null,
    visibility: 'client_financial',
    amount: Number(payment.amount),
  });

  revalidatePath(`/dashboard/jobs/${jobId}`);
}

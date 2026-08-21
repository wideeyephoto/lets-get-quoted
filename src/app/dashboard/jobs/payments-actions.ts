'use server';

import { revalidatePath } from 'next/cache';
import { parsePaymentAmount, paymentAmountError } from '@/lib/money-input';
import { headers } from 'next/headers';
import { requireOwnerContext } from '@/lib/auth';
import { loadBusinessName } from '@/lib/business-name';
import { getJob } from '@/lib/jobs';
import {
  cancelPaymentRequest,
  createDepositRequest,
  getPaymentDetails,
  isLegacyDestinationPayment,
  LEGACY_DESTINATION_PAYMENT_RAIL_ERROR,
  listPayments,
  refundPayment,
  markPaymentFailed,
  markPaymentPaidManually,
  retryPayment,
  type PaymentKind,
} from '@/lib/payments';
import { formatMoneyExact } from '@/lib/jobs';
import { jobMoney, overageForNewRequest } from '@/lib/job-lifecycle';
import { listChangeOrders } from '@/lib/change-orders-data';
import { changeOrderTotals } from '@/lib/change-orders';
import { addInvoiceItem, createInvoice, listInvoices, selectPrimaryInvoice } from '@/lib/invoices';
import { createPaymentFeedEvent, createJobFeedEvent } from '@/lib/job-feed';
import { normalizeUsPhone } from '@/lib/phone';
import { wantsConfirmation } from '@/lib/confirmation-prefs';
import { sendPaymentRequestedConfirmationEmail } from '@/lib/email';
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

  // Number() here was the defect: NaN <= 0 is false, so every unreadable amount
  // passed the guard in createDepositRequest and reached a NOT NULL numeric
  // column as null. See money-input.ts.
  const parsedAmount = parsePaymentAmount(formData.get('amount'));
  if (!parsedAmount.ok) throw new Error(paymentAmountError(parsedAmount.reason));
  const amount = parsedAmount.amount;
  const label = (formData.get('label') ?? '').toString().trim() || 'Deposit';
  const kind = (formData.get('kind') as PaymentKind) || 'deposit';
  const invoice = await ensureJobInvoice(supabase, accountId, jobId);
  const sendSms = formData.get('sendSms') === 'on';
  const phoneInput = (formData.get('homeownerPhone') ?? '').toString();
  const homeownerPhone = phoneInput ? normalizeUsPhone(phoneInput) : null;
  if (sendSms && !homeownerPhone) {
    throw new Error('Enter a valid homeowner mobile number before sending a text.');
  }

  /* THE GUARDRAIL. A $99.94 job carried two $250 deposit requests, and nothing
     anywhere compared what had been asked for against what had been agreed.
     Not a refusal: collecting more than the quote is legitimate — a change
     agreed on site, a price that moved — so this states the overage in figures
     and lets it through once somebody has said yes to that sentence. Change
     orders count toward the approved total, which is the honest way to raise it. */
  if (formData.get('confirmOverage') !== 'on') {
    const [existingPayments, orders, jobRow] = await Promise.all([
      listPayments(supabase, accountId, jobId),
      listChangeOrders(supabase, accountId, jobId),
      getJob(supabase, accountId, jobId),
    ]);
    const money = jobMoney({
      quotedAmount: Number(jobRow?.quoted_amount) || 0,
      approvedChangeOrderTotal: changeOrderTotals(orders).approved,
      payments: existingPayments,
    });
    const overage = overageForNewRequest(money, Math.round((Number(amount) || 0) * 100));
    if (overage > 0) {
      throw new Error(
        `This would ask ${formatMoneyExact(overage / 100)} more than the job is approved for ` +
          `(approved ${formatMoneyExact(money.approvedCents / 100)}, already asked for ` +
          `${formatMoneyExact((money.paidCents + money.requestedCents) / 100)}). ` +
          'Raise a change order so the customer approves the difference, or tick "collect more than the approved total" to send it anyway.',
      );
    }
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

  // Receipt to the contractor. Never allowed to fail the request itself.
  try {
    if (await wantsConfirmation(supabase, accountId, 'payment_confirmation_email')) {
      const [{ data: { user } }, businessName] = await Promise.all([
        supabase.auth.getUser(),
        loadBusinessName(supabase, accountId, 'Your business'),
      ]);
      if (user?.email) {
        const origin = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');
        const job = await getJob(supabase, accountId, jobId);
        await sendPaymentRequestedConfirmationEmail({
          accountId,
          recipientEmail: user.email,
          businessName,
          clientName: job?.client_name || 'your customer',
          label,
          amount,
          channel: sendSms && homeownerPhone ? 'sms' : 'none',
          sentTo: sendSms ? homeownerPhone : null,
          jobUrl: `${origin}/dashboard/jobs/${jobId}`,
        });
      }
    }
  } catch (err) {
    console.error(`Payment confirmation email failed for job ${jobId}:`, err);
  }

  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function refundPaymentAction(jobId: string, paymentId: string, amount?: number) {
  const { supabase, accountId } = await requireOwnerContext();

  await refundPayment(supabase, accountId, paymentId, amount);

  // Log the refund on the job timeline. Deduped on (payments, id, payment_refunded),
  // so the webhook's confirmation of the same refund won't add a second entry.
  await createPaymentFeedEvent(supabase, paymentId, 'payment_refunded');

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
  // This text contains /pay/:id, whose active Checkout implementation is the
  // legacy destination rail. Never resend it for a row already assigned to the
  // direct runtime, even while that runtime is dark.
  if (!isLegacyDestinationPayment(payment)) throw new Error(LEGACY_DESTINATION_PAYMENT_RAIL_ERROR);
  const result = await retryFailedPaymentSmsEvent(paymentId, 'payment_requested');
  if (result.status === 'failed') throw new Error(result.error);
  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function cancelPaymentRequestAction(jobId: string, paymentId: string) {
  const { supabase, accountId } = await requireOwnerContext();
  const payment = await getPaymentDetails(supabase, accountId, paymentId);
  if (!payment || payment.job_id !== jobId) throw new Error('Payment not found for this job.');

  await cancelPaymentRequest(supabase, accountId, paymentId);

  /* THE "SENT" ROW STAYS. It used to be deleted here, alongside a hard delete
     of the payment itself — so a request that had genuinely been made existed
     nowhere afterwards, and a job nobody had billed looked identical to one
     where a $250 deposit had been raised and pulled twice. Sent, then
     cancelled, in order, IS the history. */
  await createJobFeedEvent(supabase, accountId, jobId, {
    kind: 'payment_cancelled',
    title: 'Payment request cancelled',
    body: payment.label ?? null,
    visibility: 'client_financial',
    amount: Number(payment.amount),
  });

  revalidatePath(`/dashboard/jobs/${jobId}`);
}

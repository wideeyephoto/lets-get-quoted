'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { requireOwnerContext } from '@/lib/auth';
import { createDepositRequest, getPaymentDetails, refundPayment, markPaymentFailed, retryPayment, type PaymentKind } from '@/lib/payments';
import { normalizeUsPhone } from '@/lib/phone';
import { recordSmsConsent, retryFailedPaymentSmsEvent, sendPaymentSmsEvent } from '@/lib/sms';

export async function createDepositRequestAction(jobId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const amount = Number(formData.get('amount'));
  const label = (formData.get('label') ?? '').toString().trim() || 'Deposit';
  const kind = (formData.get('kind') as PaymentKind) || 'deposit';
  const invoiceId = (formData.get('invoiceId') ?? '').toString().trim() || undefined;
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
    invoiceId,
    homeownerPhone,
    smsConsent: sendSms,
  });
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

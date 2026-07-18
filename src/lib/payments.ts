import { createAdminClient } from '@/lib/auth';
import { getJob } from '@/lib/jobs';
import { getStripeClient, computeFeeRate, toCents, fromCents } from '@/lib/stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendPaymentSmsEvent } from '@/lib/sms';

export type PaymentKind = 'deposit' | 'stage' | 'final' | 'plan_installment';
export type PaymentStatus = 'requested' | 'processing' | 'paid' | 'failed' | 'refunded';

export type Payment = {
  id: string;
  account_id: string;
  job_id: string;
  invoice_id: string | null;
  kind: PaymentKind;
  label: string | null;
  amount: number;
  status: PaymentStatus;
  platform_fee: number | null;
  fee_rate: number | null;
  stripe_checkout_session: string | null;
  stripe_payment_intent: string | null;
  homeowner_phone: string | null;
  sms_consent: boolean;
  sms_consent_at: string | null;
  requested_at: string;
  paid_at: string | null;
  sms_events?: { event_type: string; status: string; sent_at: string | null }[];
};

// Sum of paid amounts in the trailing 365 days — the basis for the fee bracket.
// Uses the admin client since this is a trusted server-side calculation, not a
// user-scoped read.
export async function getTrailingVolume(accountId: string): Promise<number> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from('payments')
    .select('amount')
    .eq('account_id', accountId)
    .eq('status', 'paid')
    .gte('paid_at', since);

  if (error) {
    throw error;
  }

  return (data ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
}

// Quote the fee rate/amount that would apply if this payment were completed
// right now — lets the public pay page show fee transparency BEFORE checkout
// starts (previously the fee only appeared once a Checkout Session existed and
// persisted fee_rate/platform_fee onto the row). Once checkout actually starts,
// the persisted values are the source of truth (the locked-in rate for that
// specific Stripe session), so callers should prefer those when present and
// only fall back to this quote.
export async function getQuotedFee(accountId: string, amount: number): Promise<{ feeRate: number; platformFee: number }> {
  const trailingVolume = await getTrailingVolume(accountId);
  const feeRate = computeFeeRate(trailingVolume);
  const platformFee = fromCents(Math.round(toCents(amount) * feeRate));
  return { feeRate, platformFee };
}

export async function listPayments(supabase: SupabaseClient, accountId: string, jobId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*, sms_events(event_type, status, sent_at)')
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .order('requested_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as Payment[];
}

export async function createDepositRequest(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  input: { label: string; amount: number; kind: PaymentKind; invoiceId?: string; homeownerPhone?: string | null; smsConsent?: boolean }
): Promise<Payment> {
  // Same ownership check used for costs — RLS only checks payments.account_id,
  // not that job_id truly belongs to this account.
  const job = await getJob(supabase, accountId, jobId);
  if (!job) {
    throw new Error('Job not found for this account.');
  }

  if (input.amount <= 0) {
    throw new Error('Payment amount must be greater than 0.');
  }

  const { data, error } = await supabase
    .from('payments')
    .insert({
      account_id: accountId,
      job_id: jobId,
      invoice_id: input.invoiceId ?? null,
      kind: input.kind,
      label: input.label,
      amount: input.amount,
      status: 'requested',
      homeowner_phone: input.homeownerPhone ?? null,
      sms_consent: input.smsConsent ?? false,
      sms_consent_at: input.smsConsent ? new Date().toISOString() : null,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw error ?? new Error('Unable to create payment request');
  }

  return data as Payment;
}

type PublicPaymentRecord = Payment & {
  job: { client_name: string; ref: string } | null;
  account: { business_name: string; stripe_connect_id: string | null; connect_onboarded: boolean } | null;
};

// Public read — no user session exists (the homeowner is not a system user),
// so this always uses the admin client and returns only what the public pay
// page needs to render.
export async function getPublicPayment(paymentId: string): Promise<PublicPaymentRecord | null> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('payments')
    .select('*, job:jobs(client_name, ref), account:accounts(business_name, stripe_connect_id, connect_onboarded)')
    .eq('id', paymentId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as unknown as PublicPaymentRecord;
}

export async function createCheckoutSessionForPayment(paymentId: string, origin: string): Promise<string> {
  const payment = await getPublicPayment(paymentId);

  if (!payment) {
    throw new Error('Payment not found.');
  }

  // "processing" means a checkout session was started but not necessarily
  // completed (e.g. the homeowner abandoned it) — allow retrying with a fresh
  // session. Only "paid"/"refunded" are truly terminal.
  if (payment.status !== 'requested' && payment.status !== 'processing' && payment.status !== 'failed') {
    throw new Error('This payment request is no longer available.');
  }

  if (!payment.account?.stripe_connect_id || !payment.account.connect_onboarded) {
    throw new Error('This contractor has not finished setting up payments yet.');
  }

  const stripe = getStripeClient();
  const admin = createAdminClient();

  // If a checkout session already exists for this payment, check it before
  // creating a new one. Blindly creating a fresh session every time this is
  // called (e.g. a double-click, a page reload, a browser form resubmission)
  // overwrites `stripe_checkout_session`, permanently losing track of a
  // session that may have actually succeeded. Reuse an still-open session,
  // and self-heal if Stripe already shows it as paid (covers the case where
  // a webhook was missed).
  if (payment.stripe_checkout_session) {
    const existing = await stripe.checkout.sessions.retrieve(payment.stripe_checkout_session);

    if (existing.payment_status === 'paid') {
      await admin
        .from('payments')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          stripe_payment_intent:
            typeof existing.payment_intent === 'string' ? existing.payment_intent : existing.payment_intent?.id,
        })
        .eq('id', paymentId);
      throw new Error('This payment has already been completed.');
    }

    if (existing.status === 'open' && existing.url) {
      return existing.url;
    }
  }

  const trailingVolume = await getTrailingVolume(payment.account_id);
  const feeRate = computeFeeRate(trailingVolume);
  const platformFee = fromCents(Math.round(toCents(payment.amount) * feeRate));

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: payment.label || `${payment.kind} payment`,
            description: payment.job ? `Job ${payment.job.ref} — ${payment.job.client_name}` : undefined,
          },
          unit_amount: toCents(payment.amount),
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      application_fee_amount: toCents(platformFee),
      transfer_data: { destination: payment.account.stripe_connect_id },
    },
    metadata: { payment_id: payment.id },
    success_url: `${origin}/pay/${payment.id}?status=success`,
    cancel_url: `${origin}/pay/${payment.id}?status=cancelled`,
  });

  const { error } = await admin
    .from('payments')
    .update({
      status: 'processing',
      stripe_checkout_session: session.id,
      platform_fee: platformFee,
      fee_rate: feeRate,
    })
    .eq('id', paymentId);

  if (error) {
    throw error;
  }

  if (!session.url) {
    throw new Error('Stripe did not return a checkout URL.');
  }

  return session.url;
}

// Fetch a payment with full details for display (contractor dashboard)
export async function getPaymentDetails(supabase: SupabaseClient, accountId: string, paymentId: string) {
  const { data, error } = await supabase
    .from('payments')
    .select(
      `*,
       invoice:invoices(id, ref, status, total),
       job:jobs(id, ref, client_name)`
    )
    .eq('account_id', accountId)
    .eq('id', paymentId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

// Refund a paid payment via Stripe and mark as refunded in DB
export async function refundPayment(supabase: SupabaseClient, accountId: string, paymentId: string): Promise<void> {
  const payment = await getPaymentDetails(supabase, accountId, paymentId);

  if (!payment) {
    throw new Error('Payment not found for this account.');
  }

  if (payment.status !== 'paid') {
    throw new Error('Only paid payments can be refunded.');
  }

  if (!payment.stripe_payment_intent) {
    throw new Error('No Stripe payment intent found for this payment.');
  }

  const stripe = getStripeClient();

  try {
    // Stripe will emit a charge.refunded webhook event automatically
    const refund = await stripe.refunds.create({
      payment_intent: payment.stripe_payment_intent,
      metadata: {
        payment_id: paymentId,
        reason: 'Refunded by contractor',
      },
    });

    console.log(`Refund created: ${refund.id} for payment ${paymentId}`);

    // Mark the payment as refunded (webhook will confirm, but do it immediately too)
    const { error } = await supabase.from('payments').update({ status: 'refunded' }).eq('id', paymentId);

    if (error) {
      throw error;
    }

    // If there's a linked invoice, mark it as void
    if (payment.invoice?.id) {
      await supabase.from('invoices').update({ status: 'void' }).eq('id', payment.invoice.id);
    }

    await sendPaymentSmsEvent(paymentId, 'payment_refunded');
  } catch (err) {
    console.error('Refund failed:', err);
    throw new Error(err instanceof Error ? err.message : 'Refund failed');
  }
}

// Mark a payment as failed (e.g., for reconciliation/admin override)
export async function markPaymentFailed(supabase: SupabaseClient, accountId: string, paymentId: string): Promise<void> {
  const { data, error } = await supabase
    .from('payments')
    .update({ status: 'failed' })
    .eq('account_id', accountId)
    .eq('id', paymentId)
    .eq('status', 'processing')
    .select('id')
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) await sendPaymentSmsEvent(paymentId, 'payment_failed');
}

// Retry a failed/processing payment by creating a fresh checkout session
export async function retryPayment(paymentId: string, origin: string): Promise<string> {
  const payment = await getPublicPayment(paymentId);

  if (!payment) {
    throw new Error('Payment not found.');
  }

  if (payment.status === 'paid' || payment.status === 'refunded') {
    throw new Error('This payment is already settled.');
  }

  // Reuse existing session logic (it handles all retry cases)
  return createCheckoutSessionForPayment(paymentId, origin);
}

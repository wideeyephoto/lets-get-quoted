import { createAdminClient } from '@/lib/auth';
import { getJob } from '@/lib/jobs';
import { getStripeClient, computeFeeRate, computePlatformFee, computePlatformFeeCents, toCents, fromCents } from '@/lib/stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendPaymentSmsEvent } from '@/lib/sms';

export type PaymentKind = 'deposit' | 'stage' | 'final' | 'plan_installment';
export type PaymentStatus = 'requested' | 'processing' | 'paid' | 'failed' | 'refunded' | 'disputed';

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
  refunded_amount: number;
  disputed_at: string | null;
  dispute_reason: string | null;
  dispute_status: string | null;
  // Payment-plan linkage (deposit / installments / payoff). Absent on one-offs.
  payment_plan_id?: string | null;
  due_date?: string | null;
  installment_seq?: number | null;
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
  const platformFee = computePlatformFee(amount, feeRate);
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
  display_business_name: string;
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

  const payment = data as unknown as Omit<PublicPaymentRecord, 'display_business_name'>;
  const { data: site } = await admin
    .from('sites')
    .select('company_name')
    .eq('account_id', payment.account_id)
    .maybeSingle();

  return {
    ...payment,
    display_business_name: site?.company_name || payment.account?.business_name || 'My Business',
  };
}

// Get-or-create the platform Stripe customer for a payment plan (kept here, not
// in payment-plans.ts, to avoid a circular import). The customer lives on the
// platform account; installments later transfer to the connected account via
// destination charges, exactly like the recurring path.
async function ensurePlanDepositCustomer(planId: string, accountId: string, clientName: string | null): Promise<string> {
  const admin = createAdminClient();
  const { data: plan } = await admin.from('payment_plans').select('stripe_customer_id').eq('id', planId).maybeSingle();
  if (plan?.stripe_customer_id) return plan.stripe_customer_id as string;

  const stripe = getStripeClient();
  const customer = await stripe.customers.create({
    name: clientName || undefined,
    metadata: { account_id: accountId, payment_plan_id: planId },
  });
  await admin
    .from('payment_plans')
    .update({ stripe_customer_id: customer.id, updated_at: new Date().toISOString() })
    .eq('id', planId);
  return customer.id;
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
  const platformFee = computePlatformFee(payment.amount, feeRate);

  // A payment-plan DEPOSIT must also SAVE the card for the later off-session
  // installment charges. Attach a platform customer and set setup_future_usage
  // so Stripe stores the mandate at deposit time; the deposit's confirmed
  // payment then activates the plan (reading the saved card off the intent).
  const isPlanDeposit = Boolean(payment.payment_plan_id) && payment.kind === 'deposit';
  const planCustomerId = isPlanDeposit
    ? await ensurePlanDepositCustomer(payment.payment_plan_id as string, payment.account_id, payment.job?.client_name ?? null)
    : undefined;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    ...(planCustomerId ? { customer: planCustomerId } : {}),
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
      // Bill the exact fee cents (not a dollar round-trip) — same value, no drift.
      application_fee_amount: computePlatformFeeCents(payment.amount, feeRate),
      transfer_data: { destination: payment.account.stripe_connect_id },
      ...(isPlanDeposit ? { setup_future_usage: 'off_session' as const } : {}),
    },
    metadata: {
      payment_id: payment.id,
      ...(payment.payment_plan_id ? { payment_plan_id: payment.payment_plan_id } : {}),
    },
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

// Refund a paid Stripe payment — the full remaining balance when `amountDollars`
// is omitted, or a partial slice. Partial refunds accumulate in `refunded_amount`;
// the payment stays `paid` (and refundable down to zero) until the whole charge
// has been returned, at which point it flips to `refunded` and voids any linked
// invoice. Returns what actually happened so callers can label the activity feed.
export async function refundPayment(
  supabase: SupabaseClient,
  accountId: string,
  paymentId: string,
  amountDollars?: number,
): Promise<{ amount: number; isFull: boolean; refundedTotal: number }> {
  const payment = await getPaymentDetails(supabase, accountId, paymentId);

  if (!payment) {
    throw new Error('Payment not found for this account.');
  }

  // A partially-refunded payment is still `paid`, so this also covers "refund a
  // bit more of an already partially-refunded payment".
  if (payment.status !== 'paid') {
    throw new Error('Only paid payments can be refunded.');
  }

  if (!payment.stripe_payment_intent) {
    throw new Error('No Stripe payment intent found for this payment.');
  }

  // Work in integer cents throughout so partial amounts never drift.
  const totalCents = toCents(Number(payment.amount));
  const alreadyCents = toCents(Number(payment.refunded_amount) || 0);
  const remainingCents = totalCents - alreadyCents;
  if (remainingCents <= 0) {
    throw new Error('This payment has already been fully refunded.');
  }

  // Default to the full remaining balance; otherwise validate the requested slice.
  const requestedCents = amountDollars == null ? remainingCents : toCents(amountDollars);
  if (!Number.isFinite(requestedCents) || requestedCents <= 0) {
    throw new Error('Enter a refund amount greater than zero.');
  }
  if (requestedCents > remainingCents) {
    throw new Error(`You can refund at most ${formatMoneyCents(remainingCents)} on this payment.`);
  }
  const isFull = requestedCents >= remainingCents;

  const stripe = getStripeClient();

  try {
    // Stripe emits a charge.refunded webhook automatically; that handler reconciles
    // the same numbers idempotently. Omitting `amount` refunds the full remaining
    // balance; a partial refund sends the exact cents.
    const refund = await stripe.refunds.create({
      payment_intent: payment.stripe_payment_intent,
      ...(isFull ? {} : { amount: requestedCents }),
      metadata: {
        payment_id: paymentId,
        reason: 'Refunded by contractor',
      },
    });

    console.log(`Refund created: ${refund.id} for payment ${paymentId} (${isFull ? 'full' : 'partial'} ${formatMoneyCents(requestedCents)})`);

    const refundedTotal = fromCents(alreadyCents + requestedCents);

    // Reflect it immediately (the webhook will confirm the same value later).
    const { error } = await supabase
      .from('payments')
      .update({ refunded_amount: refundedTotal, status: isFull ? 'refunded' : 'paid' })
      .eq('id', paymentId);

    if (error) {
      throw error;
    }

    // Only a FULL refund voids the linked invoice — a partial refund leaves it standing.
    if (isFull && payment.invoice?.id) {
      await supabase.from('invoices').update({ status: 'void' }).eq('id', payment.invoice.id);
    }

    // The homeowner refund text states the full payment amount, so only send it on
    // a full refund. Partial refunds are recorded on the job timeline for the
    // contractor but don't fire a (potentially misleading) "fully refunded" text.
    if (isFull) {
      await sendPaymentSmsEvent(paymentId, 'payment_refunded');
    }

    return { amount: fromCents(requestedCents), isFull, refundedTotal };
  } catch (err) {
    console.error('Refund failed:', err);
    throw new Error(err instanceof Error ? err.message : 'Refund failed');
  }
}

function formatMoneyCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

// Settle a payment request that was paid OUTSIDE Stripe (cash/check). Mirrors
// the webhook's settle-and-reconcile, but session-scoped and without a Stripe
// intent, so these rows stay identifiable as manual (stripe_payment_intent is
// null → the Refund button, which needs a Stripe intent, is hidden). Returns
// whether it actually transitioned, so the caller only posts the feed event on
// a real settle. Idempotent: only a still-open request/failed row transitions,
// never an already-paid/processing one (avoids racing a real Stripe completion).
export async function markPaymentPaidManually(
  supabase: SupabaseClient,
  accountId: string,
  paymentId: string
): Promise<boolean> {
  const payment = await getPaymentDetails(supabase, accountId, paymentId);
  if (!payment) throw new Error('Payment not found for this account.');

  const { data: settled, error } = await supabase
    .from('payments')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', paymentId)
    .in('status', ['requested', 'failed'])
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!settled) return false;

  // Reconcile the linked invoice — flip it to paid ONLY when fully collected,
  // so a partial cash deposit never marks the whole invoice paid (unlike the
  // Stripe webhook, which over-marks on any payment).
  if (payment.invoice?.id) {
    const invoiceId = payment.invoice.id as string;
    const invoiceTotal = Number(payment.invoice.total);
    const invoiceStatus = payment.invoice.status as string;
    const jobPayments = await listPayments(supabase, accountId, payment.job_id as string);
    const paidTotal = jobPayments
      .filter((row) => row.invoice_id === invoiceId && row.status === 'paid')
      .reduce((sum, row) => sum + Number(row.amount), 0);
    if (invoiceStatus !== 'paid' && paidTotal >= invoiceTotal) {
      await supabase.from('invoices').update({ status: 'paid' }).eq('id', invoiceId);
    }
  }

  return true;
}

// Cancel a payment request that hasn't been acted on yet (no Stripe checkout
// session ever started). Deletes the row outright since no money changed
// hands — this is for "I asked for the wrong amount/link by mistake" cases,
// distinct from markPaymentFailed (which is for requests that DID reach
// Stripe checkout but didn't complete).
export async function cancelPaymentRequest(supabase: SupabaseClient, accountId: string, paymentId: string): Promise<void> {
  const { data, error } = await supabase
    .from('payments')
    .delete()
    .eq('account_id', accountId)
    .eq('id', paymentId)
    .eq('status', 'requested')
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Only payment requests that have not started processing can be cancelled.');
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

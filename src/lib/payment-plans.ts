import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { getStripeClient, toCents, fromCents, canCreateConnectCharge, CONNECT_CHARGE_COLUMNS } from '@/lib/stripe';
import { getQuotedFee, createDepositRequest } from '@/lib/payments';
import { createJobFeedEvent, createPaymentFeedEvent } from '@/lib/job-feed';
import { sendPaymentSmsEvent } from '@/lib/sms';
import { buildPlanSchedule, planSchedulePreview, type PlanFrequency } from '@/lib/payment-plan-math';

// Re-export the pure math so existing importers of these from payment-plans keep
// working (the canonical definitions live in payment-plan-math).
export { allocateInstallments, buildPlanSchedule, planBalanceCents, planSchedulePreview, DEFAULT_PLAN, type PlanFrequency } from '@/lib/payment-plan-math';

// ---------------------------------------------------------------------------
// Payment Plan — split an EXISTING quote total into a deposit + fixed,
// 0%-interest installments. Not lending/financing: no interest, no fees, no
// credit check, no contractor advance. The plan only ALLOCATES the quote total;
// it never increases it. It reuses the one-off payment rails end to end — each
// installment is a `payments` row (kind='plan_installment') charged off-session
// against the card saved when the deposit was collected, as a Stripe Connect
// destination charge with the platform application fee, exactly like a recurring
// visit. "Paid" is only ever set by a verified webhook.
// ---------------------------------------------------------------------------

export type PaymentPlanStatus = 'pending_deposit' | 'active' | 'paid_off' | 'canceled';

export type PaymentPlan = {
  id: string;
  account_id: string;
  job_id: string;
  total_cents: number;
  deposit_cents: number;
  installment_count: number;
  frequency: PlanFrequency;
  first_installment_date: string;
  status: PaymentPlanStatus;
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
  card_brand: string | null;
  card_last4: string | null;
  authorized_at: string | null;
  authorized_name: string | null;
  payoff_locked_at: string | null;
  deposit_payment_id: string | null;
  /**
   * Whether the homeowner may settle the whole total instead of starting the
   * plan. A plan is an offer, not a requirement — see the migration.
   *
   * Only gates the choice BEFORE the plan starts. Paying off an ACTIVE plan
   * early is a separate promise, made to the client in writing on the
   * authorization form, and this flag must never be read as withdrawing it.
   */
  allow_pay_in_full: boolean;
  created_at: string;
  updated_at: string;
};

// Give up auto-charging an installment after this many lifetime attempts; it
// stays `failed` (still collectible via the client's Pay link) instead of being
// retried forever.
const MAX_INSTALLMENT_ATTEMPTS = 4;
const MAX_INSTALLMENTS_PER_RUN = 300;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getPaymentPlanForJob(
  db: SupabaseClient | ReturnType<typeof createAdminClient>,
  accountId: string,
  jobId: string,
): Promise<PaymentPlan | null> {
  const { data, error } = await db
    .from('payment_plans')
    .select('*')
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null; // un-migrated DB → no plan, never 500 the page
  return (data as PaymentPlan) ?? null;
}

// ---------------------------------------------------------------------------
// Create — called when the contractor sends a quote with Payment Plan terms.
// Creates the plan header (pending_deposit) and the deposit payment request; the
// deposit is a normal Stripe Connect payment (so scheduling can gate on it), and
// paying it saves the card that later drives the installments.
// ---------------------------------------------------------------------------

export type CreatePaymentPlanInput = {
  totalCents: number;
  depositPercent: number;
  installmentCount: number;
  frequency: PlanFrequency;
  firstInstallmentDate: string;
  clientPhone: string | null;
  smsConsent: boolean;
  invoiceId?: string | null;
  /** Defaults to true — see PaymentPlan.allow_pay_in_full. */
  allowPayInFull?: boolean;
};

export async function createPaymentPlan(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  input: CreatePaymentPlanInput,
): Promise<{ plan: PaymentPlan; depositPaymentId: string }> {
  const { depositCents } = buildPlanSchedule(input.totalCents, input.depositPercent, input.installmentCount);

  const { data: planRow, error: planError } = await supabase
    .from('payment_plans')
    .insert({
      account_id: accountId,
      job_id: jobId,
      total_cents: input.totalCents,
      deposit_cents: depositCents,
      installment_count: input.installmentCount,
      frequency: input.frequency,
      first_installment_date: input.firstInstallmentDate,
      status: 'pending_deposit',
      allow_pay_in_full: input.allowPayInFull !== false,
    })
    .select('*')
    .single();
  if (planError || !planRow) throw planError ?? new Error('Could not create the payment plan.');
  const plan = planRow as PaymentPlan;

  const deposit = await createDepositRequest(supabase, accountId, jobId, {
    label: `Deposit — payment plan (${input.installmentCount} installment${input.installmentCount === 1 ? '' : 's'} to follow)`,
    amount: fromCents(depositCents),
    kind: 'deposit',
    invoiceId: input.invoiceId ?? undefined,
    homeownerPhone: input.clientPhone,
    smsConsent: input.smsConsent,
  });

  // Cross-link the deposit and its plan so the webhook can activate the schedule
  // the moment the deposit is confirmed paid.
  await supabase.from('payments').update({ payment_plan_id: plan.id }).eq('id', deposit.id);
  await supabase.from('payment_plans').update({ deposit_payment_id: deposit.id }).eq('id', plan.id);

  return { plan, depositPaymentId: deposit.id };
}

// The client's typed-name authorization to charge the saved card for the
// scheduled installments (captured before they pay the deposit).
export async function authorizePaymentPlan(
  db: SupabaseClient | ReturnType<typeof createAdminClient>,
  planId: string,
  signerName: string,
): Promise<void> {
  const name = signerName.trim();
  if (!name) throw new Error('Type your full name to authorize the plan.');
  await db
    .from('payment_plans')
    .update({ authorized_name: name, authorized_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', planId)
    .eq('status', 'pending_deposit');
}

// Client-initiated: the homeowner types their name to authorize automatic
// installment charges, then is routed to pay the deposit. Token-guarded. Returns
// the deposit /pay URL. Idempotent — re-authorizing an already-active plan just
// returns them to their dashboard.
export async function authorizePlanAndGetDepositUrl(
  clientToken: string,
  planId: string,
  signerName: string,
): Promise<{ redirectUrl: string }> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: access } = await admin
    .from('client_job_access')
    .select('account_id, job_id, expires_at, revoked_at')
    .eq('token_hash', hashToken(clientToken))
    .maybeSingle();
  if (!access || access.revoked_at || (access.expires_at && access.expires_at < now)) {
    throw new Error('This job link is no longer available.');
  }

  const { data: planRow } = await admin
    .from('payment_plans')
    .select('*')
    .eq('id', planId)
    .eq('account_id', access.account_id)
    .eq('job_id', access.job_id)
    .maybeSingle();
  const plan = planRow as PaymentPlan | null;
  if (!plan) throw new Error('Plan not found.');
  if (plan.status !== 'pending_deposit') return { redirectUrl: `/client/jobs/${clientToken}` };

  await authorizePaymentPlan(admin, plan.id, signerName);
  return { redirectUrl: plan.deposit_payment_id ? `/pay/${plan.deposit_payment_id}` : `/client/jobs/${clientToken}` };
}

// ---------------------------------------------------------------------------
// Activation — runs from the webhook once the deposit is webhook-confirmed paid.
// Idempotent: the pending_deposit → active compare-and-set means only the first
// delivery schedules the installments, so a redelivery can never double-insert.
// ---------------------------------------------------------------------------

async function activatePlanForPaidDeposit(admin: ReturnType<typeof createAdminClient>, paymentId: string): Promise<void> {
  const { data: payment } = await admin
    .from('payments')
    .select('id, kind, status, payment_plan_id, homeowner_phone, sms_consent, sms_consent_at, stripe_payment_intent')
    .eq('id', paymentId)
    .maybeSingle();
  if (!payment || payment.kind !== 'deposit' || !payment.payment_plan_id || payment.status !== 'paid') return;

  const { data: planRow } = await admin.from('payment_plans').select('*').eq('id', payment.payment_plan_id).maybeSingle();
  const plan = planRow as PaymentPlan | null;
  if (!plan || plan.status !== 'pending_deposit') return;

  // Read the saved card off the deposit's PaymentIntent (setup_future_usage
  // stored it). Best-effort — if this read fails, the plan still activates and
  // the owner can request the card later; installments will skip until present.
  let pmId = plan.stripe_payment_method_id;
  let customerId = plan.stripe_customer_id;
  let brand = plan.card_brand;
  let last4 = plan.card_last4;
  if (payment.stripe_payment_intent) {
    try {
      const stripe = getStripeClient();
      const intent = await stripe.paymentIntents.retrieve(payment.stripe_payment_intent, { expand: ['payment_method'] });
      const pm = intent.payment_method;
      if (pm && typeof pm === 'object') {
        pmId = pm.id;
        brand = pm.card?.brand ?? brand;
        last4 = pm.card?.last4 ?? last4;
      } else if (typeof pm === 'string') {
        pmId = pm;
      }
      if (typeof intent.customer === 'string') customerId = intent.customer;
    } catch (error) {
      console.error(`Payment plan ${plan.id}: could not read saved card:`, error instanceof Error ? error.message : error);
    }
  }

  const { data: claimed } = await admin
    .from('payment_plans')
    .update({
      status: 'active',
      stripe_payment_method_id: pmId,
      stripe_customer_id: customerId,
      card_brand: brand,
      card_last4: last4,
      updated_at: new Date().toISOString(),
    })
    .eq('id', plan.id)
    .eq('status', 'pending_deposit')
    .select('id')
    .maybeSingle();
  if (!claimed) return; // another delivery already activated + scheduled

  const schedule = planSchedulePreview(plan);
  const rows = schedule.map((entry) => ({
    account_id: plan.account_id,
    job_id: plan.job_id,
    payment_plan_id: plan.id,
    kind: 'plan_installment' as const,
    label: `Installment ${entry.seq} of ${schedule.length} — ${entry.label}`,
    amount: fromCents(entry.amountCents),
    status: 'requested' as const,
    due_date: entry.dueDate,
    installment_seq: entry.seq,
    homeowner_phone: payment.homeowner_phone,
    sms_consent: payment.sms_consent,
    sms_consent_at: payment.sms_consent_at,
  }));
  if (rows.length) await admin.from('payments').insert(rows);

  await createJobFeedEvent(admin, plan.account_id, plan.job_id, {
    kind: 'payment_plan_active',
    title: 'Payment plan started',
    body: `Deposit received. ${schedule.length} installment${schedule.length === 1 ? '' : 's'} scheduled, first on ${schedule[0]?.label ?? 'the agreed date'}.`,
    visibility: 'client_financial',
  });
}

// ---------------------------------------------------------------------------
// Off-session installment charge — mirrors the recurring visit charge, but
// against a pre-existing installment row (no job/invoice creation). The status
// compare-and-set claim is the duplicate-charge guard: only the run that flips
// requested/failed → processing issues the PaymentIntent.
// ---------------------------------------------------------------------------

type InstallmentRow = {
  id: string;
  amount: number;
  label: string | null;
  installment_seq: number | null;
  charge_attempts: number | null;
  homeowner_phone: string | null;
  sms_consent: boolean | null;
};

async function chargePlanInstallment(
  admin: ReturnType<typeof createAdminClient>,
  plan: PaymentPlan,
  payment: InstallmentRow,
): Promise<'paid' | 'failed' | 'skipped'> {
  if (plan.status !== 'active' || plan.payoff_locked_at) return 'skipped';
  if (!plan.stripe_payment_method_id || !plan.stripe_customer_id || Number(payment.amount) <= 0) return 'skipped';

  const { data: account } = await admin
    .from('accounts')
    .select(CONNECT_CHARGE_COLUMNS)
    .eq('id', plan.account_id)
    .maybeSingle();
  if (!canCreateConnectCharge(account)) return 'skipped';

  // CLAIM: only one run may take this installment from requested/failed →
  // processing. A concurrent run (or a re-entry) sees 0 rows and bails, so the
  // charge is issued exactly once even before Stripe's idempotency key applies.
  const attemptSeq = (payment.charge_attempts ?? 0) + 1;
  const { data: claimed } = await admin
    .from('payments')
    .update({ status: 'processing', charge_attempts: attemptSeq })
    .eq('id', payment.id)
    .in('status', ['requested', 'failed'])
    .select('id')
    .maybeSingle();
  if (!claimed) return 'skipped';

  const amount = Number(payment.amount);
  const { feeRate, platformFee } = await getQuotedFee(plan.account_id, amount);
  await admin.from('payments').update({ platform_fee: platformFee, fee_rate: feeRate }).eq('id', payment.id);

  const label = payment.label ?? `Installment ${payment.installment_seq ?? ''}`.trim();
  const stripe = getStripeClient();
  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount: toCents(amount),
        currency: 'usd',
        customer: plan.stripe_customer_id,
        payment_method: plan.stripe_payment_method_id,
        off_session: true,
        confirm: true,
        application_fee_amount: toCents(platformFee),
        transfer_data: { destination: account.stripe_connect_id },
        description: label,
        metadata: { payment_id: payment.id, payment_plan_id: plan.id },
      },
      // Stable within an attempt (crash-safe re-run returns Stripe's cached
      // result), unique across attempts (a real retry re-hits the card).
      { idempotencyKey: `plan_${plan.id}_inst_${payment.installment_seq}_${attemptSeq}` },
    );

    await admin.from('payments').update({ stripe_payment_intent: intent.id }).eq('id', payment.id);

    if (intent.status === 'succeeded') {
      await admin.from('payments').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', payment.id);
      await createPaymentFeedEvent(admin, payment.id, 'payment_paid');
      if (payment.sms_consent) await sendPaymentSmsEvent(payment.id, 'payment_paid');
      await reconcilePlanIfComplete(admin, plan.id);
      return 'paid';
    }

    if (intent.status === 'processing' || intent.status === 'requires_capture') {
      // Settling async — leave 'processing' for payment_intent.succeeded to
      // reconcile. Never mark failed (that would wrongly dun a settling charge).
      return 'skipped';
    }

    // requires_action / requires_payment_method — needs the customer present.
    await recordInstallmentFailure(admin, payment, intent.last_payment_error?.code ?? 'authentication_required', intent.last_payment_error?.message ?? null);
    return 'failed';
  } catch (error) {
    const err = error as { code?: string; message?: string; raw?: { code?: string; message?: string } };
    await recordInstallmentFailure(admin, payment, err.code ?? err.raw?.code ?? 'charge_failed', err.message ?? err.raw?.message ?? null);
    console.error(`Payment plan ${plan.id} installment charge failed:`, error instanceof Error ? error.message : error);
    return 'failed';
  }
}

async function recordInstallmentFailure(
  admin: ReturnType<typeof createAdminClient>,
  payment: InstallmentRow,
  code: string,
  message: string | null,
): Promise<void> {
  await admin
    .from('payments')
    .update({ status: 'failed', failure_code: code, failure_message: message, failed_at: new Date().toISOString() })
    .eq('id', payment.id)
    .eq('status', 'processing');
  await createPaymentFeedEvent(admin, payment.id, 'payment_failed');
  if (payment.sms_consent) await sendPaymentSmsEvent(payment.id, 'payment_failed');
}

// If every cent of the total has been collected, close the plan. Idempotent via
// the active → paid_off compare-and-set.
async function reconcilePlanIfComplete(admin: ReturnType<typeof createAdminClient>, planId: string): Promise<void> {
  const { data: planRow } = await admin.from('payment_plans').select('*').eq('id', planId).maybeSingle();
  const plan = planRow as PaymentPlan | null;
  if (!plan || plan.status !== 'active') return;

  const { data: paidRows } = await admin.from('payments').select('amount').eq('payment_plan_id', planId).eq('status', 'paid');
  const paidCents = (paidRows ?? []).reduce((sum, row) => sum + toCents(Number(row.amount)), 0);
  if (paidCents < plan.total_cents) return;

  const { data: closed } = await admin
    .from('payment_plans')
    .update({ status: 'paid_off', updated_at: new Date().toISOString() })
    .eq('id', planId)
    .eq('status', 'active')
    .select('id')
    .maybeSingle();
  if (closed) {
    await createJobFeedEvent(admin, plan.account_id, plan.job_id, {
      kind: 'payment_plan_paid_off',
      title: 'Payment plan complete',
      body: 'The final installment was paid — the plan is paid in full.',
      visibility: 'client_financial',
    });
  }
}

// ---------------------------------------------------------------------------
// Cron sweep — charge every installment due today or earlier (and retry due
// failures, up to the attempt cap). Best-effort per row; a locked plan (payoff
// in flight) or a non-active plan is skipped.
// ---------------------------------------------------------------------------

export type PlanRunSummary = { due: number; charged: number; failed: number; skipped: number; reason?: string };

export async function runDuePlanInstallments(): Promise<PlanRunSummary> {
  const admin = createAdminClient();
  const today = todayKey();

  const { data: due, error } = await admin
    .from('payments')
    .select('id, amount, label, installment_seq, charge_attempts, homeowner_phone, sms_consent, payment_plan_id, status')
    .eq('kind', 'plan_installment')
    .not('payment_plan_id', 'is', null)
    .lte('due_date', today)
    .in('status', ['requested', 'failed'])
    .lt('charge_attempts', MAX_INSTALLMENT_ATTEMPTS)
    .order('due_date', { ascending: true })
    .limit(MAX_INSTALLMENTS_PER_RUN);
  if (error) return { due: 0, charged: 0, failed: 0, skipped: 0, reason: 'payment_plans not available' };

  let charged = 0;
  let failed = 0;
  let skipped = 0;
  const planCache = new Map<string, PaymentPlan | null>();

  for (const row of (due ?? []) as Array<InstallmentRow & { payment_plan_id: string }>) {
    try {
      let plan = planCache.get(row.payment_plan_id);
      if (plan === undefined) {
        const { data } = await admin.from('payment_plans').select('*').eq('id', row.payment_plan_id).maybeSingle();
        plan = (data as PaymentPlan) ?? null;
        planCache.set(row.payment_plan_id, plan);
      }
      if (!plan || plan.status !== 'active' || plan.payoff_locked_at) {
        skipped++;
        continue;
      }
      const outcome = await chargePlanInstallment(admin, plan, row);
      if (outcome === 'paid') charged++;
      else if (outcome === 'failed') failed++;
      else skipped++;
    } catch (error) {
      failed++;
      console.error(`Payment plan installment ${row.id} failed to charge:`, error instanceof Error ? error.message : error);
    }
  }

  return { due: (due ?? []).length, charged, failed, skipped };
}

// ---------------------------------------------------------------------------
// Pay the whole thing — which is the same act at two different moments, so it
// is one function.
//
//   BEFORE the plan starts (pending_deposit): "I'd rather just pay it." The
//   plan was an offer; this declines the schedule and settles the total. Gated
//   on allow_pay_in_full, because a contractor may have priced the job around
//   the schedule.
//
//   AFTER it starts (active): early payoff of the remaining balance, with no
//   penalty. NEVER gated — that is a promise made to the client in writing on
//   the authorization form, and a flag set by the contractor afterwards cannot
//   take it back.
//
// Locking is atomic so a payoff can never run alongside a scheduled
// installment: we take the plan's payoff lock (pausing the cron for this plan),
// then collect the balance through the ordinary /pay checkout. The plan is only
// closed by the webhook confirming that payment paid.
// ---------------------------------------------------------------------------

export async function startPlanPayoff(clientToken: string, planId: string): Promise<{ redirectUrl: string }> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: access } = await admin
    .from('client_job_access')
    .select('account_id, job_id, expires_at, revoked_at')
    .eq('token_hash', hashToken(clientToken))
    .maybeSingle();
  if (!access || access.revoked_at || (access.expires_at && access.expires_at < now)) {
    throw new Error('This job link is no longer available.');
  }

  const { data: planRow } = await admin
    .from('payment_plans')
    .select('*')
    .eq('id', planId)
    .eq('account_id', access.account_id)
    .eq('job_id', access.job_id)
    .maybeSingle();
  const plan = planRow as PaymentPlan | null;
  if (!plan) throw new Error('Plan not found.');
  if (plan.status === 'paid_off') return { redirectUrl: `/client/jobs/${clientToken}?plan=paid` };
  if (plan.status === 'canceled') throw new Error('This plan is no longer available.');
  if (plan.status === 'pending_deposit' && plan.allow_pay_in_full === false) {
    throw new Error('This contractor has asked for this job to be paid on the plan schedule.');
  }

  // An installment already mid-charge (processing) can't be safely folded into a
  // payoff amount — if we excluded it and it later failed we'd under-collect, and
  // if we included it we'd risk double-charging. Have the client retry shortly.
  const { data: rows } = await admin
    .from('payments')
    .select('amount, status, kind, homeowner_phone, sms_consent, sms_consent_at')
    .eq('payment_plan_id', plan.id);
  const list = (rows ?? []) as Array<{
    amount: number;
    status: string;
    kind: string;
    homeowner_phone: string | null;
    sms_consent: boolean | null;
    sms_consent_at: string | null;
  }>;
  // The consent the deposit request was raised with. A pay-in-full stands in
  // for that request, so it inherits the same permission rather than silently
  // losing the customer's payment texts.
  const consentSource = list.find((row) => row.kind === 'deposit') ?? null;
  if (list.some((row) => row.status === 'processing')) {
    throw new Error('A scheduled payment is processing right now — please try the payoff again in a few minutes.');
  }

  const paidCents = list.filter((row) => row.status === 'paid').reduce((sum, row) => sum + toCents(Number(row.amount)), 0);
  const remainingCents = plan.total_cents - paidCents;
  if (remainingCents <= 0) {
    await admin.from('payment_plans').update({ status: 'paid_off', updated_at: now }).eq('id', plan.id).eq('status', 'active');
    return { redirectUrl: `/client/jobs/${clientToken}?plan=paid` };
  }

  // Atomic lock: pauses the installment cron for this plan while payoff is in
  // flight. Only one payoff can hold the lock at a time. Both live statuses are
  // eligible — before the plan starts this is "pay it all now instead", after
  // it starts it is an early payoff, and neither may run twice.
  const { data: locked } = await admin
    .from('payment_plans')
    .update({ payoff_locked_at: now, updated_at: now })
    .eq('id', plan.id)
    .in('status', ['active', 'pending_deposit'])
    .is('payoff_locked_at', null)
    .select('id')
    .maybeSingle();
  if (!locked) throw new Error('A payoff is already in progress for this plan.');

  // kind='final' + payment_plan_id marks this as the payoff so the webhook can
  // close the plan (on paid) or release the lock (on abandon/fail).
  const { data: payoff, error: payoffError } = await admin
    .from('payments')
    .insert({
      account_id: plan.account_id,
      job_id: plan.job_id,
      payment_plan_id: plan.id,
      kind: 'final',
      label: plan.status === 'pending_deposit' ? 'Paid in full — instead of the payment plan' : 'Remaining balance — payment plan payoff',
      amount: fromCents(remainingCents),
      status: 'requested',
      homeowner_phone: consentSource?.homeowner_phone ?? null,
      sms_consent: consentSource?.sms_consent ?? false,
      sms_consent_at: consentSource?.sms_consent_at ?? null,
    })
    .select('id')
    .single();
  if (payoffError || !payoff) {
    // Release the lock so the client can retry.
    await admin.from('payment_plans').update({ payoff_locked_at: null, updated_at: new Date().toISOString() }).eq('id', plan.id);
    throw payoffError ?? new Error('Could not start the payoff.');
  }

  return { redirectUrl: `/pay/${payoff.id}` };
}

// Webhook: the payoff charge is confirmed paid — close the plan, cancel the
// still-unpaid installments (no money moved, so the rows are removed), and
// notify. Idempotent via the active → paid_off compare-and-set.
async function finalizePlanPayoff(admin: ReturnType<typeof createAdminClient>, paymentId: string): Promise<void> {
  const { data: payment } = await admin
    .from('payments')
    .select('id, kind, status, payment_plan_id')
    .eq('id', paymentId)
    .maybeSingle();
  if (!payment || payment.kind !== 'final' || !payment.payment_plan_id || payment.status !== 'paid') return;

  // Both live statuses close here. A plan paid in full BEFORE it started never
  // reached 'active' — its installments were never scheduled and its deposit
  // was never taken — and closing it is exactly as final either way.
  const { data: closedRow } = await admin
    .from('payment_plans')
    .update({ status: 'paid_off', payoff_locked_at: null, updated_at: new Date().toISOString() })
    .eq('id', payment.payment_plan_id)
    .in('status', ['active', 'pending_deposit'])
    .select('id, account_id, job_id, status, deposit_payment_id')
    .maybeSingle();
  if (!closedRow) return;

  await admin
    .from('payments')
    .delete()
    .eq('payment_plan_id', closedRow.id)
    .eq('kind', 'plan_installment')
    .in('status', ['requested', 'failed']);

  // And the deposit request the plan raised, which nobody is going to pay now.
  // Same "cancel is a delete of an unstarted request" rule the owner's own
  // cancel button uses — only ever a row still sitting at 'requested', so a
  // deposit that had begun processing is untouched.
  await admin
    .from('payments')
    .delete()
    .eq('payment_plan_id', closedRow.id)
    .eq('kind', 'deposit')
    .eq('status', 'requested');

  await createJobFeedEvent(admin, closedRow.account_id, closedRow.job_id, {
    kind: 'payment_plan_paid_off',
    title: 'Paid in full',
    body: 'The full amount was paid. No further payments are scheduled.',
    visibility: 'client_financial',
  });
}

// Webhook: a payoff attempt was abandoned or failed — release the lock so the
// plan safely resumes its normal installment schedule (nothing was deleted, so
// there is nothing to rebuild).
async function releasePlanPayoffLock(admin: ReturnType<typeof createAdminClient>, paymentId: string): Promise<void> {
  const { data: payment } = await admin
    .from('payments')
    .select('id, kind, payment_plan_id')
    .eq('id', paymentId)
    .maybeSingle();
  if (!payment || payment.kind !== 'final' || !payment.payment_plan_id) return;
  // Both live statuses, matching the lock. A pay-in-full abandoned at checkout
  // has to hand the plan back — otherwise a pending plan whose customer changed
  // their mind is locked out of its own deposit forever.
  await admin
    .from('payment_plans')
    .update({ payoff_locked_at: null, updated_at: new Date().toISOString() })
    .eq('id', payment.payment_plan_id)
    .in('status', ['active', 'pending_deposit']);
}

// ---------------------------------------------------------------------------
// Webhook dispatchers — the ONLY entry points the Stripe webhook calls. "Paid"
// state is never derived from a client redirect; these run on verified events.
// ---------------------------------------------------------------------------

// A plan-linked payment just settled paid: activate the plan (deposit), close it
// (payoff), or check for completion (installment). Safe to call on any paid
// payment — it no-ops for rows without a plan.
export async function handlePlanPaymentSettled(admin: ReturnType<typeof createAdminClient>, paymentId: string): Promise<void> {
  const { data: payment } = await admin
    .from('payments')
    .select('kind, status, payment_plan_id')
    .eq('id', paymentId)
    .maybeSingle();
  if (!payment || !payment.payment_plan_id || payment.status !== 'paid') return;

  if (payment.kind === 'deposit') await activatePlanForPaidDeposit(admin, paymentId);
  else if (payment.kind === 'final') await finalizePlanPayoff(admin, paymentId);
  else if (payment.kind === 'plan_installment') await reconcilePlanIfComplete(admin, payment.payment_plan_id);
}

// A plan-linked payment failed/expired: release a held payoff lock if this was a
// payoff attempt. No-ops for anything else.
export async function handlePlanPaymentFailed(admin: ReturnType<typeof createAdminClient>, paymentId: string): Promise<void> {
  await releasePlanPayoffLock(admin, paymentId);
}

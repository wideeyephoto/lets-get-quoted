import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { createJob, type Job } from '@/lib/jobs';
import { getStripeClient, toCents } from '@/lib/stripe';
import { getQuotedFee } from '@/lib/payments';
import { normalizeUsPhone } from '@/lib/phone';
import { findOrCreateClientId } from '@/lib/clients';
import { createJobFeedEvent, createPaymentFeedEvent } from '@/lib/job-feed';
import { sendPaymentSmsEvent } from '@/lib/sms';
import { recordRecurringChargeFailure, extractStripeDecline } from '@/lib/dunning';
import { createInvoiceWithSingleItem, markInvoicePaidForPayment } from '@/lib/invoices';

export type RecurringFrequency = 'weekly' | 'biweekly' | 'monthly';

export type RecurringPlan = {
  id: string;
  account_id: string;
  client_id: string | null;
  title: string;
  scope: string | null;
  client_name: string;
  client_phone: string | null;
  client_email: string | null;
  address: string | null;
  amount: number;
  frequency: RecurringFrequency;
  next_run_date: string;
  active: boolean;
  auto_charge: boolean;
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
  card_brand: string | null;
  card_last4: string | null;
  last_job_id: string | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
};

export const FREQUENCY_LABEL: Record<RecurringFrequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
};

export const FREQUENCY_OPTIONS: { id: RecurringFrequency; label: string }[] = [
  { id: 'weekly', label: 'Weekly' },
  { id: 'biweekly', label: 'Every 2 weeks' },
  { id: 'monthly', label: 'Monthly' },
];

// Bound one cron invocation.
const MAX_PLANS_PER_RUN = 200;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// Advance a YYYY-MM-DD key by one cadence step. Weekly/biweekly are exact day
// math; monthly adds a calendar month and clamps to the target month's last day
// (so the 31st becomes the 28th/30th rather than rolling into next month).
export function advanceDate(dateKey: string, frequency: RecurringFrequency): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (frequency === 'monthly') {
    let nextYear = year;
    let nextMonth = month + 1;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
    return `${nextYear}-${pad(nextMonth)}-${pad(Math.min(day, lastDay))}`;
  }
  const step = frequency === 'weekly' ? 7 : 14;
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + step);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function formatDateLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export type RecurringPlanInput = {
  title: string;
  scope: string | null;
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
  address: string | null;
  amount: number;
  frequency: RecurringFrequency;
  firstVisitDate: string;
  autoCharge: boolean;
};

export async function createRecurringPlan(
  supabase: SupabaseClient,
  accountId: string,
  input: RecurringPlanInput,
): Promise<RecurringPlan> {
  const phone = input.clientPhone ? normalizeUsPhone(input.clientPhone) ?? input.clientPhone.trim() : null;
  const clientId = await findOrCreateClientId(supabase, accountId, {
    name: input.clientName,
    phone: input.clientPhone,
    email: input.clientEmail,
    address: input.address,
  });

  const { data, error } = await supabase
    .from('recurring_plans')
    .insert({
      account_id: accountId,
      client_id: clientId,
      title: input.title.trim(),
      scope: input.scope?.trim() || null,
      client_name: input.clientName.trim() || 'Client',
      client_phone: phone,
      client_email: input.clientEmail?.trim() || null,
      address: input.address?.trim() || null,
      amount: input.amount,
      frequency: input.frequency,
      next_run_date: input.firstVisitDate,
      auto_charge: input.autoCharge,
    })
    .select('*')
    .single();
  if (error || !data) throw error ?? new Error('Unable to create the plan.');
  return data as RecurringPlan;
}

export async function listRecurringPlans(supabase: SupabaseClient, accountId: string): Promise<RecurringPlan[]> {
  const { data, error } = await supabase
    .from('recurring_plans')
    .select('*')
    .eq('account_id', accountId)
    .order('active', { ascending: false })
    .order('next_run_date', { ascending: true });
  if (error) return []; // un-migrated DB → empty, don't 500 the page
  return (data ?? []) as RecurringPlan[];
}

export async function getRecurringPlan(supabase: SupabaseClient, accountId: string, planId: string): Promise<RecurringPlan | null> {
  const { data } = await supabase.from('recurring_plans').select('*').eq('account_id', accountId).eq('id', planId).maybeSingle();
  return (data as RecurringPlan) ?? null;
}

export async function setRecurringPlanActive(supabase: SupabaseClient, accountId: string, planId: string, active: boolean): Promise<void> {
  const { error } = await supabase
    .from('recurring_plans')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', planId);
  if (error) throw error;
}

export async function deleteRecurringPlan(supabase: SupabaseClient, accountId: string, planId: string): Promise<void> {
  const { error } = await supabase.from('recurring_plans').delete().eq('account_id', accountId).eq('id', planId);
  if (error) throw error;
}

type ChargeOutcome = 'paid' | 'failed' | 'skipped';

// Charge one recurring visit off-session against the plan's saved card. Records
// a payment row either way; a failure texts the client a manual pay link (the
// standard payment_failed message) so the visit can still be collected.
async function chargePlanVisit(
  admin: ReturnType<typeof createAdminClient>,
  plan: RecurringPlan,
  job: Job,
  dateKey: string,
  invoiceId: string | null,
): Promise<ChargeOutcome> {
  if (!plan.auto_charge || !plan.stripe_payment_method_id || !plan.stripe_customer_id || plan.amount <= 0) {
    return 'skipped';
  }

  const { data: account } = await admin
    .from('accounts')
    .select('stripe_connect_id, connect_onboarded')
    .eq('id', plan.account_id)
    .maybeSingle();
  if (!account?.stripe_connect_id || !account.connect_onboarded) {
    await createJobFeedEvent(admin, plan.account_id, job.id, {
      kind: 'recurring_charge_skipped',
      title: 'Auto-charge skipped',
      body: "There's a card on file, but Stripe payouts aren't finished — connect Stripe to auto-charge this plan.",
      visibility: 'internal',
    });
    return 'skipped';
  }

  const normalizedPhone = plan.client_phone ? normalizeUsPhone(plan.client_phone) : null;
  let canText = false;
  if (normalizedPhone) {
    const { data: consent } = await admin
      .from('sms_consent')
      .select('status')
      .eq('account_id', plan.account_id)
      .eq('phone_number', normalizedPhone)
      .maybeSingle();
    canText = consent?.status === 'opted_in';
  }

  const { feeRate, platformFee } = await getQuotedFee(plan.account_id, plan.amount);
  const label = `${plan.title} — ${formatDateLabel(dateKey)}`;

  const { data: payment, error: payError } = await admin
    .from('payments')
    .insert({
      account_id: plan.account_id,
      job_id: job.id,
      invoice_id: invoiceId,
      recurring_plan_id: plan.id,
      kind: 'final',
      label,
      amount: plan.amount,
      status: 'processing',
      platform_fee: platformFee,
      fee_rate: feeRate,
      homeowner_phone: normalizedPhone,
      sms_consent: canText,
      sms_consent_at: canText ? new Date().toISOString() : null,
      charge_attempts: 1,
    })
    .select('id')
    .single();
  if (payError || !payment) {
    console.error('Recurring payment row insert failed:', payError?.message);
    return 'failed';
  }

  const stripe = getStripeClient();
  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount: toCents(plan.amount),
        currency: 'usd',
        customer: plan.stripe_customer_id,
        payment_method: plan.stripe_payment_method_id,
        off_session: true,
        confirm: true,
        application_fee_amount: toCents(platformFee),
        transfer_data: { destination: account.stripe_connect_id },
        description: label,
        metadata: { payment_id: payment.id, recurring_plan_id: plan.id },
      },
      // Same plan + same visit date can only ever charge once, even if the cron
      // somehow re-processes the row.
      { idempotencyKey: `recurring_${plan.id}_${dateKey}` },
    );

    // Persist the intent id immediately, before branching, so a crash right after
    // the charge still leaves a reconcilable id for the payment_intent.succeeded
    // webhook (which is the out-of-band safety net for a lost sync write).
    await admin.from('payments').update({ stripe_payment_intent: intent.id }).eq('id', payment.id);

    if (intent.status === 'succeeded') {
      await admin
        .from('payments')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', payment.id);
      // Keep the visit invoice in lockstep with the charge.
      if (invoiceId) await markInvoicePaidForPayment(admin, invoiceId);
      await createPaymentFeedEvent(admin, payment.id, 'payment_paid');
      if (canText) await sendPaymentSmsEvent(payment.id, 'payment_paid');
      return 'paid';
    }

    if (intent.status === 'processing' || intent.status === 'requires_capture') {
      // Settling asynchronously — leave the row 'processing' and let the
      // payment_intent.succeeded / .payment_failed webhook reconcile it. Do NOT
      // mark it failed (that would wrongly dun a charge that will settle).
      return 'skipped';
    }

    // requires_action / requires_payment_method / canceled on an off-session
    // charge needs the customer present — record it as an SCA/needs-card failure
    // so dunning routes them to a card-update link instead of blind-retrying.
    await recordRecurringChargeFailure(
      admin,
      plan,
      { id: payment.id, amount: plan.amount, dunning_attempts: 0, charge_attempts: 1, dunning_state: null, failed_at: null },
      { code: 'authentication_required', declineCode: null, message: null, intentId: intent.id },
      canText,
      false,
    );
    return 'failed';
  } catch (error) {
    // Capture the decline reason (thrown away before dunning existed) and hand
    // off to the dunning recorder: schedule retries for transient declines, ask
    // for a new card on unrecoverable ones, and alert the owner.
    await recordRecurringChargeFailure(
      admin,
      plan,
      { id: payment.id, amount: plan.amount, dunning_attempts: 0, charge_attempts: 1, dunning_state: null, failed_at: null },
      extractStripeDecline(error),
      canText,
      false,
    );
    console.error(`Recurring auto-charge failed for plan ${plan.id}:`, error instanceof Error ? error.message : error);
    return 'failed';
  }
}

// Spawn the due visit for one plan: create the scheduled job, LOCK the cadence
// forward (before charging, so a mid-run failure can never respawn this visit),
// then attempt the auto-charge.
async function spawnPlanOccurrence(admin: ReturnType<typeof createAdminClient>, plan: RecurringPlan): Promise<{ outcome: ChargeOutcome; jobId: string }> {
  const dateKey = plan.next_run_date;

  // CLAIM this visit atomically: advance the cadence ONLY while it's still on
  // dateKey. If a concurrent cron run (or an owner "run now") already advanced
  // it, 0 rows change and we bail — so a plan can never spawn two jobs / two
  // payment rows for the same visit (the Stripe idempotency key dedupes the
  // charge, but not the DB rows / revenue counting).
  const nowIso = new Date().toISOString();
  const { data: claimed } = await admin
    .from('recurring_plans')
    .update({ next_run_date: advanceDate(dateKey, plan.frequency), last_run_at: nowIso, updated_at: nowIso })
    .eq('id', plan.id)
    .eq('next_run_date', dateKey)
    .select('id')
    .maybeSingle();
  if (!claimed) return { outcome: 'skipped', jobId: '' };

  const job = await createJob(admin, plan.account_id, {
    clientName: plan.client_name,
    clientPhone: plan.client_phone,
    clientEmail: plan.client_email,
    address: plan.address,
    scope: plan.scope,
    status: 'in_progress',
    scheduledFor: dateKey,
    quotedAmount: plan.amount,
  });

  await admin.from('recurring_plans').update({ last_job_id: job.id }).eq('id', plan.id);

  await createJobFeedEvent(admin, plan.account_id, job.id, {
    kind: 'recurring_visit',
    title: 'Recurring visit created',
    body: `Auto-created from your “${plan.title}” plan (${FREQUENCY_LABEL[plan.frequency]}).`,
    visibility: 'internal',
  });

  // Mint a proper itemized invoice for the visit (a durable, downloadable bill
  // with its own ref#), then hand its id to the charge so a successful auto-charge
  // flips it to paid. Best-effort: a failure here must never sink the charge — the
  // money path is what matters; a missing invoice is a soft loss.
  let invoiceId: string | null = null;
  if (plan.amount > 0) {
    try {
      const invoice = await createInvoiceWithSingleItem(
        admin,
        plan.account_id,
        job.id,
        { description: `${plan.title} — ${formatDateLabel(dateKey)}`, amount: plan.amount },
        'sent',
      );
      invoiceId = invoice.id;
      await createJobFeedEvent(admin, plan.account_id, job.id, {
        kind: 'invoice_created',
        title: 'Invoice created',
        body: invoice.ref,
        visibility: 'internal',
        amount: Number(invoice.total),
        sourceTable: 'invoices',
        sourceId: invoice.id,
        actionUrl: `/invoice/${invoice.id}`,
      });
    } catch (err) {
      console.error(`Recurring invoice creation failed for plan ${plan.id}:`, err instanceof Error ? err.message : err);
    }
  }

  const outcome = await chargePlanVisit(admin, plan, job, dateKey, invoiceId);
  return { outcome, jobId: job.id };
}

// Owner-triggered "run this plan now" — spawns the next visit and charges it
// immediately using the SAME code path the cron uses, instead of waiting for the
// daily sweep. Used both as a real feature (bill an off-cycle visit) and to
// verify the auto-charge path end-to-end through the webhook + DB.
export async function runRecurringPlanNow(accountId: string, planId: string): Promise<{ outcome: ChargeOutcome; jobId: string }> {
  const admin = createAdminClient();
  const { data } = await admin.from('recurring_plans').select('*').eq('account_id', accountId).eq('id', planId).maybeSingle();
  if (!data) throw new Error('Plan not found.');
  const plan = data as RecurringPlan;
  if (!plan.active) throw new Error('This plan is paused — resume it before running a visit.');
  return spawnPlanOccurrence(admin, plan);
}

export type RecurringRunSummary = {
  due: number;
  spawned: number;
  charged: number;
  chargeFailed: number;
  failed: number;
  reason?: string;
};

// Daily sweep (cron): spawn a visit for every active plan due today or earlier,
// auto-charging where a card is on file. Best-effort per plan so one bad plan
// never sinks the run.
export async function runDueRecurringPlans(): Promise<RecurringRunSummary> {
  const admin = createAdminClient();
  const today = todayDateKey();

  const { data: plans, error } = await admin
    .from('recurring_plans')
    .select('*')
    .eq('active', true)
    .lte('next_run_date', today)
    .order('next_run_date', { ascending: true })
    .limit(MAX_PLANS_PER_RUN);
  if (error) {
    return { due: 0, spawned: 0, charged: 0, chargeFailed: 0, failed: 0, reason: 'recurring_plans not available' };
  }

  let spawned = 0;
  let charged = 0;
  let chargeFailed = 0;
  let failed = 0;

  for (const plan of (plans ?? []) as RecurringPlan[]) {
    try {
      const { outcome, jobId } = await spawnPlanOccurrence(admin, plan);
      if (!jobId) continue; // claim lost to a concurrent run — nothing spawned
      spawned++;
      if (outcome === 'paid') charged++;
      else if (outcome === 'failed') chargeFailed++;
    } catch (error) {
      failed++;
      console.error(`Recurring plan ${plan.id} failed to spawn:`, error instanceof Error ? error.message : error);
    }
  }

  return { due: (plans ?? []).length, spawned, charged, chargeFailed, failed };
}

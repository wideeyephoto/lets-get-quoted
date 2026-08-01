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
  // Remaining visits before the plan ends; null = ongoing (no term).
  remaining_cycles: number | null;
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

/**
 * A visit a plan is going to produce, before the job for it exists.
 *
 * Not a job and never pretending to be one: no id, no crew, nothing to drag.
 * It's a commitment the owner has made, drawn on the calendar so they can see
 * it coming.
 */
export type PlannedVisit = {
  planId: string;
  planTitle: string;
  clientName: string;
  dateKey: string;
  amount: number;
  frequency: RecurringFrequency;
  /** 1-based position from the plan's next run, so a fixed term can say "3 of 6". */
  cycle: number;
  /** How many visits the plan has left after this one, when the term is fixed. */
  remainingAfter: number | null;
};

export type PlanProjectionInput = Pick<
  RecurringPlan,
  'id' | 'title' | 'client_name' | 'amount' | 'frequency' | 'next_run_date' | 'active' | 'remaining_cycles'
>;

/**
 * What a set of recurring plans will put on the calendar between two dates.
 *
 * A recurring plan spawns its job on the morning of the visit and not a day
 * sooner — which is right for invoicing and charging, and useless for planning:
 * set up a weekly mow and your calendar stays empty until the day it happens.
 * This walks the same cadence the cron will walk, using the same advanceDate,
 * so what's drawn is exactly what will be created.
 *
 * Pure: no clock, no database. The caller says which window it cares about.
 */
export function projectPlanVisits(
  plans: PlanProjectionInput[],
  range: { fromKey: string; toKey: string },
  maxPerPlan = 60,
  /**
   * Visits that already have a job, keyed `planId:dateKey`. Those are drawn from
   * the job itself; projecting them too would put a ghost on top of real work.
   */
  materialized?: ReadonlySet<string>,
): PlannedVisit[] {
  const visits: PlannedVisit[] = [];
  if (range.toKey < range.fromKey) return visits;

  for (const plan of plans) {
    // A paused plan produces nothing, and drawing its visits would promise work
    // that is not going to happen.
    if (!plan.active) continue;
    if (!plan.next_run_date) continue;

    // A fixed term is a hard stop: six visits means six, not six and then
    // whatever the calendar felt like drawing.
    const term = typeof plan.remaining_cycles === 'number' ? Math.max(0, plan.remaining_cycles) : null;
    const limit = term == null ? maxPerPlan : Math.min(term, maxPerPlan);

    let dateKey = plan.next_run_date;
    for (let cycle = 1; cycle <= limit; cycle++) {
      if (dateKey > range.toKey) break;
      if (dateKey >= range.fromKey && !materialized?.has(`${plan.id}:${dateKey}`)) {
        visits.push({
          planId: plan.id,
          planTitle: plan.title,
          clientName: plan.client_name,
          dateKey,
          amount: Number(plan.amount) || 0,
          frequency: plan.frequency,
          cycle,
          remainingAfter: term == null ? null : term - cycle,
        });
      }
      dateKey = advanceDate(dateKey, plan.frequency);
    }
  }

  return visits.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.clientName.localeCompare(b.clientName));
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
  // Optional term: the plan stops after this many visits. Omit/0 = ongoing.
  termCycles?: number | null;
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
      remaining_cycles: input.termCycles && input.termCycles > 0 ? Math.floor(input.termCycles) : null,
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

/**
 * Pause or resume a plan, and make the calendar agree.
 *
 * Pausing takes the plan's future visits back off the calendar — they exist
 * only because the plan said they would, and leaving them behind is how a
 * paused plan still sends a crew somewhere. Resuming puts them back.
 *
 * Returns how many visits changed, so the page can say so rather than silently
 * removing work the owner was looking at.
 */
export async function setRecurringPlanActive(
  supabase: SupabaseClient,
  accountId: string,
  planId: string,
  active: boolean,
): Promise<{ visitsChanged: number }> {
  const { error } = await supabase
    .from('recurring_plans')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', planId);
  if (error) throw error;

  if (!active) return { visitsChanged: await removeFuturePlanVisits(supabase, accountId, planId) };

  const plan = await getRecurringPlan(supabase, accountId, planId);
  return { visitsChanged: plan ? await ensurePlanVisits(createAdminClient(), plan) : 0 };
}

/**
 * Change a live plan: price, cadence, or the day it next runs.
 *
 * Anything that moves the schedule has to take the already-generated future
 * visits with it. Those jobs exist only because the plan said they would, so
 * leaving them behind after a cadence change puts work on the calendar on the
 * OLD rhythm — visible, assignable, and wrong.
 *
 * `amount` alone doesn't move anything, so its visits are left exactly as they
 * are (crew, notes and any rescheduling the owner did survive). It does still
 * update the future jobs' quoted amount, or the calendar would keep quoting the
 * old price for work that will bill at the new one.
 *
 * Raising the price on a plan that charges a card on file is deliberately NOT
 * silent — see requiresReconsent.
 */
export async function updateRecurringPlan(
  supabase: SupabaseClient,
  accountId: string,
  planId: string,
  patch: { amount?: number; frequency?: RecurringFrequency; nextRunDate?: string },
): Promise<{ plan: RecurringPlan; visitsRebuilt: number }> {
  const current = await getRecurringPlan(supabase, accountId, planId);
  if (!current) throw new Error('Plan not found.');

  const amount = typeof patch.amount === 'number' && Number.isFinite(patch.amount) ? Math.max(0, patch.amount) : current.amount;
  const frequency = patch.frequency ?? current.frequency;
  const nextRunDate = patch.nextRunDate ?? current.next_run_date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextRunDate)) throw new Error('Choose a valid next visit date.');

  const scheduleMoved = frequency !== current.frequency || nextRunDate !== current.next_run_date;

  const { data, error } = await supabase
    .from('recurring_plans')
    .update({ amount, frequency, next_run_date: nextRunDate, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', planId)
    .select('*')
    .single();
  if (error || !data) throw error ?? new Error('Unable to update the plan.');
  const plan = data as RecurringPlan;

  if (!scheduleMoved) {
    if (amount !== current.amount) {
      await supabase
        .from('jobs')
        .update({ quoted_amount: amount })
        .eq('account_id', accountId)
        .eq('recurring_plan_id', planId)
        .gt('recurring_visit_date', todayDateKey());
    }
    return { plan, visitsRebuilt: 0 };
  }

  await removeFuturePlanVisits(supabase, accountId, planId);
  const visitsRebuilt = plan.active ? await ensurePlanVisits(createAdminClient(), plan) : 0;
  return { plan, visitsRebuilt };
}

/**
 * Whether this edit needs the client to agree again before it takes effect.
 *
 * A card on file is permission to charge an agreed amount, not a blank cheque.
 * Raising the price on a plan set to auto-charge would take more money on the
 * next cycle under a mandate given at the old price, without the client ever
 * being told. Decreases and cadence changes don't have that problem.
 */
export function requiresReconsent(plan: RecurringPlan, nextAmount: number): boolean {
  return plan.auto_charge && nextAmount > plan.amount + 0.005;
}

export async function deleteRecurringPlan(supabase: SupabaseClient, accountId: string, planId: string): Promise<{ visitsRemoved: number }> {
  // Before the plan goes, so the jobs can still be found by their link to it.
  const visitsRemoved = await removeFuturePlanVisits(supabase, accountId, planId);
  const { error } = await supabase.from('recurring_plans').delete().eq('account_id', accountId).eq('id', planId);
  if (error) throw error;
  return { visitsRemoved };
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

// -- visits on the calendar, ahead of the day they happen ---------------------
//
// A plan used to create its job on the morning of the visit. That is right for
// billing — the invoice and the charge belong to the visit — and it left the
// calendar empty all week, with nothing to assign crew to or route.
//
// So the two halves are separated. The JOB is created as far ahead as the
// horizon; the INVOICE and the CHARGE still happen on the day, in the sweep.
// jobs.recurring_visit_date is what ties them together, and it never moves even
// if the owner drags the job to another day — so the sweep always finds the
// visit it means to bill and can never create a second one for it.

/** How many visits of each plan sit on the calendar ahead of time. */
export const VISIT_HORIZON = 4;

async function findVisitJob(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string,
  planId: string,
  visitDate: string,
): Promise<Job | null> {
  const { data } = await admin
    .from('jobs')
    .select('*')
    .eq('account_id', accountId)
    .eq('recurring_plan_id', planId)
    .eq('recurring_visit_date', visitDate)
    .maybeSingle();
  return (data as Job) ?? null;
}

async function createVisitJob(
  admin: ReturnType<typeof createAdminClient>,
  plan: RecurringPlan,
  visitDate: string,
): Promise<Job> {
  const job = await createJob(admin, plan.account_id, {
    clientName: plan.client_name,
    clientPhone: plan.client_phone,
    clientEmail: plan.client_email,
    address: plan.address,
    scope: plan.scope,
    status: 'in_progress',
    scheduledFor: visitDate,
    quotedAmount: plan.amount,
  });
  await admin.from('jobs').update({ recurring_plan_id: plan.id, recurring_visit_date: visitDate }).eq('id', job.id);
  return { ...job, recurring_plan_id: plan.id, recurring_visit_date: visitDate } as Job;
}

/**
 * Put the plan's next few visits on the calendar as real jobs.
 *
 * Idempotent by design — called at plan creation, on every cron run, and when a
 * plan is resumed. A visit that already has a job is left exactly as it is,
 * including any crew, notes or rescheduling the owner has done to it. The
 * unique index is the backstop for two of these racing.
 *
 * Creates nothing for a paused plan, and never runs past a fixed term.
 */
export async function ensurePlanVisits(
  admin: ReturnType<typeof createAdminClient>,
  plan: RecurringPlan,
  horizon = VISIT_HORIZON,
): Promise<number> {
  if (!plan.active || !plan.next_run_date) return 0;

  // Six visits left means six visits, however wide the horizon is.
  const term = typeof plan.remaining_cycles === 'number' ? Math.max(0, plan.remaining_cycles) : null;
  const wanted = term == null ? horizon : Math.min(term, horizon);
  if (wanted <= 0) return 0;

  const dates: string[] = [];
  let dateKey = plan.next_run_date;
  for (let index = 0; index < wanted; index++) {
    dates.push(dateKey);
    dateKey = advanceDate(dateKey, plan.frequency);
  }

  // One read for what's already there, rather than a lookup per date.
  const { data: existing, error } = await admin
    .from('jobs')
    .select('recurring_visit_date')
    .eq('account_id', plan.account_id)
    .eq('recurring_plan_id', plan.id)
    .in('recurring_visit_date', dates);
  // Pre-migration the columns don't exist (42703). Creating visits without the
  // link would make jobs the sweep can never find and would then duplicate, so
  // the correct degradation is the old behaviour: nothing ahead.
  if (error) return 0;

  const have = new Set(((existing ?? []) as Array<{ recurring_visit_date: string }>).map((row) => row.recurring_visit_date));

  let created = 0;
  for (const visitDate of dates) {
    if (have.has(visitDate)) continue;
    try {
      await createVisitJob(admin, plan, visitDate);
      created += 1;
    } catch (createError) {
      // 23505 = another run got there first, which is the index doing its job.
      const code = (createError as { code?: string })?.code;
      if (code !== '23505') {
        console.error(`Recurring visit ${visitDate} for plan ${plan.id} failed:`, createError instanceof Error ? createError.message : createError);
      }
    }
  }
  return created;
}

/**
 * Take the plan's not-yet-happened visits back off the calendar.
 *
 * Used when a plan is paused or cancelled: those jobs exist only because the
 * plan said they would, and leaving them behind puts work on the calendar that
 * nobody is going to do. Strictly future — today's visit and everything before
 * it may already have been billed, worked, or staffed, and is real history.
 */
export async function removeFuturePlanVisits(
  supabase: SupabaseClient,
  accountId: string,
  planId: string,
  fromDateKey = todayDateKey(),
): Promise<number> {
  const { data, error } = await supabase
    .from('jobs')
    .delete()
    .eq('account_id', accountId)
    .eq('recurring_plan_id', planId)
    .gt('recurring_visit_date', fromDateKey)
    .select('id');
  if (error) return 0;
  return (data ?? []).length;
}

// Spawn the due visit for one plan: bill the job that's already on the calendar
// for it (creating it only if it somehow isn't), LOCK the cadence forward
// (before charging, so a mid-run failure can never respawn this visit), then
// attempt the auto-charge.
async function spawnPlanOccurrence(admin: ReturnType<typeof createAdminClient>, plan: RecurringPlan): Promise<{ outcome: ChargeOutcome; jobId: string }> {
  const dateKey = plan.next_run_date;

  // CLAIM this visit atomically: advance the cadence ONLY while it's still on
  // dateKey. If a concurrent cron run (or an owner "run now") already advanced
  // it, 0 rows change and we bail — so a plan can never spawn two jobs / two
  // payment rows for the same visit (the Stripe idempotency key dedupes the
  // charge, but not the DB rows / revenue counting).
  const nowIso = new Date().toISOString();
  // Honor a fixed term: this spawn consumes one cycle. When it's the last one,
  // deactivate in the same atomic claim so no further visits are generated.
  const termLeft = plan.remaining_cycles;
  const termFields = typeof termLeft === 'number'
    ? { remaining_cycles: Math.max(0, termLeft - 1), active: termLeft - 1 > 0 }
    : {};
  const { data: claimed } = await admin
    .from('recurring_plans')
    .update({ next_run_date: advanceDate(dateKey, plan.frequency), last_run_at: nowIso, updated_at: nowIso, ...termFields })
    .eq('id', plan.id)
    .eq('next_run_date', dateKey)
    .select('id')
    .maybeSingle();
  if (!claimed) return { outcome: 'skipped', jobId: '' };

  // The job for this visit usually already exists — visits are put on the
  // calendar as soon as the plan is created, so the owner can see and staff them
  // ahead of time. Today's work is to BILL it, not to create a second copy.
  const job = (await findVisitJob(admin, plan.account_id, plan.id, dateKey)) ?? (await createVisitJob(admin, plan, dateKey));

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
  /** Future visits added to the calendar to keep every plan's horizon full. */
  visitsCreated?: number;
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

  // Top the horizon back up — for the plans that just billed a visit AND for
  // every other active plan, so a book of plans set up before this existed grows
  // its calendar visits on the next run rather than only when it's next touched.
  const topped = await topUpVisitHorizon(admin);

  return { due: (plans ?? []).length, spawned, charged, chargeFailed, failed, visitsCreated: topped };
}

/**
 * Make sure every active plan has its next few visits on the calendar.
 *
 * Runs after the daily sweep. Best-effort per plan: one plan that can't put a
 * visit up must not stop the rest.
 */
export async function topUpVisitHorizon(admin: ReturnType<typeof createAdminClient>): Promise<number> {
  const { data: plans, error } = await admin
    .from('recurring_plans')
    .select('*')
    .eq('active', true)
    .limit(MAX_PLANS_PER_RUN);
  if (error) return 0;

  let created = 0;
  for (const plan of (plans ?? []) as RecurringPlan[]) {
    try {
      created += await ensurePlanVisits(admin, plan);
    } catch (planError) {
      console.error(`Visit top-up failed for plan ${plan.id}:`, planError instanceof Error ? planError.message : planError);
    }
  }
  return created;
}

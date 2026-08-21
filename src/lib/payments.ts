import { createAdminClient } from '@/lib/auth';
import { resolveFeeBasisCents } from '@/lib/billing/fee-basis';
import { getWorkspaceFeeRate } from '@/lib/billing/workspace-fee-rate';
import { pickBusinessName } from '@/lib/business-name';
import { getJob } from '@/lib/jobs';
import { getStripeClient, computePlatformFee, toCents, fromCents, canCreateConnectCharge } from '@/lib/stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { sendPaymentSmsEvent } from '@/lib/sms';

// Offer ACH bank debit on one-off payments at or above this amount. ACH's flat,
// capped fee ($5 at Stripe) beats the card percentage badly on large payments,
// so a big deposit / final balance / invoice is far cheaper by bank transfer.
// Small payments stay card-only (ACH's multi-day settlement isn't worth it).
//
// The value MOVED to lib/pricing.ts and is re-exported here so every existing
// importer is unaffected. It had to move because the /pricing calculator is a
// client component and needs it: importing it from this module would have
// bundled the Supabase admin client, the Stripe SDK and the SMS sender into the
// marketing page. lib/pricing has no imports.
export { ACH_MIN_AMOUNT } from '@/lib/pricing';
import { ACH_MIN_AMOUNT } from '@/lib/pricing';

export type PaymentKind = 'deposit' | 'stage' | 'final' | 'plan_installment';
export type PaymentStatus = 'requested' | 'processing' | 'paid' | 'failed' | 'refunded' | 'disputed' | 'canceled';

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
  fee_basis_amount: number | string | null;
  stripe_checkout_session: string | null;
  stripe_payment_intent: string | null;
  /**
   * Set when Stripe confirms a completed Checkout Session whose money is still
   * moving -- ACH and other delayed methods.
   *
   * ADVISORY, AND MUST BE READ AFTER `status`, NEVER INSTEAD OF IT. It is
   * cleared best-effort on settle and on failure, and deliberately carries no
   * CHECK constraint: seventeen sites transition a payment to a terminal status,
   * and a constraint would turn one missed clear into a webhook that throws
   * after Stripe has already taken the money. A stale value on a settled row is
   * expected. See migrations 20260821000000 and 20260821001000.
   *
   * Exists because `status` alone cannot answer the only question the pay page
   * needs answered: 'processing' is set when a Checkout Session is CREATED, so
   * it means both "the bank is clearing it" and "they closed the tab".
   */
  async_payment_pending_at?: string | null;
  homeowner_phone: string | null;
  sms_consent: boolean;
  sms_consent_at: string | null;
  requested_at: string;
  paid_at: string | null;
  refunded_amount: number;
  // Added by the dark direct-charge migrations. Older databases do not return
  // this property at all, which intentionally remains compatible with the
  // legacy destination-charge refund path.
  charge_model?: string | null;
  disputed_at: string | null;
  dispute_reason: string | null;
  dispute_status: string | null;
  // Payment-plan linkage (deposit / installments / payoff). Absent on one-offs.
  payment_plan_id?: string | null;
  due_date?: string | null;
  installment_seq?: number | null;
  sms_events?: { event_type: string; status: string; sent_at: string | null }[];
};

type PaymentChargeModelRow = { charge_model?: unknown };

type PaymentReadError = {
  code?: string | null;
  message?: string | null;
};

type PaymentReadResult<T> = {
  data: T | null;
  error: PaymentReadError | null;
};

export type LegacyDestinationPaymentRail =
  | { kind: 'allowed'; chargeModelColumnPresent: boolean }
  | { kind: 'blocked' }
  | { kind: 'not_found' };

export const LEGACY_DESTINATION_PAYMENT_RAIL_ERROR =
  'This payment is assigned to a different payment rail and cannot use the legacy destination-charge path.';

/**
 * Whether a payment is safe to send through the active, destination-charge
 * refund path.
 *
 * `charge_model` did not exist before the pricing migrations, so an ABSENT
 * property is a real legacy row and must keep working. Once the property is
 * present, only the explicit database value `destination` is safe. Null,
 * `direct`, unknown strings, and an explicitly-present undefined value all
 * fail closed instead of risking a refund against the wrong Stripe account.
 */
export function isLegacyDestinationPayment(payment: PaymentChargeModelRow): boolean {
  return !Object.prototype.hasOwnProperty.call(payment, 'charge_model')
    || payment.charge_model === 'destination';
}

/** PostgREST's two missing-column shapes during an app-before-migration deploy. */
export function isMissingPaymentChargeModelColumnError(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === '42703' || error?.code === 'PGRST204';
}

function isMissingCanceledPaymentStatusError(error: PaymentReadError | null | undefined): boolean {
  return error?.code === '22P02' && /canceled/i.test(error.message ?? '');
}

/**
 * Resolve a payment read across an app-before-migration deploy without ever
 * mistaking an explicit direct/malformed model for a legacy row.
 *
 * The probe is intentionally separate from the full read. A 42703/PGRST204 on
 * a multi-column query proves only that *some* selected column is missing. We
 * fall back to the legacy query only when a charge_model-only probe reports
 * that same missing-column condition. If the probe succeeds, the current
 * schema exists and the original read remains failed closed.
 */
async function resolvePaymentChargeModelRead<T extends PaymentChargeModelRow>(
  initial: PaymentReadResult<T>,
  probe: () => Promise<PaymentReadResult<PaymentChargeModelRow>>,
  legacy: () => Promise<PaymentReadResult<T>>,
): Promise<PaymentReadResult<T>> {
  if (!initial.error && !initial.data) return initial;

  const needsProbe =
    (!initial.error && initial.data && !Object.prototype.hasOwnProperty.call(initial.data, 'charge_model'))
    || isMissingPaymentChargeModelColumnError(initial.error);
  if (!needsProbe) return initial;

  const probed = await probe();
  if (!probed.error) {
    if (!probed.data) return { data: null, error: null };

    // A successful probe proves the current schema exists. It may fill a field
    // omitted by a stale `*` response, but it must never authorize a fallback
    // after a failed full query (whose missing column was something else).
    if (!initial.error && initial.data) {
      return {
        data: { ...initial.data, charge_model: probed.data.charge_model },
        error: null,
      };
    }
    return initial;
  }

  if (!isMissingPaymentChargeModelColumnError(probed.error)) {
    return { data: null, error: probed.error };
  }

  return legacy();
}

/**
 * Inspect the immutable payment rail before any legacy provider call or status
 * mutation. Direct, null, unknown, and explicitly-present undefined models are
 * blocked. Only explicit destination, or a schema proven not to have the
 * charge_model column yet, may continue.
 */
export async function inspectLegacyDestinationPaymentRail(
  supabase: SupabaseClient,
  paymentId: string,
  accountId?: string,
): Promise<LegacyDestinationPaymentRail> {
  const read = async (columns: string): Promise<PaymentReadResult<PaymentChargeModelRow>> => {
    let query = supabase.from('payments').select(columns).eq('id', paymentId);
    if (accountId) query = query.eq('account_id', accountId);
    const result = await query.maybeSingle();
    return result as PaymentReadResult<PaymentChargeModelRow>;
  };

  const resolved = await resolvePaymentChargeModelRead(
    await read('id, status, charge_model'),
    () => read('charge_model'),
    () => read('id, status'),
  );

  if (resolved.error) throw resolved.error;
  if (!resolved.data) return { kind: 'not_found' };
  if (!isLegacyDestinationPayment(resolved.data)) return { kind: 'blocked' };
  return {
    kind: 'allowed',
    chargeModelColumnPresent: Object.prototype.hasOwnProperty.call(resolved.data, 'charge_model'),
  };
}

async function requireLegacyDestinationPaymentRail(
  supabase: SupabaseClient,
  paymentId: string,
  accountId?: string,
): Promise<{ chargeModelColumnPresent: boolean }> {
  const rail = await inspectLegacyDestinationPaymentRail(supabase, paymentId, accountId);
  if (rail.kind === 'blocked') throw new Error(LEGACY_DESTINATION_PAYMENT_RAIL_ERROR);
  if (rail.kind === 'not_found') throw new Error('Payment not found.');
  return rail;
}

// Sum of paid amounts in the trailing 365 days — the basis for the fee bracket.
// Uses the admin client since this is a trusted server-side calculation, not a
// user-scoped read.
/** PostgREST's default ceiling. A read that ignores it is silently truncated. */
export const TRAILING_VOLUME_PAGE_SIZE = 1_000;
/** 500k payments in a year. Far past any real contractor; a runaway guard only. */
const TRAILING_VOLUME_MAX_PAGES = 500;

/**
 * Sum a filtered payments query across pages.
 *
 * WHY THIS IS NOT ONE SELECT. Supabase caps a response at 1,000 rows by default
 * and says nothing when it truncates -- you get 1,000 rows and no error. This
 * function feeds the platform-fee bracket, and the bracket runs the wrong way:
 * LESS counted volume means a HIGHER fee. So a contractor busy enough to pass
 * 1,000 payments in a year would have had the excess silently dropped and been
 * charged a higher rate on every transaction, permanently, with the overcharge
 * growing as they grew.
 */
async function sumPaged(
  build: () => { range: (from: number, to: number) => PromiseLike<{
    data: Array<Record<string, unknown>> | null;
    error: unknown;
  }> },
  keep: (row: Record<string, unknown>) => boolean,
): Promise<{ total: number; error: unknown }> {
  let total = 0;
  for (let page = 0; page < TRAILING_VOLUME_MAX_PAGES; page += 1) {
    const from = page * TRAILING_VOLUME_PAGE_SIZE;
    const { data, error } = await build().range(from, from + TRAILING_VOLUME_PAGE_SIZE - 1);
    if (error) return { total: 0, error };
    const rows = data ?? [];
    for (const row of rows) if (keep(row)) total += Number(row.amount);
    // A short page is the end. A full one might not be, so ask again.
    if (rows.length < TRAILING_VOLUME_PAGE_SIZE) return { total, error: null };
  }
  // Never silently. Reaching here means the number below is too low, and too
  // low is the direction that overcharges.
  console.error('trailing volume hit the page ceiling; the fee bracket may be wrong');
  return { total, error: null };
}

export async function getTrailingVolume(accountId: string): Promise<number> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

  // Count only Stripe-SETTLED volume toward the fee bracket: exclude imported
  // historical payments AND manual cash/check settlements (markPaymentPaidManually,
  // which never gets a stripe_payment_intent). Otherwise a contractor could self-
  // mark large "cash" payments to inflate volume and drop their real platform fee.
  // Defensive: if `imported` isn't migrated yet, fall back but still require a
  // stripe_payment_intent.
  const query = (columns: string) => () => admin
    .from('payments')
    .select(columns)
    .is('test_marker', null)
    .eq('account_id', accountId)
    .eq('status', 'paid')
    .not('stripe_payment_intent', 'is', null)
    .gte('paid_at', since) as never;

  const primary = await sumPaged(
    query('amount, imported, stripe_payment_intent'),
    (row) => !(row as { imported?: boolean }).imported,
  );
  if (!primary.error) return primary.total;

  const fallback = await sumPaged(query('amount, stripe_payment_intent'), () => true);
  if (fallback.error) throw fallback.error;
  return fallback.total;
}

// Quote the fee rate/amount that would apply if this payment were completed
// right now — lets the public pay page show fee transparency BEFORE checkout
// starts (previously the fee only appeared once a Checkout Session existed and
// persisted fee_rate/platform_fee onto the row). Once checkout actually starts,
// the persisted values are the source of truth (the locked-in rate for that
// specific Stripe session), so callers should prefer those when present and
// only fall back to this quote.
/**
 * The fee a specific payment would be charged, basis and all.
 *
 * getQuotedFee below takes only an amount, so it cannot know whether that amount
 * carries sales tax -- and quoting the gross-based number while the charge takes
 * the subtotal-based one would put a different figure on the pay page than on
 * the card. This is what the pay page uses; getQuotedFee stays for the callers
 * that genuinely have no invoice behind them.
 */
export async function quoteFeeForPayment(
  payment: { id?: string | null; account_id: string; amount: number | string; invoice_id?: string | null },
): Promise<{ feeRate: number; platformFee: number }> {
  const { feeRate } = await getWorkspaceFeeRate(payment.account_id);
  const basis = await resolveFeeBasisCents(createAdminClient(), payment);
  return { feeRate, platformFee: fromCents(Math.round(basis.basisCents * feeRate)) };
}

export async function getQuotedFee(accountId: string, amount: number): Promise<{ feeRate: number; platformFee: number }> {
  const { feeRate } = await getWorkspaceFeeRate(accountId);
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

  // `Number.isFinite` first, and that ordering is the point. This guard was
  // `input.amount <= 0` alone, and **NaN <= 0 is false** -- so an unparseable
  // amount passed it, then supabase-js serialised NaN to null onto a
  // `numeric NOT NULL` column and Postgres raised the error instead, opaquely.
  // Callers parse properly now (see money-input.ts); this is the boundary that
  // must hold whether or not they remember to.
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
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
  account: { business_name: string; stripe_connect_id: string | null; connect_onboarded: boolean; payouts_restricted_at: string | null } | null;
  display_business_name: string;
};

type PublicPaymentDatabaseRecord = Omit<PublicPaymentRecord, 'display_business_name'>;

// Public read — no user session exists (the homeowner is not a system user),
// so this always uses the admin client and returns only what the public pay
// page needs to render.
export async function getPublicPayment(paymentId: string): Promise<PublicPaymentRecord | null> {
  const admin = createAdminClient();

  const read = async (columns: string): Promise<PaymentReadResult<PublicPaymentDatabaseRecord>> => {
    const result = await admin
      .from('payments')
      .select(columns)
      .eq('id', paymentId)
      .maybeSingle();
    return result as unknown as PaymentReadResult<PublicPaymentDatabaseRecord>;
  };

  const fullColumns =
    '*, charge_model, job:jobs!payments_job_id_fkey(client_name, ref), account:accounts!payments_account_id_fkey(business_name, stripe_connect_id, connect_onboarded, payouts_restricted_at)';
  const legacyColumns =
    '*, job:jobs!payments_job_id_fkey(client_name, ref), account:accounts!payments_account_id_fkey(business_name, stripe_connect_id, connect_onboarded, payouts_restricted_at)';
  const resolved = await resolvePaymentChargeModelRead(
    await read(fullColumns),
    async () => {
      const result = await admin.from('payments').select('charge_model').eq('id', paymentId).maybeSingle();
      return result as PaymentReadResult<PaymentChargeModelRow>;
    },
    () => read(legacyColumns),
  );
  const { data, error } = resolved;

  if (error || !data) {
    return null;
  }

  const payment = data;
  const { data: site } = await admin
    .from('sites')
    .select('company_name')
    .eq('account_id', payment.account_id)
    .maybeSingle();

  return {
    ...payment,
    // This name sits above a card form. "My Business" there is the moment a
    // homeowner stops and rings somebody instead of paying.
    display_business_name: pickBusinessName(site, payment.account),
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
  // Once a row is prepared as direct it belongs to the connected-account
  // runtime for life, even while that runtime remains dark. Prove the rail
  // before reading Quick Stop state or constructing any Stripe client.
  const railAdmin = createAdminClient();
  await requireLegacyDestinationPaymentRail(railAdmin, paymentId);

  const payment = await getPublicPayment(paymentId);

  if (!payment) {
    throw new Error('Payment not found.');
  }

  if (!isLegacyDestinationPayment(payment)) {
    throw new Error(LEGACY_DESTINATION_PAYMENT_RAIL_ERROR);
  }

  /**
   * THE WEBHOOK RACE, closed at the one place a second charge could be created.
   *
   * `processing` is allowed through below because it usually means an abandoned
   * checkout, and resuming one is the whole point. But it ALSO covers the few
   * seconds between Stripe redirecting a successful payer and
   * checkout.session.completed landing -- and in that window every surface
   * reasonably treats the payment as unpaid and offers to start it again.
   *
   * Every route to a second charge passes through this function, so asking
   * Stripe here settles it for all of them at once: the pay page, the invoice
   * page, the customer portal and the contractor's own Retry button.
   *
   * Only in the ambiguous case -- `processing` with a session recorded -- so the
   * ordinary first payment adds no round trip. And it FAILS OPEN: if Stripe
   * cannot be reached, the checkout proceeds exactly as it did before this
   * existed. Refusing on a network blip would block a payment somebody is
   * standing there trying to make, which is the worse of the two.
   */
  if (payment.status === 'processing' && payment.stripe_checkout_session) {
    try {
      const priorSession = await getStripeClient().checkout.sessions.retrieve(
        payment.stripe_checkout_session,
      );
      if (priorSession.payment_status === 'paid') {
        throw new Error('This payment has already been completed.');
      }
    } catch (error) {
      // Rethrow our own refusal; swallow anything Stripe threw.
      if (error instanceof Error && error.message === 'This payment has already been completed.') throw error;
      console.error(
        `Could not confirm prior checkout session for ${paymentId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  // "processing" means a checkout session was started but not necessarily
  // completed (e.g. the homeowner abandoned it) — allow retrying with a fresh
  // session. Only "paid"/"refunded" are truly terminal.
  if (payment.status !== 'requested' && payment.status !== 'processing' && payment.status !== 'failed') {
    throw new Error('This payment request is no longer available.');
  }

  // Quick Stop payments carry a hard app-side reservation window (Stripe Checkout's
  // own minimum expiry is 30 min, so 15 min can't be enforced by the session). If
  // this payment belongs to a Quick Stop offer that has lapsed or is no longer
  // awaiting payment, refuse checkout so a released hold can't be paid for late.
  {
    const guardAdmin = createAdminClient();
    const { data: es } = await guardAdmin
      .from('extra_stop_requests')
      .select('status, payment_deadline_at')
      .eq('payment_id', paymentId)
      .maybeSingle();
    if (es) {
      const lapsed = es.payment_deadline_at != null && new Date(es.payment_deadline_at as string).getTime() < Date.now();
      if (es.status !== 'awaiting_customer_payment' || lapsed) {
        throw new Error('This Quick Stop offer has expired.');
      }
    }
  }

  // Deliberately one message for both "never connected" and "staff restricted":
  // this is customer-facing, and a homeowner who cannot pay does not need to be
  // told the contractor is under review.
  if (!canCreateConnectCharge(payment.account)) {
    throw new Error('This contractor has not finished setting up payments yet.');
  }

  const stripe = getStripeClient();
  const admin = railAdmin;

  // If a checkout session already exists for this payment, check it before
  // creating a new one. Blindly creating a fresh session every time this is
  // called (e.g. a double-click, a page reload, a browser form resubmission)
  // overwrites `stripe_checkout_session`, permanently losing track of a
  // session that may have actually succeeded. Reuse an still-open session,
  // and self-heal if Stripe already shows it as paid (covers the case where
  // a webhook was missed).
  if (payment.stripe_checkout_session) {
    const existing = await stripe.checkout.sessions.retrieve(payment.stripe_checkout_session);
    // Re-prove the rail after the provider round-trip. A requested destination
    // row can be atomically prepared as direct while this request is in flight;
    // once that happens, even an otherwise reusable legacy Session is barred.
    const existingRail = await requireLegacyDestinationPaymentRail(admin, paymentId);

    if (existing.payment_status === 'paid') {
      // Compare-and-set like every other payment transition — only advance a
      // still-open payment, never resurrect a refunded/disputed one through the
      // TOCTOU window between the read above and this write.
      let settle = admin
        .from('payments')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          stripe_payment_intent:
            typeof existing.payment_intent === 'string' ? existing.payment_intent : existing.payment_intent?.id,
        })
        .eq('id', paymentId);
      if (existingRail.chargeModelColumnPresent) settle = settle.eq('charge_model', 'destination');
      const { data: settled, error: settleError } = await settle
        .in('status', ['requested', 'processing', 'failed'])
        .select('id')
        .maybeSingle();
      if (settleError) throw settleError;
      if (!settled) {
        const currentRail = await inspectLegacyDestinationPaymentRail(admin, paymentId);
        if (currentRail.kind === 'blocked') throw new Error(LEGACY_DESTINATION_PAYMENT_RAIL_ERROR);
      }
      throw new Error('This payment has already been completed.');
    }

    if (existing.status === 'open' && existing.url) {
      return existing.url;
    }
  }

  // The rate follows the plan, not trailing volume -- which is what /pricing
  // sells and what the quote on the pay page has already shown this payer.
  const { feeRate } = await getWorkspaceFeeRate(payment.account_id);
  // ...and it applies to the discount-adjusted service subtotal, not the gross.
  // Sales tax is not ours to take a percentage of, and the pricing page says so.
  //
  // A basis already on the row WINS, and this is load-bearing rather than an
  // optimisation. payments.fee_basis_amount is immutable once assigned -- the
  // trigger raises 22000 for every role, ungated by charge_model -- and this
  // function re-runs whenever the previous Checkout Session is no longer 'open',
  // which an expired one is not. resolveFeeBasisCents depends on sibling
  // payments and on the invoice's current line items, so a retry can legitimately
  // compute a different number: on a three-way split, 333.33 then 333.34. That
  // second write would be REFUSED and the payment could never be paid again.
  // Locking it to the first value also matches what the row already means for
  // fee_rate -- the rate that specific checkout was quoted at.
  const persistedBasis = payment.fee_basis_amount == null ? null : Number(payment.fee_basis_amount);
  const feeBasis = Number.isFinite(persistedBasis) && persistedBasis !== null
    ? { basisCents: toCents(persistedBasis), grossCents: toCents(payment.amount), source: 'persisted' as const }
    : await resolveFeeBasisCents(admin, payment);
  const platformFeeCents = Math.round(feeBasis.basisCents * feeRate);
  const platformFee = fromCents(platformFeeCents);

  // A payment-plan DEPOSIT must also SAVE the card for the later off-session
  // installment charges. Attach a platform customer and set setup_future_usage
  // so Stripe stores the mandate at deposit time; the deposit's confirmed
  // payment then activates the plan (reading the saved card off the intent).
  const isPlanDeposit = Boolean(payment.payment_plan_id) && payment.kind === 'deposit';
  const planCustomerId = isPlanDeposit
    ? await ensurePlanDepositCustomer(payment.payment_plan_id as string, payment.account_id, payment.job?.client_name ?? null)
    : undefined;

  // Offer ACH on large one-off payments — but NOT on a plan deposit, whose saved
  // payment method drives the card-only installment engine (ACH-saved bank debit
  // isn't wired into that path yet). Card is always offered alongside ACH.
  const offerAch = payment.amount >= ACH_MIN_AMOUNT && !isPlanDeposit;

  const paymentMetadata = {
    payment_id: payment.id,
    ...(payment.payment_plan_id ? { payment_plan_id: payment.payment_plan_id } : {}),
  };

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment',
    ...(planCustomerId ? { customer: planCustomerId } : {}),
    ...(offerAch ? { payment_method_types: ['card', 'us_bank_account'] } : {}),
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
      application_fee_amount: platformFeeCents,
      transfer_data: { destination: payment.account.stripe_connect_id },
      // PaymentIntent metadata snapshots onto the Charge. Dashboard-issued
      // refunds therefore retain the payment id needed by charge.refunded.
      metadata: paymentMetadata,
      ...(isPlanDeposit ? { setup_future_usage: 'off_session' as const } : {}),
    },
    metadata: paymentMetadata,
    success_url: `${origin}/pay/${payment.id}?status=success`,
    cancel_url: `${origin}/pay/${payment.id}?status=cancelled`,
  };

  let session: Stripe.Response<Stripe.Checkout.Session>;
  try {
    session = await stripe.checkout.sessions.create(params);
  } catch (err) {
    // If ACH isn't activated on the PLATFORM account, fall back to card-only so a
    // large payment is never left un-payable.
    //
    // The platform's capability, not the contractor's, and the distinction costs
    // an afternoon if you get it the wrong way round. This is a destination
    // charge — `transfer_data.destination` above, on a Stripe client carrying no
    // `stripeAccount` header — so the Session and its Charge are created on the
    // platform account and settled onward. `us_bank_account` therefore has to be
    // active on the platform. The connected account's own capabilities do not
    // enter into it, which is why the log line below names both: the account id
    // is the payee, and it is NOT the account whose capability just refused.
    if (offerAch && err instanceof Error && /us_bank_account/i.test(err.message)) {
      console.warn(
        `ACH unavailable on the platform account (payee account ${payment.account_id}); `
        + `falling back to card-only: ${err.message}`,
      );
      session = await stripe.checkout.sessions.create({ ...params, payment_method_types: ['card'] });
    } else {
      throw err;
    }
  }

  const expireUndisclosedSession = async () => {
    try {
      await stripe.checkout.sessions.expire(session.id);
    } catch (error) {
      // The important invariant is that this URL is never disclosed. Stripe
      // may already have closed it; log only the provider object id and error.
      console.error(`Unable to expire undisclosed Checkout Session ${session.id}:`, error);
    }
  };

  let currentRail: { chargeModelColumnPresent: boolean };
  try {
    currentRail = await requireLegacyDestinationPaymentRail(admin, paymentId);
  } catch (error) {
    await expireUndisclosedSession();
    throw error;
  }

  let persistSession = admin
    .from('payments')
    .update({
      status: 'processing',
      stripe_checkout_session: session.id,
      platform_fee: platformFee,
      fee_rate: feeRate,
      // What the fee was actually taken on. Immutable once assigned, and
      // payments_platform_fee_check enforces platform_fee <= this.
      fee_basis_amount: fromCents(feeBasis.basisCents),
    })
    .eq('id', paymentId);
  if (currentRail.chargeModelColumnPresent) persistSession = persistSession.eq('charge_model', 'destination');
  const { data: persisted, error } = await persistSession
    .in('status', ['requested', 'processing', 'failed'])
    .select('id')
    .maybeSingle();

  if (error || !persisted || !session.url) {
    await expireUndisclosedSession();
    if (error) throw error;
    if (!persisted) throw new Error('The payment changed before Checkout could be saved. Please reload and try again.');
    throw new Error('Stripe did not return a checkout URL.');
  }

  return session.url;
}

// Fetch a payment with full details for display (contractor dashboard)
export async function getPaymentDetails(supabase: SupabaseClient, accountId: string, paymentId: string) {
  type PaymentDetailsRecord = Payment & {
    invoice: { id: string; ref: string; status: string; total: number } | null;
    job: { id: string; ref: string; client_name: string } | null;
  };
  const read = async (columns: string): Promise<PaymentReadResult<PaymentDetailsRecord>> => {
    const result = await supabase
      .from('payments')
      .select(columns)
      .eq('account_id', accountId)
      .eq('id', paymentId)
      .maybeSingle();
    return result as unknown as PaymentReadResult<PaymentDetailsRecord>;
  };
  const relations = `invoice:invoices(id, ref, status, total), job:jobs(id, ref, client_name)`;
  const resolved = await resolvePaymentChargeModelRead(
    await read(`*, charge_model, ${relations}`),
    async () => {
      const result = await supabase
        .from('payments')
        .select('charge_model')
        .eq('account_id', accountId)
        .eq('id', paymentId)
        .maybeSingle();
      return result as PaymentReadResult<PaymentChargeModelRow>;
    },
    () => read(`*, ${relations}`),
  );
  const { data, error } = resolved;

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

  // This function implements the legacy destination-charge refund mechanics
  // (`reverse_transfer` + `refund_application_fee`). Direct charges live on a
  // connected account and require the separate, still-dark direct refund state
  // machine. Block before status checks and, critically, before constructing a
  // Stripe client or submitting any provider request.
  if (!isLegacyDestinationPayment(payment)) {
    throw new Error('This payment cannot be refunded through the legacy destination-charge refund path.');
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
    //
    // The idempotencyKey is the real double-refund guard: a retry (after a lost DB
    // write) or a double-click computes the SAME key (same paymentId + already +
    // requested), so Stripe returns the ORIGINAL refund instead of creating a second
    // one. A genuinely different slice yields a different key and a new refund.
    //
    // TAKE THE MONEY BACK FROM WHERE IT ACTUALLY WENT
    //
    // Every charge here is a DESTINATION charge: created on the platform with
    // transfer_data.destination, so Stripe immediately moves (amount − fee) to
    // the contractor's connected account (see createCheckoutSession, and the same
    // shape in recurring, payment-plans and dunning).
    //
    // Both flags below default to FALSE. Without them a refund is funded entirely
    // out of the PLATFORM balance while the contractor keeps their transfer — so
    // refunding $1,000 sent $1,000 to the customer, left $987.50 with the
    // contractor, and cost us $987.50 of our own money. Every time. Quick Stop
    // cancellations refund automatically on a tier schedule, so this would have
    // been a standing, self-service withdrawal from our balance.
    //
    //   reverse_transfer      pulls the contractor's share back, proportionally
    //                         on a partial. This is the one that stops the loss.
    //   refund_application_fee returns our platform fee too. We don't keep a cut
    //                         of a transaction that got undone — and it lands
    //                         everyone (customer, contractor, us) back at zero.
    //
    // Stripe only lets the application that created the charge set either, which
    // is us. On a partial refund both are applied proportionally.
    const refund = await stripe.refunds.create(
      {
        payment_intent: payment.stripe_payment_intent,
        ...(isFull ? {} : { amount: requestedCents }),
        reverse_transfer: true,
        refund_application_fee: true,
        metadata: {
          payment_id: paymentId,
          reason: 'Refunded by contractor',
        },
      },
      { idempotencyKey: `refund_${paymentId}_${alreadyCents}_${requestedCents}` },
    );

    console.log(`Refund created: ${refund.id} for payment ${paymentId} (${isFull ? 'full' : 'partial'} ${formatMoneyCents(requestedCents)})`);

    const refundedTotal = fromCents(alreadyCents + requestedCents);

    // Compare-and-set: only advance the row if refunded_amount is still what we read
    // (and it's still 'paid'). A concurrent refund/webhook that already advanced it
    // loses this write harmlessly — Stripe's idempotency already prevented double money.
    let casQuery = supabase
      .from('payments')
      .update({
        refunded_amount: refundedTotal,
        status: isFull ? 'refunded' : 'paid',
        // Refund reporting dates off this, never off paid_at.
        refunded_at: new Date().toISOString(),
        platform_fee_refunded: reversedPlatformFee({
          amount: payment.amount,
          platformFee: payment.platform_fee,
          refundedTotal,
        }),
      })
      .eq('id', paymentId)
      .eq('status', 'paid');
    // The provider refund has already happened, so make the local reconciliation
    // fail closed if the immutable payment rail no longer matches the row we
    // authorized above. A proven pre-migration row cannot name this column.
    if (Object.prototype.hasOwnProperty.call(payment, 'charge_model')) {
      casQuery = casQuery.eq('charge_model', 'destination');
    }
    casQuery = payment.refunded_amount == null ? casQuery.is('refunded_amount', null) : casQuery.eq('refunded_amount', payment.refunded_amount);
    const { data: claimed, error } = await casQuery.select('id').maybeSingle();
    if (error) {
      throw error;
    }

    // Side effects run only for the winning write, so a concurrent path can't
    // double-void the invoice or double-text the homeowner.
    if (claimed) {
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
    }

    return { amount: fromCents(requestedCents), isFull, refundedTotal };
  } catch (err) {
    console.error('Refund failed:', err);
    throw new Error(err instanceof Error ? err.message : 'Refund failed');
  }
}

/**
 * How much of the platform fee has gone back, given how much of the payment has.
 *
 * Refunds are created with `refund_application_fee: true`, so Stripe returns our
 * fee in proportion to the refund. This mirrors what actually happened rather
 * than deciding it.
 *
 * Computed from the CUMULATIVE refunded total rather than incremented per
 * refund, which is what makes it idempotent: the synchronous write in
 * refundPayment and the charge.refunded webhook both run, in either order,
 * sometimes twice, and every one of them lands on the same number.
 *
 * Pure, exported and tested — two write paths agreeing by coincidence is how a
 * money column drifts.
 */
export function reversedPlatformFee(input: {
  amount: number | string | null | undefined;
  platformFee: number | string | null | undefined;
  refundedTotal: number | string | null | undefined;
}): number {
  const amount = Number(input.amount);
  const fee = Number(input.platformFee);
  const refunded = Number(input.refundedTotal);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (!Number.isFinite(fee) || fee <= 0) return 0;
  if (!Number.isFinite(refunded) || refunded <= 0) return 0;
  // Never hand back more fee than was charged, whatever the inputs claim.
  const share = Math.min(1, refunded / amount);
  return Math.round(fee * share * 100) / 100;
}

function formatMoneyCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Mark a payment as failed (e.g., for reconciliation/admin override)
export async function markPaymentFailed(supabase: SupabaseClient, accountId: string, paymentId: string): Promise<void> {
  const rail = await requireLegacyDestinationPaymentRail(supabase, paymentId, accountId);

  let transition = supabase
    .from('payments')
    .update({ status: 'failed' })
    .eq('account_id', accountId)
    .eq('id', paymentId);
  // Re-check the immutable rail in the atomic UPDATE whenever the column is
  // available. The truly pre-migration branch cannot name a missing column.
  if (rail.chargeModelColumnPresent) transition = transition.eq('charge_model', 'destination');
  const { data, error } = await transition
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
  const rail = await requireLegacyDestinationPaymentRail(supabase, paymentId, accountId);
  const payment = await getPaymentDetails(supabase, accountId, paymentId);
  if (!payment) throw new Error('Payment not found for this account.');
  if (!isLegacyDestinationPayment(payment)) throw new Error(LEGACY_DESTINATION_PAYMENT_RAIL_ERROR);

  let transition = supabase
    .from('payments')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', paymentId);
  if (rail.chargeModelColumnPresent) transition = transition.eq('charge_model', 'destination');
  const { data: settled, error } = await transition
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
/**
 * MARKED, NOT DELETED.
 *
 * This used to DELETE the row. The job feed then carried "Payment request sent
 * — $250" with nothing behind it, the payment section said "No payment requests
 * yet", and the money strip said Requested $0.00 — three statements about three
 * different sets of rows, on one screen, about money.
 *
 * It also erased the difference between a job nobody has billed and one where a
 * deposit was raised and pulled twice. A record you can make disappear is not a
 * record, and the one operation that removed a payment outright was the one
 * somebody reaches for when something has already gone wrong.
 *
 * Still only from 'requested': once Stripe holds a processing intent against
 * it, withdrawing is a refund question rather than a status change.
 *
 * Falls back to the old delete on a database where the enum value is not there
 * yet — this ships ahead of migrations/2026-08-15-payment-canceled.sql, and an
 * update naming a value the type does not have fails outright. Losing the row
 * during a deploy window is the behaviour we already had; failing a
 * contractor's cancel is not.
 */
export async function cancelPaymentRequest(supabase: SupabaseClient, accountId: string, paymentId: string): Promise<void> {
  const rail = await requireLegacyDestinationPaymentRail(supabase, paymentId, accountId);

  let transition = supabase
    .from('payments')
    .update({ status: 'canceled' })
    .eq('account_id', accountId)
    .eq('id', paymentId);
  if (rail.chargeModelColumnPresent) transition = transition.eq('charge_model', 'destination');
  const { data, error } = await transition
    .eq('status', 'requested')
    .select('id')
    .maybeSingle();

  if (!error) {
    if (!data) throw new Error('Only payment requests that have not started processing can be cancelled.');
    return;
  }

  // Delete compatibility exists solely for the deploy window before the
  // `canceled` enum value. Permission, network, constraint, and unrelated
  // schema failures must not turn into a destructive fallback.
  if (!isMissingCanceledPaymentStatusError(error)) throw error;

  let legacyDelete = supabase
    .from('payments')
    .delete()
    .eq('account_id', accountId)
    .eq('id', paymentId);
  if (rail.chargeModelColumnPresent) legacyDelete = legacyDelete.eq('charge_model', 'destination');
  const fallback = await legacyDelete
    .eq('status', 'requested')
    .select('id')
    .maybeSingle();
  if (fallback.error) throw fallback.error;
  if (!fallback.data) throw new Error('Only payment requests that have not started processing can be cancelled.');
}

// Retry a failed/processing payment by creating a fresh checkout session
export async function retryPayment(paymentId: string, origin: string): Promise<string> {
  const railAdmin = createAdminClient();
  await requireLegacyDestinationPaymentRail(railAdmin, paymentId);

  const payment = await getPublicPayment(paymentId);

  if (!payment) {
    throw new Error('Payment not found.');
  }

  if (!isLegacyDestinationPayment(payment)) {
    throw new Error(LEGACY_DESTINATION_PAYMENT_RAIL_ERROR);
  }

  if (payment.status === 'paid' || payment.status === 'refunded') {
    throw new Error('This payment is already settled.');
  }

  // Reuse existing session logic (it handles all retry cases)
  return createCheckoutSessionForPayment(paymentId, origin);
}

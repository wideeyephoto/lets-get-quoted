import { createAdminClient } from '@/lib/auth';
import { formatMoneyExact } from '@/lib/jobs';
import {
  getPublicPayment,
  quoteFeeForPayment,
  isLegacyDestinationPayment,
  ACH_MIN_AMOUNT,
  type PaymentStatus,
} from '@/lib/payments';
import { loadContractorBrand } from '@/lib/contractor-brand';
import { ContractorBrandBar, ContractorBrandFoot } from '@/components/contractor-brand';
import { startCheckoutAction } from './actions';

// Always render fresh from the database — this page's content changes based
// on live payment status (requested -> processing -> paid), so it must never
// be statically cached or it could show a stale "Pay" button after payment.
export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = {
  deposit: 'Deposit',
  stage: 'Stage payment',
  final: 'Final payment',
  plan_installment: 'Installment',
};

/**
 * A Quick Stop priority fee, which is stored as `kind = 'deposit'` and is not
 * one.
 *
 * quick-stop-payments.ts writes `kind: 'deposit'` because that is the closest
 * existing kind, so this page labelled a $75 priority-visit fee "Deposit" --
 * which tells a homeowner it comes off the job total. It does not, and the
 * booking flow says so twice in as many sentences: "That fee reserves the visit
 * -- the service itself is quoted and billed separately."
 *
 * The offer also EXPIRES. `payment_deadline_at` is enforced by
 * createCheckoutSessionForPayment, which throws "This Quick Stop offer has
 * expired" -- and the page said nothing about a deadline, so somebody could open
 * a texted link, take twenty minutes over it, and press a live-looking button
 * into a refusal.
 *
 * Read by payment_id rather than joined, because this is the only page that
 * needs it and most payments are not Quick Stops.
 */
async function loadQuickStopOffer(
  admin: ReturnType<typeof createAdminClient>,
  paymentId: string,
  kind: string,
): Promise<{ deadlineAt: string | null; windowAt: string | null } | null> {
  // Every Quick Stop is written as `kind: 'deposit'`, so anything else cannot be
  // one and does not need the round trip. This page is the most-loaded
  // customer-facing route in the product and the overwhelming majority of its
  // payments are final bills and stage payments -- a query per view that can
  // only ever return nothing for them is a query worth not making.
  if (kind !== 'deposit') return null;

  const { data, error } = await admin
    .from('extra_stop_requests')
    .select('payment_deadline_at, proposed_window_at')
    .eq('payment_id', paymentId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    deadlineAt: (data.payment_deadline_at as string | null) ?? null,
    windowAt: (data.proposed_window_at as string | null) ?? null,
  };
}

/**
 * "Installment 3 of 4", instead of "Installment".
 *
 * `installment_seq` has been on the row all along and this page never read it,
 * so somebody paying month three of a four-month plan saw the same three words
 * and the same kind of figure they saw in month one. Nothing told them which
 * payment this was, how many were left, or that it was the last.
 *
 * A plan sends a text every month. Being unable to tell #2 from #4 is the
 * difference between "this is fine" and ringing somebody to ask.
 */
async function loadInstallmentPosition(
  admin: ReturnType<typeof createAdminClient>,
  planId: string | null | undefined,
  seq: number | null | undefined,
): Promise<{ seq: number; total: number } | null> {
  if (!planId || !seq || seq < 1) return null;
  const { data, error } = await admin
    .from('payment_plans')
    .select('installment_count')
    .eq('id', planId)
    .maybeSingle();
  const total = Number(data?.installment_count);
  // Only claim a position when BOTH halves are known and consistent. "3 of 0"
  // and "5 of 4" are worse than the plain word this replaces.
  if (error || !Number.isInteger(total) || total < 1 || seq > total) return null;
  return { seq, total };
}

/** "3:45 PM", in the reader's own timezone. */
function formatClock(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? null
    : parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/**
 * The status as a word, not as the value we store it under.
 *
 * The card printed `payment.status` straight from the row, so a homeowner
 * looking at a $3,500 charge was shown a lowercase "requested" — a database
 * enum, set in the same bold face as the amount beside it, on a page whose
 * whole job is to look like something you can safely put a card into. Every
 * other value on this card already comes through a label map (see KIND_LABEL
 * above); this one had been missed.
 *
 * Capitalised, not rewritten: "Requested" is the word that was there. Sentence
 * case rather than CSS text-transform, because a transform leaves the raw enum
 * in the DOM — it is what gets read aloud, copied, and pasted into an email to
 * the contractor asking what "requested" means.
 */
const STATUS_LABEL: Record<PaymentStatus, string> = {
  requested: 'Requested',
  processing: 'Processing',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
  disputed: 'Disputed',
  // Withdrawn before it reached checkout. Kept as history rather than
  // deleted — see cancelPaymentRequest.
  canceled: 'Cancelled',
};

// To the cent. This page's button issues the charge it names — rounding it to
// "$438" over a $437.50 card charge is the one place a display shortcut becomes
// a false statement about money. See formatMoneyExact.
const formatMoney = formatMoneyExact;

/**
 * A fee rate as a percentage, without the binary-float debris.
 *
 * `rate * 100` is exact for the four rates the catalog ships today (125, 50, 25
 * and 10 basis points), and is not exact in general: 175 bps renders as
 * "1.7500000000000002%" and 7 bps as "0.06999999999999999%". `fee_rate` is read
 * off the payment row, so it is whatever was stored at checkout rather than
 * whatever the catalog currently holds — a rate this page never chose, on a
 * screen a homeowner is deciding whether to trust with a card.
 *
 * Rounded to four decimal places rather than a fixed two: 10 bps is 0.1%, and
 * toFixed(2) would print "0.10%" for it — harmless, but it turns a rate we know
 * exactly into one that looks approximated. Number() then drops the trailing
 * zeros, so 1.25 stays "1.25%" and 0.1 stays "0.1%".
 */
function formatFeeRate(rate: number): string {
  return `${Number(((rate * 100).toFixed(4)))}%`;
}

export default async function PublicPaymentPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { status?: string };
}) {
  if (params.id === 'example') {
    return (
      <main className="wide-shell workspace-shell payment-shell">
        <section className="workspace-hero panel payment-hero">
          <div className="workspace-hero-copy">
            <p className="eyebrow">Let&apos;s Get Quoted contractor</p>
            <h1 className="workspace-title">Sample payment link</h1>
            <p className="workspace-lead">This non-payable preview shows the secure page homeowners open from a transactional payment text.</p>
            <div className="payment-amount-block"><span className="payment-amount-label">Requested payment</span><strong className="payment-amount">$2,500</strong></div>
            <div className="payment-banner muted"><p>Campaign review example only. No payment can be submitted from this page.</p></div>
            <div className="actions workspace-actions">
              <button type="button" className="btn primary" disabled aria-disabled="true" title="Disabled for this review preview" style={{ opacity: 0.5, cursor: 'not-allowed' }}>Pay $2,500</button>
              <a className="btn secondary" href="/privacy">Privacy Policy</a>
              <a className="btn secondary" href="/sms-terms">SMS Terms</a>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const payment = await getPublicPayment(params.id);

  if (!payment) {
    return (
      <main className="wide-shell workspace-shell payment-shell">
        <section className="workspace-hero panel payment-hero">
          <div className="workspace-hero-copy">
            <p className="eyebrow">Payment</p>
            <h1 className="workspace-title">Payment link not found</h1>
            <p className="workspace-lead">This payment link is invalid or has been removed.</p>
          </div>
        </section>
      </main>
    );
  }

  const legacyDestinationPayment = isLegacyDestinationPayment(payment);

  // Money that has gone back, whether or not it took the whole payment with it.
  // Guarded rather than read straight: `refunded_amount` is null on rows that
  // predate the column, and `$null` on a payment page is its own support call.
  const refundedSoFar = Number(payment.refunded_amount) || 0;

  /**
   * Whether money is actually moving, which `status` alone cannot tell you.
   *
   * `processing` is written when a Checkout Session is CREATED, not when a
   * payment starts — so it covers both "an $8,000 bank transfer is clearing" and
   * "they opened Stripe and closed the tab". Until now this page said the first
   * sentence to both of them, and put a Pay button underneath it: the abandoned
   * homeowner was told their payment was on its way when nothing had happened,
   * and the in-flight one was invited to pay twice.
   *
   * `async_payment_pending_at` is set only by checkout.session.completed with the
   * payment still unpaid, which is the ACH case and cannot be reached by
   * abandonment (an abandoned session expires instead). Read after `status`, per
   * the column's contract: it is cleared best-effort, so a stale value on a
   * settled row is expected and must not be believed on its own.
   */
  const moneyIsInFlight = payment.status === 'processing'
    && Boolean(payment.async_payment_pending_at);

  const statusMessage: Record<PaymentStatus, string> = {
    requested: '',
    // Only ever shown for a genuinely in-flight transfer now. The abandoned
    // case renders the checkout-not-finished notice below instead, because
    // telling somebody their money is on its way when it is not is the more
    // expensive of the two mistakes available here.
    processing: moneyIsInFlight
      ? 'Your bank transfer is on its way. Bank transfers (ACH) take a few business days to clear, and you’ll be confirmed once it settles. There’s nothing more to do — please don’t pay again.'
      : '',
    /**
     * A PARTIAL refund leaves the status at `paid` -- deliberately, and the
     * webhook says so: only a full refund becomes `refunded`, because the refund
     * text message states the whole amount and would be wrong otherwise.
     *
     * The consequence reached this page unnoticed. Somebody who paid $4,200 and
     * was refunded $1,200 came back to "This payment has already been completed.
     * Thank you!" over a $4,200 figure, with the $1,200 mentioned nowhere. Their
     * bank statement disagrees with the only page they have, and the page is the
     * one that looks wrong.
     */
    paid: refundedSoFar > 0
      ? `This payment has already been completed, and ${formatMoney(refundedSoFar)} of it has since been refunded to you. Refunds usually reach your account within a few business days.`
      : 'This payment has already been completed. Thank you!',
    // "Failed" reads as "your bank said no", and on this rail that is usually
    // not what happened. A card declined inside Stripe Checkout does not
    // complete the session at all -- Stripe keeps the customer there to retry --
    // so the common route to `failed` is checkout.session.expired, i.e. somebody
    // closed the tab and Stripe timed the session out hours later. The third
    // route is an ACH debit bouncing. "Wasn't completed" is true of all three
    // and alarming in none of them, and it is the wording the payment_failed
    // text message already uses.
    failed: legacyDestinationPayment
      ? 'This payment wasn’t completed, so nothing has been charged. You can try again below.'
      : 'This payment wasn’t completed. Please contact your contractor for a current secure payment link.',
    refunded: 'This payment has been refunded.',
    disputed: 'This payment is under dispute with your bank and cannot be paid here.',
    // The contractor withdrew it. Said plainly rather than left as a working
    // card form for money nobody is asking for any more.
    canceled: 'This payment request was cancelled by your contractor, so there is nothing to pay here. Get in touch if that looks wrong.',
  };

  // ACH is offered on large one-off payments (not on a plan deposit, which stays
  // card-only for the installment engine). Mirrors createCheckoutSessionForPayment.
  const isPlanDeposit = Boolean(payment.payment_plan_id) && payment.kind === 'deposit';
  const offerAch = payment.amount >= ACH_MIN_AMOUNT && !isPlanDeposit;

  const alreadyPaid = payment.status === 'paid';
  const cancelledJustNow = searchParams.status === 'cancelled';
  const canPay =
    (payment.status === 'requested' || payment.status === 'failed' || payment.status === 'processing') &&
    !alreadyPaid &&
    // A transfer already clearing must not be offered a Pay button. The server
    // still permits the retry (createCheckoutSessionForPayment accepts
    // 'processing', deliberately, so an abandoned checkout can be resumed) --
    // this withholds the invitation, it does not close the door. Somebody whose
    // ACH genuinely failed comes back as 'failed' and is offered the button
    // again.
    !moneyIsInFlight &&
    legacyDestinationPayment;

  /**
   * Started checkout, never finished, nothing in flight.
   *
   * The common case, and the one that previously read as "your payment is
   * processing". Said plainly instead, with the Pay button still there.
   */
  // Gated on the same rail as the Pay button. Without this, a non-legacy payment
  // in 'processing' would show "you can pay below" directly above the notice
  // saying checkout cannot be started from this link.
  const checkoutNotFinished = payment.status === 'processing'
    && !moneyIsInFlight
    && legacyDestinationPayment;

  /**
   * The status card's word, resolved the same way the banner is.
   *
   * A stored `processing` covers a bank transfer clearing and a checkout nobody
   * finished, so one label for both makes the card contradict the sentence
   * beside it. An unrecognised status still falls through to the stored value:
   * on a payment page, a blank where the state should be is worse than an
   * unfamiliar word.
   */
  const statusLabel = payment.status === 'processing'
    ? (moneyIsInFlight ? 'Clearing' : 'Not completed')
    : (STATUS_LABEL[payment.status] ?? payment.status);
  const directCheckoutUnavailable =
    !legacyDestinationPayment &&
    (payment.status === 'requested' || payment.status === 'failed' || payment.status === 'processing');

  // Once checkout has started, fee_rate/platform_fee are locked in on the row
  // (the actual rate used for that Stripe session) — use those. Otherwise,
  // quote the CURRENT rate live so the fee is visible before checkout ever
  // starts, closing the "fee only shown after checkout" trust gap.
  //
  // The quote is allowed to fail; the page is not. quoteFeeForPayment resolves the
  // workspace's plan and now REFUSES rather than guessing when the rate is
  // unknowable -- an unpriceable plan code, or a stored platform_fee_bps that
  // disagrees with the catalog. That is the right answer when money is about to
  // move, and the wrong one here: this is a homeowner's payment page, and
  // hiding an estimate is a far smaller failure than a 500 where the pay button
  // should be. createCheckoutSessionForPayment still refuses, so nothing is ever
  // charged at a rate we could not determine.
  const feeIsLocked = payment.fee_rate != null;
  const quotedFee = canPay && !feeIsLocked
    ? await quoteFeeForPayment(payment).catch((error: unknown) => {
      console.error('pay page fee quote failed:', error instanceof Error ? error.message : error);
      return null;
    })
    : null;
  const displayFeeRate = payment.fee_rate ?? quotedFee?.feeRate ?? null;
  const displayFeeAmount = payment.platform_fee ?? quotedFee?.platformFee ?? null;
  const businessName = payment.display_business_name;

  const statusTone =
    payment.status === 'paid'
      ? 'payment-banner success'
      : payment.status === 'failed' || cancelledJustNow
        ? 'payment-banner warning'
        : payment.status === 'refunded'
          ? 'payment-banner muted'
          : 'payment-banner';

  // Whose page this is. A card form under a brand the homeowner does not
  // recognize is the moment they stop and ring somebody — and until now the mark
  // above this button was ours, not the contractor's they actually hired.
  const admin = createAdminClient();
  const [brand, quickStop, installment] = await Promise.all([
    loadContractorBrand(admin, payment.account_id),
    loadQuickStopOffer(admin, payment.id, payment.kind),
    loadInstallmentPosition(admin, payment.payment_plan_id, payment.installment_seq),
  ]);

  // A priority visit fee is not a deposit, whatever the row says. An installment
  // says which one it is, because "Installment" alone is the same three words
  // every month of a plan.
  const kindLabel = quickStop
    ? 'Priority visit'
    : installment
      ? `Installment ${installment.seq} of ${installment.total}`
      : (KIND_LABEL[payment.kind] || 'Payment');
  const payByClock = formatClock(quickStop?.deadlineAt ?? null);
  const arrivalClock = formatClock(quickStop?.windowAt ?? null);

  return (
    <>
      <ContractorBrandBar brand={brand} context={kindLabel} />
      <main className="wide-shell workspace-shell payment-shell">
      <section className="workspace-hero panel payment-hero">
        <div className="workspace-hero-copy">
          {/* The brand bar above carries the name and the payment type; repeating
              both here read as a stutter. */}
          <h1 className="workspace-title">{kindLabel}</h1>
          <p className="workspace-lead">
            {payment.job
              ? `Job ${payment.job.ref} for ${payment.job.client_name}`
              : 'Secure online payment for this contractor request.'}
          </p>

          <div className="payment-amount-block">
            <span className="payment-amount-label">Amount due</span>
            <strong className="payment-amount">{formatMoney(payment.amount)}</strong>
          </div>

          {canPay && displayFeeRate != null ? (
            <div className="payment-fee-info">
              <p className="payment-fee-label">
                {feeIsLocked ? 'Processing fee:' : 'Estimated processing fee:'}{' '}
                <strong>
                  {displayFeeAmount != null ? formatMoney(displayFeeAmount) : formatFeeRate(displayFeeRate)}
                </strong>
              </p>
              <p className="payment-fee-note" style={{ fontSize: '0.875rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
                This fee is included in the amount above and paid to Let&apos;s Get Quoted for payment processing.
              </p>
            </div>
          ) : null}

          {statusMessage[payment.status] || cancelledJustNow ? (
            <div className={statusTone}>
              {statusMessage[payment.status] ? <p>{statusMessage[payment.status]}</p> : null}
              {cancelledJustNow ? <p>Checkout was cancelled. You have not been charged.</p> : null}
            </div>
          ) : null}

          {quickStop && canPay ? (
            /* Two things a homeowner needs before paying a priority fee and was
               told neither of. The fee is NOT credited against the job -- the
               booking flow says so twice, and this page called it a Deposit --
               and the offer expires, which createCheckoutSessionForPayment
               enforces by refusing checkout after payment_deadline_at. */
            <div className="payment-banner">
              <p>
                This reserves a priority visit{arrivalClock ? ` around ${arrivalClock}` : ''}. It pays for
                the extra trip — the work itself is quoted and billed separately, so this is not taken off
                the cost of the job.
              </p>
              {payByClock ? (
                <p>
                  <strong>Please pay by {payByClock}</strong> — after that the slot is released to somebody
                  else and this link stops working.
                </p>
              ) : null}
            </div>
          ) : null}

          {checkoutNotFinished ? (
            <div className="payment-banner warning">
              <p>
                You started a payment but it wasn&apos;t completed, so nothing has been charged
                and this is still outstanding. You can pay below.
              </p>
            </div>
          ) : null}

          {directCheckoutUnavailable ? (
            <div className="payment-banner muted">
              <p>
                Online checkout cannot be started or retried from this link. Please contact your contractor for the
                current secure payment link. No payment can be submitted from this page.
              </p>
            </div>
          ) : null}

          {canPay ? (
            !payment.account?.connect_onboarded ? (
              <div className="payment-banner muted">
                <p>This contractor hasn&apos;t finished setting up payments yet. Please check back soon.</p>
              </div>
            ) : (
              <>
                <form action={startCheckoutAction.bind(null, payment.id)} className="actions workspace-actions">
                  <button type="submit" className="btn primary">
                    Pay {formatMoney(payment.amount)}
                  </button>
                </form>
                {offerAch ? (
                  <p className="payment-fee-note" style={{ fontSize: '0.875rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
                    Pay by <strong>card</strong> or <strong>bank transfer (ACH)</strong> at checkout. Card is instant; a bank
                    transfer takes a few business days to clear, and you’ll be confirmed once it settles.
                  </p>
                ) : null}
              </>
            )
          ) : null}
        </div>

        <div className="workspace-metric-grid compact">
          <article className="workspace-metric-card accent">
            <span className="workspace-metric-label">Payment status</span>
            {/* A status we have never heard of falls back to the stored value
                rather than to nothing: on a payment page, a blank where the
                state should be is worse than an unfamiliar word. */}
            {/* Not STATUS_LABEL alone. `processing` is one stored value covering
                two situations, and this card sits directly beside the banner
                that now distinguishes them -- so it read "Processing" next to
                "You started a payment but it wasn't completed". The card is the
                thing people quote back on the phone; it should not disagree
                with the sentence above it. */}
            <strong className="workspace-metric-value">{statusLabel}</strong>
            <p className="workspace-metric-note">Live status rendered fresh from the database.</p>
          </article>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">Payment type</span>
            <strong className="workspace-metric-value">{kindLabel}</strong>
            <p className="workspace-metric-note">This request is tied to the contractor workflow.</p>
          </article>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">Requested by</span>
            <strong className="workspace-metric-value payment-metric-name">
              {businessName}
            </strong>
            <p className="workspace-metric-note">Payments route through Stripe checkout for secure processing.</p>
          </article>
        </div>
      </section>
      <ContractorBrandFoot businessName={businessName} />
      </main>
    </>
  );
}

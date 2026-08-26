import React from 'react';
import { createAdminClient } from '@/lib/auth';
import { formatMoneyExact } from '@/lib/jobs';
import {
  getPublicPayment,
  quoteFeeForPayment,
  isLegacyDestinationPayment,
  ACH_MIN_AMOUNT,
  type PaymentStatus,
} from '@/lib/payments';
import { canCreateConnectCharge } from '@/lib/stripe';
import { loadContractorBrand } from '@/lib/contractor-brand';
import { ContractorBrandBar, ContractorBrandFoot } from '@/components/contractor-brand';
import {
  CANCELLED_NOTE,
  CANCELLED_NOTE_ONLY_TONE,
  CHECKOUT_BLOCK_NOTE,
  PAYMENT_BANNER_STATUS_WORD,
  PAYMENT_BANNER_TONE,
  paymentBannerMessage,
  type CheckoutBlock,
} from '@/lib/payment-banner';
import { resolvePaymentView } from '@/lib/payment-view';
import { QUICK_STOP_PAYABLE_COLUMNS, quickStopOfferAllowsPayment } from '@/lib/quick-stop';
import { CustomerPermitBadge } from '@/components/permits/CustomerPermitBadge';
import { getCustomerPermitSummary } from '@/lib/permit-intel/customer-portal';
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
): Promise<{ deadlineAt: string | null; windowAt: string | null; payable: boolean } | null> {
  // Every Quick Stop is written as `kind: 'deposit'`, so anything else cannot be
  // one and does not need the round trip. This page is the most-loaded
  // customer-facing route in the product and the overwhelming majority of its
  // payments are final bills and stage payments -- a query per view that can
  // only ever return nothing for them is a query worth not making.
  if (kind !== 'deposit') return null;

  const { data, error } = await admin
    .from('extra_stop_requests')
    .select(`${QUICK_STOP_PAYABLE_COLUMNS}, proposed_window_at`)
    .eq('payment_id', paymentId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    deadlineAt: (data.payment_deadline_at as string | null) ?? null,
    windowAt: (data.proposed_window_at as string | null) ?? null,
    // `status` is selected for this and nothing else. Reading the deadline alone
    // was the original mistake: it is enough to PRINT the rule and not enough to
    // apply it, because an offer can stop being payable by being confirmed,
    // cancelled or swept to `offer_expired` well before its deadline arrives.
    payable: quickStopOfferAllowsPayment(data),
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

  // ACH is offered on large one-off payments (not on a plan deposit, which stays
  // card-only for the installment engine). Mirrors createCheckoutSessionForPayment.
  const isPlanDeposit = Boolean(payment.payment_plan_id) && payment.kind === 'deposit';
  const offerAch = payment.amount >= ACH_MIN_AMOUNT && !isPlanDeposit;

  // `alreadyPaid` used to live here and fed the inline canPay expression.
  // resolvePaymentView handles the paid status itself, so the local went dead
  // when the decision moved -- and lint caught it, not the test suite.
  const cancelledJustNow = searchParams.status === 'cancelled';

  /**
   * They just came back from Stripe having completed checkout.
   *
   * `success_url` is `/pay/[id]?status=success`, and Stripe redirects the
   * browser the instant the payment succeeds -- routinely BEFORE the
   * checkout.session.completed webhook lands. So the row is still `processing`,
   * which is what it was set to when the Session was created.
   *
   * That race made the abandoned-checkout wording I added a genuine hazard: with
   * no async flag and no success param, a card payer landing here was told "This
   * payment wasn't completed, so nothing has been charged" -- seconds after
   * their card was charged. The old copy was wrong in a milder direction; this
   * would have been wrong in the worst one, and it is my own change that made it
   * possible.
   *
   * Stripe only sends anybody to this URL after a completed checkout, so the
   * parameter is trustworthy as "something happened". It is deliberately NOT
   * treated as proof of payment -- the webhook remains the only authority for
   * that, and an ACH checkout completes here with the money still days away.
   */
  const returnedFromCheckout = searchParams.status === 'success';

  /**
   * What this page says and whether it offers a button, decided in
   * src/lib/payment-view.ts.
   *
   * Six booleans meet here, and reading them in sequence down a page is what let
   * "nothing has been charged" reach somebody who had just paid. The decision
   * lives in a pure function so the whole space can be enumerated rather than
   * sampled -- including the two properties that matter most: no combination may
   * put a Pay button beside a banner saying the money already moved, and nothing
   * may say "not completed" to somebody standing on the success redirect.
   *
   * ALL THREE OUTPUTS ARE NOW READ. `canPay` moved first, because it is the one
   * where being wrong costs money. `banner` and `showCancelledNote` followed,
   * and until they did the page went on choosing its own words from the same
   * booleans -- which is not a tidiness problem: the status card never consulted
   * returnedFromCheckout and so contradicted the banner beside it on every card
   * payment. Nothing below re-derives any of this; see payment-banner.ts.
   *
   * WHAT THE RESOLVER DOES NOT DECIDE, deliberately, because none of it is a
   * mutually-exclusive statement about the payment's state: the Quick Stop
   * notice, the ACH offer note, and the not-onboarded notice that withholds the
   * button even when canPay is true. They are additive page content and they
   * stack on purpose.
   */
  const paymentView = resolvePaymentView({
    status: payment.status,
    moneyInFlight: moneyIsInFlight,
    returnedFromCheckout,
    cancelledCheckout: cancelledJustNow,
    payableRail: legacyDestinationPayment,
    refunded: refundedSoFar,
  });
  const canPay = paymentView.canPay;

  /**
   * The banner, its tone, and the word on the status card -- all from the one
   * decision, none of them re-read from the row.
   *
   * This replaced four derivations that each looked at the booleans again: a
   * copy map keyed on the stored status, an abandoned-checkout flag, a
   * rail-unavailable flag, and the card's own label. The card is why it
   * mattered rather than merely being untidy. It branched on moneyIsInFlight
   * and never on returnedFromCheckout, so a card payer standing on the success
   * redirect -- `processing`, no in-flight flag, the single most common
   * post-payment view there is -- read "Not completed" six lines under a banner
   * reading "Thanks, that went through". One row, one moment, two answers, and
   * by its own comment the card is "the thing people quote back on the phone".
   */
  const bannerMessage = paymentBannerMessage(paymentView.banner, refundedSoFar, formatMoney);
  const bannerTone = PAYMENT_BANNER_TONE[paymentView.banner];
  // Two banners span several stored statuses and hand the word back, which is
  // where the unrecognised-status fallback lives: on a payment page a blank
  // where the state should be is worse than an unfamiliar word.
  const statusLabel = PAYMENT_BANNER_STATUS_WORD[paymentView.banner]
    ?? (STATUS_LABEL[payment.status] ?? payment.status);

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

  // Whose page this is. A card form under a brand the homeowner does not
  // recognize is the moment they stop and ring somebody — and until now the mark
  // above this button was ours, not the contractor's they actually hired.
  const admin = createAdminClient();
  const [brand, quickStop, installment] = await Promise.all([
    loadContractorBrand(admin, payment.account_id),
    loadQuickStopOffer(admin, payment.id, payment.kind),
    loadInstallmentPosition(admin, payment.payment_plan_id, payment.installment_seq),
  ]);

  // Fetch sanitized municipal permit status for homeowner reassurance
  let permitSummary = null;
  if (payment.job_id && payment.account_id) {
    try {
      permitSummary = await getCustomerPermitSummary(admin, payment.account_id, payment.job_id);
    } catch (err) {
      console.warn('Could not load permit summary for payment page:', err);
    }
  }

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

  /**
   * Why the button is withheld from a payment that is otherwise payable.
   *
   * `canPay` is the resolver's answer about the PAYMENT. These two are about the
   * contractor and the offer, and each mirrors a refusal
   * createCheckoutSessionForPayment makes for itself -- in the same order it
   * makes them, so what the page says is what the submit would have said.
   *
   * Both used to be paraphrases that came out weaker than the rule they stood
   * for, which is how this page came to render buttons that were certain to
   * throw. They ask the server's own predicates now.
   */
  const checkoutBlock: CheckoutBlock | null = quickStop && !quickStop.payable
    ? 'quick_stop_expired'
    : !canCreateConnectCharge(payment.account)
      ? 'contractor_unavailable'
      : null;

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

          {bannerMessage || paymentView.showCancelledNote ? (
            /* ONE banner, because resolvePaymentView names exactly one state.
               This was four sibling blocks with independent conditions that
               could co-fire: the success redirect stacked on a refund, and an
               abandoned-checkout warning sat beside a cancelled-checkout
               warning telling the reader the same thing twice. Whatever the
               resolver returns is what renders, and nothing else can.

               The words are in src/lib/payment-banner.ts rather than here,
               because a JSX block is not reachable from this suite -- there is
               no jsdom -- and copy that can only be checked by slicing this
               file is copy that can quietly stop being checked. */
            <div className={bannerTone ?? CANCELLED_NOTE_ONLY_TONE}>
              {bannerMessage ? (
                <p>
                  {bannerMessage.lead ? <><strong>{bannerMessage.lead}</strong>{' '}</> : null}
                  {bannerMessage.body}
                </p>
              ) : null}
              {paymentView.showCancelledNote ? <p>{CANCELLED_NOTE}</p> : null}
            </div>
          ) : null}

          {quickStop && quickStop.payable && canPay ? (
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

          {canPay ? (
            /* THE SAME PREDICATE THE SUBMIT ENFORCES, not a weaker paraphrase.
               This asked only whether the contractor had finished onboarding.
               createCheckoutSessionForPayment asks canCreateConnectCharge, which
               also refuses a missing connect id and an account staff have
               restricted -- and restrictPayoutsAction sets payouts_restricted_at
               while leaving connect_onboarded true. So a restricted contractor
               rendered a live Pay button whose submit threw, having already been
               handed the columns needed to know better: getPublicPayment selects
               all three, and this read one of them.

               The same bug in the same shape has been here before, on the
               charge-creating side: dunning checked connect_onboarded and the
               connect id but not the restriction, so a retry cron went on
               charging saved cards for accounts staff had explicitly stopped.
               That is why the condition is one predicate rather than a rule
               written out at each site. This was the fifth site, and the only
               one deciding what a homeowner SEES rather than what runs.

               The wording is unchanged and covers both cases on purpose: the
               refusal it mirrors says so in as many words -- a homeowner who
               cannot pay does not need to be told the contractor is under
               review. */
            checkoutBlock ? (
              <div className="payment-banner muted">
                <p>{CHECKOUT_BLOCK_NOTE[checkoutBlock]}</p>
              </div>
            ) : (
              <>
                <form action={startCheckoutAction.bind(null, payment.id)} className="actions workspace-actions">
                  <button type="submit" className="btn primary">
                    Pay {formatMoney(payment.amount)}
                  </button>
                </form>
                <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '0.78rem', color: 'var(--muted)' }}>
                    <span>Accepted methods:</span>
                    <strong style={{ color: 'var(--text)' }}>Apple Pay · Google Pay · Visa · Mastercard · Amex{offerAch ? ' · ACH Bank Transfer' : ''}</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', color: 'var(--accent)' }}>
                    <span aria-hidden="true">🔒</span> Secured by Stripe · 256-bit bank-grade encryption
                  </div>
                </div>
                {offerAch ? (
                  <p className="payment-fee-note" style={{ fontSize: '0.875rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
                    Pay by <strong>card</strong> or <strong>bank transfer (ACH)</strong> at checkout. Card is instant; a bank
                    transfer takes a few business days to clear, and you’ll be confirmed once it settles.
                  </p>
                ) : null}
              </>
            )
          ) : payment.status === 'paid' || paymentView.banner === 'paid' || paymentView.banner === 'settling' ? (
            <div style={{ marginTop: '1.25rem', padding: '1.25rem', borderRadius: '12px', background: 'rgba(var(--tint), 0.04)', border: '1px solid var(--line)' }}>
              <p style={{ margin: 0, fontWeight: 850, color: 'var(--text)', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: 'var(--accent)' }}>✓</span> Payment Complete
              </p>
              <p style={{ margin: '6px 0 12px', fontSize: '13px', color: 'var(--muted)', lineHeight: 1.45 }}>
                Thank you for your payment to <strong>{businessName}</strong>. A receipt has been emailed to you.
              </p>
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(businessName + ' reviews')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 750, textDecoration: 'none', padding: '8px 16px', borderRadius: '6px' }}
              >
                <span style={{ color: 'var(--accent)' }}>★★★★★</span> Rate Your Experience on Google &rarr;
              </a>
            </div>
          ) : null}
        </div>

        <div className="workspace-metric-grid compact">
          <article className="workspace-metric-card accent">
            <span className="workspace-metric-label">Payment status</span>
            {/* The same decision as the banner, so the two cannot disagree.
                Not the stored status: `processing` is one value covering an
                abandoned checkout, a transfer clearing, and the seconds after a
                card payment while the webhook is still in the air. Reading it
                straight put "Processing" beside "it wasn't completed", and the
                fix for that -- a single moneyIsInFlight branch -- still left
                "Not completed" beside "Thanks, that went through" for everyone
                who had just paid by card. The card is the thing people quote
                back on the phone. */}
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

      {payment.job_id && permitSummary ? (
        <section style={{ maxWidth: '860px', margin: '1.25rem auto', padding: '0 1rem' }}>
          <CustomerPermitBadge jobId={payment.job_id} initialSummary={permitSummary} />
        </section>
      ) : null}

      <ContractorBrandFoot businessName={businessName} />
      </main>
    </>
  );
}

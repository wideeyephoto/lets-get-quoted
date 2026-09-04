import type { PaymentBanner } from './payment-view';

/**
 * What the pay page SAYS for the state resolvePaymentView named.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT IN THE PAGE. resolvePaymentView already
 * decides which single message is correct, and has since the button moved into
 * it. The page went on choosing its own words anyway: a copy map keyed on the
 * stored status, two more blocks keyed on their own booleans, a tone expression,
 * and a status-card word. Five derivations of one decision, which is the exact
 * shape that produced the regression payment-view.ts was written to end.
 *
 * They could not simply be deleted into the page's JSX, because a JSX block is
 * not reachable from this suite. There is no jsdom and no testing-library here
 * (vitest runs `environment: 'node'` over `test/**\/*.test.ts`), so every
 * existing assertion about this page slices its SOURCE between two anchor
 * strings -- and twice in this repo such a slice went on passing against a
 * neighbouring block after the code it named had moved. A decision that can only
 * be checked by slicing is a decision that can quietly stop being checked.
 *
 * So the words live here, keyed on the banner, and the page renders what it is
 * given. Every entry is a `Record<PaymentBanner, ...>`: adding a member to the
 * union without deciding its copy, its tone and its status word is a typecheck
 * failure rather than a blank space on a payment page.
 *
 * The split with payment-view.ts is intact and deliberate. That file owns what
 * is mutually exclusive; this one owns how it reads. Neither owns both.
 */

/**
 * The bolded lead-in and the body of a banner.
 *
 * Split because one banner has a lead -- "Thanks — that went through." -- which
 * renders in <strong> before the rest. Returning markup from here instead would
 * put JSX in a module the tests want to import as data.
 */
export type PaymentBannerMessage = Readonly<{
  lead: string | null;
  body: string;
}>;

/**
 * The CSS class on the banner div, or null where nothing renders at all.
 *
 * These are the classes the page applied before the conversion, kept value for
 * value so the change moves no pixels: `paid` and the success redirect were
 * `success`, an unfinished checkout was `warning`, a refund and an unusable rail
 * were `muted`, and everything else was the plain banner.
 *
 * ONE TONE DOES CHANGE, and deliberately. The old expression tested
 * `status === 'failed' || cancelledJustNow` BEFORE it tested `refunded`, so a
 * refunded payment opened with `?status=cancelled` rendered its refund copy in a
 * `warning` box -- a query string the visitor happened to arrive with outranking
 * what actually became of their money. Keyed on the banner, that is unsayable:
 * `refunded` is `muted` whatever the URL says.
 */
export const PAYMENT_BANNER_TONE: Record<PaymentBanner, string | null> = {
  none: null,
  settling: 'payment-banner success',
  clearing: 'payment-banner',
  not_finished: 'payment-banner warning',
  paid: 'payment-banner success',
  partly_refunded: 'payment-banner success',
  refunded: 'payment-banner muted',
  cancelled: 'payment-banner',
  disputed: 'payment-banner',
  unavailable_here: 'payment-banner muted',
};

/**
 * The rider that says a checkout was backed out of, and the tone it carries
 * when it is the only thing there is to say.
 *
 * showCancelledNote is the resolver's third output and was as unread as the
 * banner: the page re-derived it from the search param in two separate places,
 * one deciding the words and the other the colour. It is modelled as a rider
 * because backing out of Stripe says nothing about the payment's own state --
 * it can ride a settled payment as easily as an open one.
 *
 * The tone only applies where there is no banner to borrow one from. That
 * combination is real: a legacy-rail `requested` payment resolves to banner
 * 'none', which has no container of its own, and without this the visitor who
 * pressed Cancel would lose the words "You have not been charged" entirely.
 * `warning` is what the old expression gave that case, and it is right -- the
 * note is the only thing in the box.
 */
export const CANCELLED_NOTE = 'Checkout was cancelled. You have not been charged.';
export const CANCELLED_NOTE_ONLY_TONE = 'payment-banner warning';

/**
 * NOT BANNER VALUES. These withhold the Pay button.
 *
 * `canPay` says the PAYMENT may be paid. Two further conditions decide whether a
 * checkout can actually be created, and neither is a statement about the
 * payment's state, so neither belongs in the resolver: whether the contractor's
 * Connect account may be charged, and whether a Quick Stop offer is still open.
 * Both are properties of something other than this payment.
 *
 * What they have in common is the failure they replace. Each was once a weaker
 * paraphrase of a rule createCheckoutSessionForPayment enforces exactly, so the
 * page rendered a button whose submit was certain to throw -- and a homeowner
 * pressing it has no way to know the refusal was not their card. Both now ask
 * the server's own predicate, and the notice explains the button's absence
 * rather than letting it just not be there.
 *
 * The order matters and mirrors the server's: checkout tests the Quick Stop
 * window before it tests Connect chargeability, so a lapsed offer on a
 * restricted contractor reports the offer, exactly as the submit would.
 */
export type CheckoutBlock = 'quick_stop_expired' | 'contractor_unavailable';

export const CHECKOUT_BLOCK_NOTE: Record<CheckoutBlock, string> = {
  /**
   * Said as what happened to the SLOT, because that is what the page already
   * promised would happen: "after that the slot is released to somebody else and
   * this link stops working". The homeowner is owed the other half of that
   * sentence when it comes true, not a dead button.
   */
  quick_stop_expired: 'That priority visit slot has been released, so this link can no longer take a payment. '
    + 'Please contact your contractor if you still need the visit.',

  /**
   * One message for "never connected" and "staff restricted" alike, matching the
   * refusal it stands in front of -- which says why in as many words: a homeowner
   * who cannot pay does not need to be told the contractor is under review.
   */
  contractor_unavailable: 'This contractor hasn’t finished setting up payments yet. Please check back soon.',
};

/**
 * The word on the status card, or null to use the stored status's own label.
 *
 * THIS IS THE HALF THAT WAS WRONG. The card used to read the stored status
 * directly, with a single special case for `processing` that asked only whether
 * a transfer was in flight -- so it knew "Clearing" and "Not completed" and
 * nothing else. A card payer standing on the success redirect is `processing`
 * with no in-flight flag, which meant the card said "Not completed" directly
 * beside a banner reading "Thanks — that went through." Both were rendered by
 * the same page, from the same row, at the same moment.
 *
 * Keying the word on the banner is what makes that unsayable: the card and the
 * banner now come from one decision, so they cannot describe a payment
 * differently. "Confirming" is the word for the redirect gap, and it is what the
 * banner beside it promises -- we are confirming it with your bank.
 *
 * `none` and `unavailable_here` defer to the stored label, because they span
 * several stored statuses and the card is the place that should still say which:
 * a direct-rail payment that failed reads "Failed" on the card under a banner
 * about the link, and an unrecognised status falls through to its own raw value
 * rather than to a blank, which on a payment page is worse than an unfamiliar
 * word.
 */
export const PAYMENT_BANNER_STATUS_WORD: Record<PaymentBanner, string | null> = {
  none: null,
  settling: 'Confirming',
  clearing: 'Clearing',
  not_finished: 'Not completed',
  // Deliberately still "Paid". Money did land; the banner beside it is what
  // names the part that came back, with the amount, which a one-word card
  // cannot. Saying "Refunded" here would contradict a settled payment.
  paid: 'Paid',
  partly_refunded: 'Paid',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
  unavailable_here: null,
};

/**
 * Copy that never varies. Anything interpolating a runtime value is assembled in
 * paymentBannerMessage below, not here, so this stays comparable as data.
 */
const STATIC_MESSAGE: Record<PaymentBanner, PaymentBannerMessage | null> = {
  none: null,

  /**
   * The webhook gap. Stripe redirects the browser the moment checkout
   * completes, routinely before checkout.session.completed lands, so the row is
   * still `processing`.
   *
   * Careful not to overclaim: an ACH checkout also completes here with the money
   * days away, and the webhook is the only authority for "paid". So this says
   * what is certainly true -- it went through, and there is nothing left to do.
   */
  settling: {
    lead: 'Thanks — that went through.',
    body: 'We’re just confirming it with your bank, which usually takes a few seconds. '
      + 'There’s nothing else for you to do, and you don’t need to pay again.',
  },

  clearing: {
    lead: null,
    body: 'Your bank transfer is on its way. Bank transfers (ACH) take a few business days to clear, '
      + 'and you’ll be confirmed once it settles. There’s nothing more to do — please don’t pay again.',
  },

  /**
   * The common case, and the one that used to read as "your payment is
   * processing" -- leaving somebody believing they had paid when they had not.
   *
   * It keeps its button, which is the half that is easy to lose: withholding it
   * from every `processing` payment is what made an invoice unpayable for a day.
   */
  not_finished: {
    lead: null,
    body: 'You started a payment but it wasn’t completed, so nothing has been charged '
      + 'and this is still outstanding. You can pay below.',
  },

  paid: { lead: null, body: 'Payment received in full. Thank you!' },
  partly_refunded: null, // Interpolates the amount. See paymentBannerMessage.
  refunded: { lead: null, body: 'This payment has been refunded.' },

  // Withdrawn by the contractor. Said plainly rather than left as a working card
  // form for money nobody is asking for any more.
  cancelled: {
    lead: null,
    body: 'This payment request was cancelled by your contractor, so there is nothing to pay here. '
      + 'Get in touch if that looks wrong.',
  },

  disputed: {
    lead: null,
    body: 'This payment is under dispute with your bank and cannot be paid here.',
  },

  /**
   * Not a rail this page can start a checkout on.
   *
   * This one message absorbs a near-duplicate. The old copy map had a second
   * arm for `failed` on a non-legacy rail -- "This payment wasn’t completed.
   * Please contact your contractor for a current secure payment link." -- which
   * would have rendered in a `warning` box directly above this `muted` one,
   * giving the same instruction twice with one word of difference between them
   * ("a current" against "the current").
   *
   * It never actually reached anybody, and it is worth being exact about why,
   * because the reachable-looking version of this was the reason to hurry.
   * Nothing in this repo can put a `charge_model='direct'` row into `failed`:
   * markLegacyPaymentFailed refuses unless the rail check passes and then adds
   * `.eq('charge_model', 'destination')` to the UPDATE, and the only SQL that
   * writes the status is keyed on a destination-only column. The rail's
   * reachable resting states are `requested` and `processing`, whose copy-map
   * entries were both empty strings, so only this message ever rendered.
   *
   * Nothing is lost by folding it in: the status card still reads the stored
   * word for these rows, because this banner defers its word to the status.
   */
  unavailable_here: {
    lead: null,
    body: 'Online checkout cannot be started or retried from this link. '
      + 'Please contact your contractor for the current secure payment link. '
      + 'No payment can be submitted from this page.',
  },
};

/**
 * The message for a banner, given what the row says.
 *
 * `formatMoney` is passed in rather than imported so this module stays free of
 * the page's formatting choices -- the pay page charges to the cent and uses
 * formatMoneyExact, and a lib that reached for a default would be the place that
 * quietly rounds a $437.50 charge to $438.
 */
export function paymentBannerMessage(
  banner: PaymentBanner,
  refunded: number,
  formatMoney: (amount: number) => string,
): PaymentBannerMessage | null {
  if (banner === 'partly_refunded') {
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
    return {
      lead: null,
      body: `Payment received in full, and ${formatMoney(refunded)} of it has since been `
        + 'refunded to you. Refunds usually reach your account within a few business days.',
    };
  }
  return STATIC_MESSAGE[banner];
}

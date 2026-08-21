/**
 * What the public payment page should say, decided in one place.
 *
 * WHY THIS EXISTS. /pay/[id] accumulated six interacting booleans -- the stored
 * status, whether a bank transfer is genuinely in flight, whether the visitor
 * just came back from a completed checkout, whether they just cancelled one,
 * whether the payment is on a rail this page can charge, and whether anything
 * has been refunded. The page decided its banner and its button by reading them
 * in sequence, which meant every new distinction risked a combination nobody had
 * thought about.
 *
 * One did bite. `processing` with no in-flight flag was made to read "This
 * payment wasn't completed, so nothing has been charged" -- correct for an
 * abandoned checkout, and shown to somebody who had just paid by card, because
 * Stripe redirects before its webhook lands. Six booleans is past the number a
 * person can hold while editing one of them.
 *
 * So the decision is pure and exhaustively tested, and the page renders what it
 * returns. The page still owns everything cosmetic; this owns only what is
 * mutually exclusive.
 */

export type PaymentBanner =
  /** Nothing to say. The amount and the button speak for themselves. */
  | 'none'
  /** They completed checkout seconds ago; the webhook has not landed yet. */
  | 'settling'
  /** A delayed payment method is genuinely moving money. */
  | 'clearing'
  /** A checkout was started and never finished. Nothing was charged. */
  | 'not_finished'
  /** Settled. */
  | 'paid'
  /** Settled, and some of it has since gone back. */
  | 'partly_refunded'
  /** All of it went back. */
  | 'refunded'
  /** The contractor withdrew the request. */
  | 'cancelled'
  /** With the bank, and unpayable here. */
  | 'disputed'
  /** Not a rail this page can start a checkout on. */
  | 'unavailable_here';

export type PaymentView = Readonly<{
  banner: PaymentBanner;
  /** Whether to render the Pay button. */
  canPay: boolean;
  /** Whether to add the "checkout was cancelled, you have not been charged" note. */
  showCancelledNote: boolean;
}>;

export type PaymentViewInput = Readonly<{
  status: string;
  /** `async_payment_pending_at` is set: Stripe confirmed a completed Session whose money is still moving. */
  moneyInFlight: boolean;
  /** Arrived on `?status=success`, which Stripe only sends after a completed checkout. */
  returnedFromCheckout: boolean;
  /** Arrived on `?status=cancelled`. */
  cancelledCheckout: boolean;
  /** On the rail this page can create a checkout for. */
  payableRail: boolean;
  /** Dollars already refunded, whether or not it took the whole payment. */
  refunded: number;
}>;

/** Statuses from which a checkout may still be started. */
const OPEN_STATUSES = new Set(['requested', 'processing', 'failed']);

export function resolvePaymentView(input: PaymentViewInput): PaymentView {
  const {
    status, moneyInFlight, returnedFromCheckout, cancelledCheckout, payableRail, refunded,
  } = input;

  // The cancelled-checkout note rides along with whatever else is true: they
  // backed out of Stripe, which says nothing about the payment's own state.
  const showCancelledNote = cancelledCheckout;

  // Terminal states first. None of them can be paid, and what happened to the
  // money outranks anything about a checkout attempt.
  if (status === 'paid') {
    return { banner: refunded > 0 ? 'partly_refunded' : 'paid', canPay: false, showCancelledNote };
  }
  if (status === 'refunded') return { banner: 'refunded', canPay: false, showCancelledNote };
  if (status === 'disputed') return { banner: 'disputed', canPay: false, showCancelledNote };
  if (status === 'canceled') return { banner: 'cancelled', canPay: false, showCancelledNote };

  // Anything else unrecognised is not payable. Defaulting the other way would
  // offer a button for a state nobody has reasoned about.
  if (!OPEN_STATUSES.has(status)) {
    return { banner: 'none', canPay: false, showCancelledNote };
  }

  // Open, but not on a rail this page can charge.
  if (!payableRail) return { banner: 'unavailable_here', canPay: false, showCancelledNote };

  // THE ORDER OF THESE THREE IS THE WHOLE POINT.
  //
  // A completed checkout outranks everything, because the visitor is standing on
  // the success redirect and the alternative is telling them nothing was
  // charged. Then a transfer genuinely in flight. Only what is left over is an
  // abandoned checkout -- which is the common case, and the one that must keep
  // its button.
  if (returnedFromCheckout) return { banner: 'settling', canPay: false, showCancelledNote };
  if (moneyInFlight) return { banner: 'clearing', canPay: false, showCancelledNote };
  if (status === 'processing') return { banner: 'not_finished', canPay: true, showCancelledNote };

  // `failed` says the same thing as an unfinished checkout and for much the same
  // reason: on this rail the usual route to it is an expired session, not a
  // decline. See the page's own note on the wording.
  if (status === 'failed') return { banner: 'not_finished', canPay: true, showCancelledNote };

  return { banner: 'none', canPay: true, showCancelledNote };
}

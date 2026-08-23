'use client';

import { useEffect } from 'react';

/**
 * When starting a payment fails.
 *
 * WHY THIS PAGE NEEDED ONE. /pay/[id] had no error boundary at all, so an
 * uncaught throw fell through to Next's own screen: "Application error: a
 * client-side exception has occurred", on a blank page, in front of somebody who
 * just pressed a button labelled "Pay $3,500".
 *
 * And the throws are not exotic. `createCheckoutSessionForPayment` refuses --
 * correctly -- for a whole set of ordinary situations:
 *
 *   "This payment has already been completed."
 *   "This payment request is no longer available."
 *   "This Quick Stop offer has expired."
 *   "This contractor has not finished setting up payments yet."
 *   "The payment changed before Checkout could be saved. Please reload…"
 *
 * Every one of those is reachable by a homeowner doing something reasonable --
 * paying in another tab first, opening a texted link a week late, pressing the
 * button twice. The most likely visitor to this file is somebody who has ALREADY
 * PAID, which makes "your card was not charged" the first thing that has to be
 * said and the thing most worth being sure of.
 *
 * WHY IT DOES NOT SHOW THE REASON. Next replaces Server Action error messages
 * with a generic string and a digest in production, deliberately, so the
 * specific sentence is not available here and inventing one would be worse than
 * saying nothing. Reloading is what actually answers the question: the page
 * re-reads the payment and its own status card then states the truth -- Paid,
 * Cancelled, Refunded -- in words. So the primary action is a reload rather than
 * `reset()`, which would retry the same render against the same stale props.
 */
export default function PublicPaymentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is logged so it can be found in the platform's logs, and never
    // rendered: a digest on screen is a support burden, not a support tool.
    console.error('Payment page failed:', error.digest ?? error.message);
  }, [error]);

  return (
    <main className="wide-shell workspace-shell payment-shell">
      <section className="workspace-hero panel payment-hero">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Payment</p>
          <h1 className="workspace-title">We couldn&rsquo;t open the payment page</h1>

          {/* First, and unhedged. Nothing on this page charges anything -- the
              card details are collected by Stripe on the page AFTER this one --
              so this is a promise that can be made without qualification. */}
          <div className="payment-banner warning">
            <p><strong>Your card has not been charged.</strong></p>
          </div>

          <p className="workspace-lead">
            Reloading will show you where this payment actually stands. If you have already paid it,
            or your contractor has cancelled it, the page will say so.
          </p>

          <div className="actions workspace-actions">
            {/* A reload, not reset(). reset() re-renders against the same props
                that just failed; a reload re-reads the payment, which is the
                thing that has probably changed. */}
            <button
              type="button"
              className="btn primary"
              onClick={() => window.location.reload()}
            >
              Reload this page
            </button>
            <button type="button" className="btn secondary" onClick={reset}>
              Try again
            </button>
          </div>

          <p className="payment-fee-note" style={{ fontSize: '0.875rem', color: 'var(--muted)', marginTop: '0.75rem' }}>
            If it keeps happening, reply to the text or email this link came in. Your contractor can
            see the payment on their side and can tell you exactly where it stands.
          </p>
        </div>
      </section>
    </main>
  );
}

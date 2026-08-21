'use client';

import { useEffect } from 'react';

/**
 * When signing or paying an invoice fails.
 *
 * The same gap /pay/[id] had, on the other page a homeowner can hand money over
 * from. Both of this route's actions throw for ordinary, reachable reasons:
 *
 *   signInvoiceAction  "A full name and the agreement checkbox are required…"
 *   payInvoiceAction   "This invoice is not currently payable."
 *                      "Could not start this payment. Please try again."
 *                      "Invoice not found."
 *
 * "Not currently payable" is the one that matters, because it is what an
 * already-paid invoice says. Somebody who paid this morning, opens the emailed
 * link again this evening and presses the button was being shown Next's blank
 * "Application error" screen.
 *
 * So the card-was-not-charged reassurance comes first here too, and for the same
 * reason it can be made without hedging: this page never touches a card. Stripe
 * collects payment details on the page after it.
 *
 * A reload is the primary action rather than reset(). reset() re-renders against
 * the props that just failed; a reload re-reads the invoice, and the page's own
 * state machine then says whether it is payable, already paid, or void.
 */
export default function InvoiceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Logged with the digest so it is findable in the platform's logs, and never
    // rendered: a digest on screen is a support burden, not a support tool.
    console.error('Invoice page failed:', error.digest ?? error.message);
  }, [error]);

  return (
    <main className="wide-shell workspace-shell payment-shell">
      <section className="workspace-hero panel payment-hero">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Invoice</p>
          <h1 className="workspace-title">We couldn&rsquo;t open this invoice</h1>

          <div className="payment-banner warning">
            <p><strong>Your card has not been charged.</strong></p>
          </div>

          <p className="workspace-lead">
            Reloading will show you where this invoice actually stands. If you have already paid it,
            or it has been changed or withdrawn, the page will say so.
          </p>

          <div className="actions workspace-actions">
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
            If it keeps happening, reply to the message this invoice came in. Your contractor can see
            it on their side and can tell you exactly where it stands.
          </p>
        </div>
      </section>
    </main>
  );
}

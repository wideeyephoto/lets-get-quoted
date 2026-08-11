'use client';

import { useEffect } from 'react';

/**
 * When the quote page itself fails.
 *
 * The default is Next's own error screen, which on a customer-facing link says
 * "Application error: a client-side exception has occurred" over a blank page.
 * A homeowner reading that has been handed our stack trace as an explanation of
 * why they cannot pay their contractor.
 *
 * What they need is three things: that it is not their fault, that retrying is
 * free, and a way to reach a person that does not depend on this page working.
 * The link is still good — nothing here has consumed it — so Try again is a
 * real answer and not a hopeful one.
 */
export default function ClientJobError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Logged with the digest so it can be found in the platform's logs. Never
    // rendered: a digest on screen is a support burden, not a support tool.
    console.error('Client quote page failed to render:', error.digest ?? error.message);
  }, [error]);

  return (
    <main className="wide-shell workspace-shell client-job-dashboard qstyle-signature">
      <section className="panel workspace-section-card quote-dead-link">
        <p className="eyebrow">Something went wrong</p>
        <h1 className="workspace-title">We couldn&rsquo;t load your quote</h1>
        <p className="workspace-lead">
          This is on our side, not yours, and nothing you did has been lost. Your link is still valid — it just did not open
          this time.
        </p>
        <div className="quote-dead-actions">
          <button type="button" className="btn primary" onClick={reset}>
            Try again
          </button>
        </div>
        <p className="workspace-lead">
          If it keeps happening, reply to the text or email your contractor sent this link in. They can see everything on
          their side and can tell you exactly where things stand.
        </p>
      </section>
    </main>
  );
}

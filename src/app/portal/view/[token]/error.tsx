'use client';

import { useEffect } from 'react';

/**
 * When the portal page itself fails.
 */
export default function ClientPortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Client portal page failed to render:', error.digest ?? error.message);
  }, [error]);

  return (
    <main className="wide-shell workspace-shell client-job-dashboard">
      <section className="panel workspace-section-card quote-dead-link">
        <p className="eyebrow">Something went wrong</p>
        <h1 className="workspace-title">We couldn&rsquo;t load your portal</h1>
        <p className="workspace-lead">
          This is on our side, not yours, and nothing you did has been lost. Your link is still valid &mdash; it just did not open
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

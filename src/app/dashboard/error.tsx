'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * When a dashboard page — or a Server Action one of them posts to — throws.
 *
 * There was no boundary under /dashboard at all, so anything that threw took
 * the whole route to Next's own screen: "Application error: a server-side
 * exception has occurred" over a blank page, with everything the owner had
 * typed into the form gone with it. The cash-flow settings were one press from
 * that — the action rejected a negative balance the slider above it let you
 * set, and the buffer and the credit line went down with the balance.
 *
 * `reset` re-renders the segment rather than reloading the browser, so a
 * transient failure costs a press instead of a round trip through /login.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Logged with the digest so it can be found in the platform's logs. Never
    // rendered: a digest on screen is a support burden, not a support tool.
    console.error('Dashboard page failed to render:', error.digest ?? error.message);
  }, [error]);

  return (
    <main className="wide-shell workspace-shell">
      <section className="panel workspace-section-card">
        <p className="eyebrow">Something went wrong</p>
        <h1 className="workspace-title">This page didn&rsquo;t load</h1>
        <p className="workspace-lead">
          It&rsquo;s on our side, not yours. Nothing that was already saved has changed — but if you were part way
          through a form, those numbers will need entering again.
        </p>
        <div className="actions workspace-actions">
          <button type="button" className="btn primary" onClick={reset}>
            Try again
          </button>
          <Link href="/dashboard" className="btn secondary">
            Back to the dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}

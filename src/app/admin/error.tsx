'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import styles from './admin.module.css';

/**
 * Error boundary for the internal staff console (/admin).
 *
 * Catches runtime exceptions and failed server operations within /admin,
 * logs the digest for ops tracing, and provides non-destructive recovery
 * actions without crashing the whole application.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Admin console error:', error.digest ?? error.message);
  }, [error]);

  return (
    <div style={{ padding: '2rem 1.5rem', maxWidth: '720px', margin: '0 auto' }}>
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Console Error</p>
        <h1 className={styles.title}>Something went wrong</h1>
        <p className={styles.lead}>
          An unexpected error occurred while loading this admin view.
        </p>
      </header>

      <section className={styles.panel}>
        <div className={`${styles.banner} ${styles.err}`} style={{ marginBottom: '1.25rem' }}>
          <strong>Error:</strong> {error.message || 'An unexpected internal error occurred.'}
          {error.digest ? (
            <div style={{ marginTop: '.35rem', fontSize: '.75rem', opacity: 0.85 }}>
              Digest: <code>{error.digest}</code>
            </div>
          ) : null}
        </div>

        <p style={{ margin: '0 0 1.25rem', fontSize: '.88rem', color: 'rgba(247, 245, 239, 0.75)' }}>
          State has been preserved where possible. You can retry the current operation or return to the Command Center.
        </p>

        <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn primary" onClick={reset}>
            Try again
          </button>
          <Link href="/admin" className="btn secondary">
            Back to Command Center
          </Link>
        </div>
      </section>
    </div>
  );
}

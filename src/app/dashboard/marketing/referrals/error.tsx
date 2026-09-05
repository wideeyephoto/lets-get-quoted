'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function ReferralsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Referrals section error:', error);
  }, [error]);

  return (
    <main className="wide-shell workspace-shell">
      <div
        className="panel workspace-section-card"
        style={{
          padding: '3rem 1.5rem',
          maxWidth: '640px',
          margin: '3rem auto',
          textAlign: 'center',
          background: 'rgba(239, 68, 68, 0.05)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: '12px',
        }}
      >
        <p className="eyebrow" style={{ color: '#ef4444' }}>Marketing · Referrals</p>
        <h2 style={{ fontSize: '1.35rem', fontWeight: 700, margin: '0.5rem 0 1rem', color: 'var(--foreground, #0f172a)' }}>
          Could not load your referral records
        </h2>
        <p style={{ color: 'var(--muted, #64748b)', fontSize: '0.95rem', lineHeight: 1.5, marginBottom: '1.5rem' }}>
          {error.message || 'An unexpected error occurred while processing referral data.'}
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => reset()}
            className="btn primary"
          >
            Try again
          </button>
          <Link href="/dashboard/marketing" className="btn secondary">
            Back to marketing
          </Link>
        </div>
      </div>
    </main>
  );
}

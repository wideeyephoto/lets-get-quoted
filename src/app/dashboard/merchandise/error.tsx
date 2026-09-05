'use client';

import { useEffect } from 'react';

export default function MerchandiseError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Merchandise Studio encountered an error:', error);
  }, [error]);

  return (
    <div
      style={{
        padding: '3rem 1.5rem',
        maxWidth: '600px',
        margin: '2rem auto',
        textAlign: 'center',
        background: 'rgba(239, 68, 68, 0.06)',
        border: '1px solid rgba(239, 68, 68, 0.2)',
        borderRadius: '12px',
      }}
    >
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem', color: '#ef4444' }}>
        Unable to load Merchandise Studio
      </h2>
      <p style={{ color: 'var(--muted, #64748b)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        {error.message || 'An unexpected error occurred while loading your company merchandise assets.'}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        style={{
          background: '#2563eb',
          color: '#ffffff',
          border: 'none',
          padding: '0.6rem 1.4rem',
          borderRadius: '8px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Retry
      </button>
    </div>
  );
}

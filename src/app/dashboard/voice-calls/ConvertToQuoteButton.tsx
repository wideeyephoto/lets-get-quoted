'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { convertVoiceCallToQuoteDraftAction } from './actions';
import styles from './voice-calls.module.css';

export default function ConvertToQuoteButton({ callId }: { callId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleConvert() {
    if (isPending) return;
    setError(null);

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append('callId', callId);
        const res = await convertVoiceCallToQuoteDraftAction(formData);
        if (res?.jobId) {
          router.push(`/dashboard/jobs/${res.jobId}`);
        } else {
          router.push('/dashboard/jobs');
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to convert to quote';
        setError(msg);
      }
    });
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <button
        type="button"
        onClick={handleConvert}
        disabled={isPending}
        className={styles.linkButton}
        style={{
          fontWeight: 600,
          color: isPending ? 'var(--mute-t62, #94a3b8)' : 'var(--blue-10, #93c5fd)',
          background: 'none',
          border: 'none',
          cursor: isPending ? 'not-allowed' : 'pointer',
          padding: 0,
          font: 'inherit',
          opacity: isPending ? 0.7 : 1,
        }}
        title="Convert call intake into a draft quote job"
      >
        <span aria-hidden="true">⚡</span> {isPending ? 'Converting…' : 'Convert to Quote →'}
      </button>
      {error ? (
        <span style={{ fontSize: '0.75rem', color: '#f87171', marginTop: '0.25rem' }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

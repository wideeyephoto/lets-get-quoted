'use client';

import { useState, useRef, useEffect } from 'react';
import styles from '@/app/founder/founder.module.css';

export default function FounderFeatureRequest({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [feature, setFeature] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = feature.trim();
    if (!trimmed || trimmed.length < 2) return;

    setStatus('submitting');
    setErrorMessage('');

    try {
      const res = await fetch('/api/founder/feature-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature: trimmed }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to submit');
      }

      setStatus('success');
      setFeature('');
      setTimeout(() => {
        setStatus('idle');
        setOpen(false);
      }, 4000);
    } catch (err: unknown) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Failed to send. Please try again.');
    }
  };

  return (
    <div className={`${styles.featureRequestWrap} ${className}`}>
      {!open && status !== 'success' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={styles.featureRequestTrigger}
          aria-expanded="false"
          aria-controls="founder-feature-request-form"
          aria-label="Request a feature from Brett"
        >
          <span className={styles.featureRequestIcon} aria-hidden="true">💡</span>
          <span>Request a feature</span>
        </button>
      ) : status === 'success' ? (
        <div className={styles.featureRequestSuccess} role="status" aria-live="polite">
          <span className={styles.featureRequestSuccessCheck} aria-hidden="true">✓</span>
          <span>Sent straight to Brett! Thanks for helping us build.</span>
        </div>
      ) : (
        <form
          id="founder-feature-request-form"
          onSubmit={handleSubmit}
          className={styles.featureRequestBar}
          role="region"
          aria-label="Request a feature form"
        >
          <span className={styles.featureRequestBarIcon} aria-hidden="true">💡</span>
          <input
            ref={inputRef}
            type="text"
            className={styles.featureRequestInput}
            placeholder="What feature would make running your business easier?"
            value={feature}
            onChange={(e) => setFeature(e.target.value)}
            disabled={status === 'submitting'}
            maxLength={1000}
            aria-label="Feature description"
            required
          />
          <button
            type="submit"
            className={styles.featureRequestSendBtn}
            disabled={status === 'submitting' || !feature.trim()}
          >
            {status === 'submitting' ? 'Sending...' : 'Send →'}
          </button>
          <button
            type="button"
            className={styles.featureRequestCloseBtn}
            onClick={() => {
              setOpen(false);
              setStatus('idle');
              setErrorMessage('');
            }}
            aria-label="Close feature request"
          >
            ✕
          </button>
        </form>
      )}

      {status === 'error' && (
        <p className={styles.featureRequestError} role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}

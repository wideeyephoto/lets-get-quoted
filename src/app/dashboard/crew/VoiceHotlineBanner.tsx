'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from './crew.module.css';

const DISMISSED_STORAGE_KEY = 'lgq_crew_voice_hotline_dismissed';

export default function VoiceHotlineBanner() {
  const [dismissed, setDismissed] = useState(true); // default true to avoid hydration mismatch

  useEffect(() => {
    const isDismissed = localStorage.getItem(DISMISSED_STORAGE_KEY) === 'true';
    setDismissed(isDismissed);
  }, []);

  if (dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_STORAGE_KEY, 'true');
    setDismissed(true);
  };

  return (
    <div className={styles.voiceHotlineBanner} role="region" aria-label="Field Voice Hotline information">
      <div className={styles.voiceHotlineContent}>
        <div className={styles.voiceHotlineHeader}>
          <span className={styles.voiceHotlineIcon} aria-hidden="true">🎙️</span>
          <strong className={styles.voiceHotlineTitle}>How 2-Way Field Voice Hotline Works</strong>
        </div>
        <p className={styles.voiceHotlineDesc}>
          Adding a phone number to any crew member allows them to call your main business number from the road to update job scopes, log materials, and record change orders hands-free.
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Link href="/dashboard/voice-calls" className={styles.voiceHotlineLink}>
          View Voice Assistant →
        </Link>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss voice hotline banner"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#e2e8f0',
            cursor: 'pointer',
            fontSize: '1rem',
            padding: '0.25rem 0.5rem',
            lineHeight: 1,
            borderRadius: '0.25rem',
          }}
          title="Dismiss banner"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

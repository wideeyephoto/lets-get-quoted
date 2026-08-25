'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { trackDemoEvent } from '@/lib/demo-analytics';

export default function DemoTourPromptCard() {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('lgq_tour_prompt_dismissed');
      if (stored === 'true') {
        setDismissed(true);
      }
    } catch {
      // Ignore
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    trackDemoEvent('explore_freely', { source: 'prompt_dismiss' });
    try {
      sessionStorage.setItem('lgq_tour_prompt_dismissed', 'true');
    } catch {
      // Ignore
    }
  };

  if (dismissed) return null;

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #0d2738 0%, #071926 100%)',
        border: '1px solid rgba(80, 227, 189, 0.4)',
        borderRadius: '12px',
        padding: '20px clamp(16px, 3vw, 28px)',
        margin: '0 0 24px',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4), 0 0 15px rgba(80, 227, 189, 0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '20px',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ maxWidth: '680px' }}>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 800,
            color: '#50e3bd',
            letterSpacing: '1px',
            textTransform: 'uppercase',
            display: 'inline-block',
            marginBottom: '4px',
          }}
        >
          ✨ New: 5-Minute Evaluation Journey
        </span>
        <h2 style={{ fontSize: '19px', fontWeight: 800, color: '#ffffff', margin: '0 0 6px' }}>
          Evaluate the complete contractor workflow in 5 minutes
        </h2>
        <p style={{ fontSize: '13.5px', color: '#b5ccd8', margin: 0, lineHeight: '1.5' }}>
          Experience one realistic job lifecycle from homeowner website inquiry and 24/7 AI intake to e-signed quote and paid Apple Pay deposit.
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <Link
          href="/demo/tour/site"
          onClick={() => trackDemoEvent('tour_started', { source: 'dashboard_prompt' })}
          style={{
            background: 'var(--orange, #ff6a24)',
            color: '#0b1e2a',
            fontSize: '14px',
            fontWeight: 800,
            padding: '10px 20px',
            borderRadius: '6px',
            textDecoration: 'none',
            boxShadow: '0 3px 12px rgba(255, 106, 36, 0.4)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          Start the 5-minute tour &rarr;
        </Link>
        <button
          type="button"
          onClick={handleDismiss}
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: '#d1e2eb',
            fontSize: '13px',
            fontWeight: 600,
            padding: '10px 16px',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Explore dashboard freely
        </button>
      </div>
    </div>
  );
}

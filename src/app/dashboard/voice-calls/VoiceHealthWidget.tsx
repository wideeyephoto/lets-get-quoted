'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { displayPhone } from '@/lib/phone';
import styles from './voice-calls.module.css';

type HealthData = {
  ok: boolean;
  status: 'healthy' | 'not_ready' | 'degraded' | 'unavailable';
  latencyMs: number;
  engine: string;
  activeNumber: string | null;
  routeState: string;
  notReadyReason: string | null;
  totalCallsLogged: number;
  toolsActive: number;
  securityGuard: string;
  checkedAt: string;
};

export default function VoiceHealthWidget({ availableCredits }: { availableCredits?: number | null }) {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkHealth(signal?: AbortSignal) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/voice/health', { signal });
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      } else {
        setError('System check failed with status ' + res.status);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('System check timed out after 8s. Please retry.');
      } else {
        setError('Unable to reach system check service. Please retry.');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    checkHealth(controller.signal).finally(() => clearTimeout(timeoutId));

    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, []);

  if (error && !health) {
    return (
      <div className={styles.healthWidget} role="alert">
        <div className={styles.healthItem}>
          <span className={styles.healthPulseDot} style={{ background: '#ef4444' }} />
          <span style={{ color: '#f87171' }}>{error}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);
            checkHealth(controller.signal).finally(() => clearTimeout(timeoutId));
          }}
          disabled={loading}
          className={styles.healthRefreshBtn}
        >
          {loading ? 'Checking…' : '🔄 Retry Check'}
        </button>
      </div>
    );
  }

  if (!health) {
    return (
      <div className={styles.healthWidget}>
        <div className={styles.healthItem}>
          <span className={styles.healthPulseDot} style={{ background: '#3b82f6' }} />
          <span>Verifying SignalWire SWML &amp; Voice Workspace Readiness…</span>
        </div>
      </div>
    );
  }

  const isHealthy = health.status === 'healthy';
  const isNotReady = health.status === 'not_ready';
  const isDegraded = health.status === 'degraded';

  const dotColor = isHealthy
    ? '#22c55e'
    : isNotReady
    ? '#f59e0b'
    : isDegraded
    ? '#ef4444'
    : '#94a3b8';

  const engineStatusLabel = isHealthy
    ? 'Operational'
    : isNotReady
    ? 'Standby (Line Not Connected)'
    : isDegraded
    ? 'Carrier Degraded'
    : 'Unavailable';

  const engineStatusColor = isHealthy
    ? '#4ade80'
    : isNotReady
    ? '#fbbf24'
    : isDegraded
    ? '#f87171'
    : '#94a3b8';

  return (
    <div className={styles.healthWidget} role="region" aria-label="AI Voice Workspace Health">
      <div className={styles.healthCluster}>
        <div className={styles.healthItem}>
          <span
            className={styles.healthPulseDot}
            style={{
              background: dotColor,
              boxShadow: `0 0 8px ${dotColor}`,
            }}
          />
          <strong>SWML Engine Status:</strong>
          <span style={{ color: engineStatusColor, fontWeight: 600 }}>
            {engineStatusLabel}
          </span>
        </div>

        <div className={styles.healthItem}>
          <span>Dedicated Line:</span>
          {health.activeNumber ? (
            <code style={{ fontSize: '0.8rem', color: '#93c5fd' }}>
              {displayPhone(health.activeNumber)}
            </code>
          ) : (
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              None Assigned{' '}
              <Link
                href="/dashboard/automations#ai-receptionist"
                style={{ color: '#60a5fa', textDecoration: 'underline', marginLeft: '0.25rem' }}
              >
                (Setup Required)
              </Link>
            </span>
          )}
        </div>

        <div className={styles.healthItem}>
          <span>DB Latency:</span>
          <span className={styles.healthLatencyBadge}>{health.latencyMs}ms</span>
        </div>

        <div className={styles.healthItem}>
          <span>Registered AI Tools:</span>
          <strong style={{ color: isHealthy ? '#60a5fa' : '#94a3b8' }}>
            {isHealthy ? health.toolsActive : health.toolsActive > 0 ? health.toolsActive : '0 (Offline)'}
          </strong>
        </div>

        {typeof availableCredits === 'number' ? (
          <div className={styles.healthItem}>
            <span>Voice Intake Credits:</span>
            <strong style={{ color: availableCredits <= 25 ? '#fbbf24' : '#60a5fa' }}>
              <span aria-hidden="true">⚡</span> {availableCredits.toLocaleString('en-US')}
            </strong>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          checkHealth(controller.signal).finally(() => clearTimeout(timeoutId));
        }}
        disabled={loading}
        className={styles.healthRefreshBtn}
        title="Check workspace database response time and route readiness"
      >
        {loading ? 'Checking…' : '⚡ Workspace Check'}
      </button>
    </div>
  );
}


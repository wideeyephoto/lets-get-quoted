'use client';

import { useState, useEffect } from 'react';
import styles from './voice-calls.module.css';

type HealthData = {
  ok: boolean;
  status: 'healthy' | 'degraded';
  latencyMs: number;
  engine: string;
  activeNumber: string;
  routeState: string;
  totalCallsLogged: number;
  toolsActive: number;
  securityGuard: string;
  checkedAt: string;
};

export default function VoiceHealthWidget() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(false);

  async function checkHealth() {
    setLoading(true);
    try {
      const res = await fetch('/api/voice/health');
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      }
    } catch {
      // quiet fallback
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    checkHealth();
  }, []);

  if (!health) {
    return (
      <div className={styles.healthWidget}>
        <div className={styles.healthItem}>
          <span className={styles.healthPulseDot} style={{ background: '#3b82f6' }} />
          <span>Connecting to SignalWire SWML Engine...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.healthWidget} role="region" aria-label="AI Voice Carrier Health">
      <div className={styles.healthCluster}>
        <div className={styles.healthItem}>
          <span
            className={styles.healthPulseDot}
            style={{
              background: health.status === 'healthy' ? '#22c55e' : '#f59e0b',
              boxShadow: health.status === 'healthy' ? '0 0 8px #22c55e' : '0 0 8px #f59e0b',
            }}
          />
          <strong>SignalWire SWML Engine:</strong>
          <span style={{ color: '#4ade80', fontWeight: 600 }}>
            {health.status === 'healthy' ? 'Operational' : 'Degraded'}
          </span>
        </div>

        <div className={styles.healthItem}>
          <span>Latency:</span>
          <span className={styles.healthLatencyBadge}>{health.latencyMs}ms</span>
        </div>

        <div className={styles.healthItem}>
          <span>Dedicated Line:</span>
          <code style={{ fontSize: '0.8rem', color: '#93c5fd' }}>{health.activeNumber}</code>
        </div>

        <div className={styles.healthItem}>
          <span>Active SWAIG Tools:</span>
          <strong style={{ color: '#60a5fa' }}>{health.toolsActive}</strong>
        </div>
      </div>

      <button
        type="button"
        onClick={checkHealth}
        disabled={loading}
        className={styles.healthRefreshBtn}
        title="Check Carrier Webhook Response Time"
      >
        {loading ? 'Pinging…' : '⚡ Ping Carrier'}
      </button>
    </div>
  );
}

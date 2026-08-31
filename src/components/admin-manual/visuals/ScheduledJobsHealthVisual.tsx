import React from 'react';

export function ScheduledJobsHealthVisual() {
  return (
    <div className="manual-visual-container" style={{ margin: '1.5rem 0', background: 'var(--admin-surface, #0f172a)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--admin-border, #334155)' }}>
      <svg
        viewBox="0 0 800 390"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label="Scheduled Jobs and Operational Health Matrix"
      >
        <rect width="800" height="390" rx="8" fill="#0b1329" />

        <text x="400" y="35" fill="#f8fafc" fontSize="14" fontWeight="600" textAnchor="middle">Operational Cron & Worker Schedule Matrix</text>

        {/* Row 1: High Frequency (Every 1-5 mins) */}
        <rect x="40" y="55" width="720" height="65" rx="6" fill="#1e293b" stroke="#38bdf8" strokeWidth="1.5" />
        <text x="60" y="80" fill="#38bdf8" fontSize="12" fontWeight="600">Every 1–5 Minutes (Critical Real-Time Engines)</text>
        <text x="60" y="100" fill="#cbd5e1" fontSize="11">
          • Stripe Projection Coordinator (claimed batches) • SMS Delivery Worker • SMS Inbound Actions • Direct Payment Settlement
        </text>

        {/* Row 2: Medium Frequency (Hourly / Quad-Hourly) */}
        <rect x="40" y="130" width="720" height="65" rx="6" fill="#1e293b" stroke="#34d399" strokeWidth="1.5" />
        <text x="60" y="155" fill="#34d399" fontSize="12" fontWeight="600">Hourly / 4-Hourly (Reconcilers & Lifecycle)</text>
        <text x="60" y="175" fill="#cbd5e1" fontSize="11">
          • Late-Success Payment Reconciler • Quick Stop Auto-Refund Sweep • Appointment Reminder Sweep • AI Operator Cycle
        </text>

        {/* Row 3: Daily / Monthly (Settlement & Allowance) */}
        <rect x="40" y="205" width="720" height="65" rx="6" fill="#1e293b" stroke="#f59e0b" strokeWidth="1.5" />
        <text x="60" y="230" fill="#fbbf24" fontSize="12" fontWeight="600">Daily & Monthly (Billing & Usage Cadence)</text>
        <text x="60" y="250" fill="#cbd5e1" fontSize="11">
          • Monthly Allowance Reset Worker (Voice / SMS pool replenishment) • Contractor Lifecycle Emails • Dunning Grace Sweep
        </text>

        {/* Health Monitoring & Dead Letters */}
        <rect x="40" y="280" width="720" height="85" rx="6" fill="#1e293b" stroke="#8b5cf6" strokeWidth="2" />
        <text x="400" y="305" fill="#c4b5fd" fontSize="13" fontWeight="600" textAnchor="middle">Health Verification & Dead Letter Deadlock Detection</text>
        <text x="400" y="325" fill="#cbd5e1" fontSize="11" textAnchor="middle">
          All workers log execution records with claimed count, processed count, and failures.
        </text>
        <text x="400" y="345" fill="#94a3b8" fontSize="11" textAnchor="middle">
          Inspect via /admin/health and /admin/failures · Alerting triggers on cron silence &gt; 15 mins.
        </text>
      </svg>
      <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: '#94a3b8' }}>
        <strong>Figure 7:</strong> Background cron execution schedule and health monitoring matrix.
      </div>
    </div>
  );
}

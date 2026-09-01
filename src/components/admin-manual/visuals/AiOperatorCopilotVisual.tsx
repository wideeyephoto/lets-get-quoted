import React from 'react';

export function AiOperatorCopilotVisual() {
  return (
    <div
      className="manual-visual-container"
      style={{
        margin: '1.5rem 0',
        background: 'var(--admin-surface, #0f172a)',
        padding: '1.25rem',
        borderRadius: '8px',
        border: '1px solid var(--admin-border, #334155)',
      }}
    >
      <svg
        viewBox="0 0 800 400"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label="AI Operator and Support Copilot Triage Pipeline"
      >
        <rect width="800" height="400" rx="8" fill="#0b1329" />

        {/* Phase 1: Intake & Ingestion */}
        <rect x="30" y="30" width="220" height="95" rx="6" fill="#1e293b" stroke="#38bdf8" strokeWidth="1.5" />
        <text x="140" y="55" fill="#38bdf8" fontSize="13" fontWeight="600" textAnchor="middle">
          1. Signal Ingestion & Audit
        </text>
        <text x="140" y="75" fill="#cbd5e1" fontSize="11" textAnchor="middle">
          Inbound Ticket / Onboarding Alert
        </text>
        <text x="140" y="93" fill="#94a3b8" fontSize="10" textAnchor="middle">
          Account Context & Timeline Assembled
        </text>
        <text x="140" y="110" fill="#64748b" fontSize="9" textAnchor="middle">
          writes operator_audit_logs row
        </text>

        {/* Phase 2: Diagnostic Check */}
        <rect x="290" y="30" width="220" height="95" rx="6" fill="#1e293b" stroke="#8b5cf6" strokeWidth="1.5" />
        <text x="400" y="55" fill="#c4b5fd" fontSize="13" fontWeight="600" textAnchor="middle">
          2. Blocker Diagnostics
        </text>
        <text x="400" y="75" fill="#cbd5e1" fontSize="11" textAnchor="middle">
          • Stripe KYC (charges_enabled)
        </text>
        <text x="400" y="93" fill="#cbd5e1" fontSize="11" textAnchor="middle">
          • SMS Sender Active / 10DLC
        </text>
        <text x="400" y="110" fill="#cbd5e1" fontSize="11" textAnchor="middle">
          • Quote & First Job Milestones
        </text>

        {/* Phase 3: Sentiment & Confidence Gating */}
        <rect x="550" y="30" width="220" height="95" rx="6" fill="#1e293b" stroke="#f59e0b" strokeWidth="1.5" />
        <text x="660" y="55" fill="#fbbf24" fontSize="13" fontWeight="600" textAnchor="middle">
          3. Confidence & Triage Gate
        </text>
        <text x="660" y="75" fill="#cbd5e1" fontSize="11" textAnchor="middle">
          AI Confidence Score (0 - 100%)
        </text>
        <text x="660" y="93" fill="#94a3b8" fontSize="10" textAnchor="middle">
          Sentiment: Frustrated / Urgent / Neutral
        </text>
        <text x="660" y="110" fill="#94a3b8" fontSize="10" textAnchor="middle">
          Classification: Billing / Tech / Onboard
        </text>

        <line x1="250" y1="77" x2="290" y2="77" stroke="#64748b" strokeWidth="2" />
        <line x1="510" y1="77" x2="550" y2="77" stroke="#64748b" strokeWidth="2" />

        {/* Flow branches */}
        <rect x="30" y="155" width="740" height="215" rx="6" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
        <text x="400" y="180" fill="#f8fafc" fontSize="14" fontWeight="600" textAnchor="middle">
          Human-in-the-Loop Operator Intervention Matrix
        </text>

        {/* Branch 1: High Confidence */}
        <rect x="50" y="200" width="215" height="150" rx="4" fill="#0f172a" stroke="#10b981" />
        <text x="157" y="223" fill="#34d399" fontSize="12" fontWeight="600" textAnchor="middle">
          Confidence ≥ 75%
        </text>
        <text x="157" y="245" fill="#cbd5e1" fontSize="10" textAnchor="middle">
          Auto-Draft Suggested Reply
        </text>
        <text x="157" y="265" fill="#94a3b8" fontSize="10" textAnchor="middle">
          1-Click Staff One-Touch Send
        </text>
        <text x="157" y="285" fill="#94a3b8" fontSize="10" textAnchor="middle">
          Attaches direct deep-links
        </text>
        <text x="157" y="315" fill="#34d399" fontSize="10" fontWeight="600" textAnchor="middle">
          Fast-path resolution (&lt; 2m)
        </text>

        {/* Branch 2: Ambiguous / Low Confidence */}
        <rect x="292" y="200" width="215" height="150" rx="4" fill="#0f172a" stroke="#f59e0b" />
        <text x="399" y="223" fill="#fbbf24" fontSize="12" fontWeight="600" textAnchor="middle">
          Confidence &lt; 75% or Mixed
        </text>
        <text x="399" y="245" fill="#cbd5e1" fontSize="10" textAnchor="middle">
          Flagged for Human Triage
        </text>
        <text x="399" y="265" fill="#94a3b8" fontSize="10" textAnchor="middle">
          Staff modifies drafted steps
        </text>
        <text x="399" y="285" fill="#94a3b8" fontSize="10" textAnchor="middle">
          Queries custom account telemetry
        </text>
        <text x="399" y="315" fill="#fbbf24" fontSize="10" fontWeight="600" textAnchor="middle">
          Human verification required
        </text>

        {/* Branch 3: High Risk / Escalation */}
        <rect x="535" y="200" width="215" height="150" rx="4" fill="#0f172a" stroke="#ef4444" />
        <text x="642" y="223" fill="#f87171" fontSize="12" fontWeight="600" textAnchor="middle">
          Frustrated / Financial Risk
        </text>
        <text x="642" y="245" fill="#cbd5e1" fontSize="10" textAnchor="middle">
          Immediate P1 Escalation
        </text>
        <text x="642" y="265" fill="#94a3b8" fontSize="10" textAnchor="middle">
          Routes to Tier-2 Support / Lead
        </text>
        <text x="642" y="285" fill="#94a3b8" fontSize="10" textAnchor="middle">
          Suppresses automated bot responses
        </text>
        <text x="642" y="315" fill="#ef4444" fontSize="10" fontWeight="600" textAnchor="middle">
          Senior staff intervention
        </text>
      </svg>
      <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: '#94a3b8' }}>
        <strong>Figure 9:</strong> AI Operator and Support Copilot triage lifecycle, blocker diagnostic tree, and confidence-gated human intervention matrix.
      </div>
    </div>
  );
}

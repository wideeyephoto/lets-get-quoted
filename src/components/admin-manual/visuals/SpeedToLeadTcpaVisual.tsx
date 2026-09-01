import React from 'react';

export function SpeedToLeadTcpaVisual() {
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
        aria-label="Speed-to-Lead and Multi-Jurisdiction TCPA Compliance Pipeline"
      >
        <rect width="800" height="400" rx="8" fill="#0b1329" />

        {/* Phase 1: Inbound Lead Intake */}
        <rect x="30" y="30" width="220" height="95" rx="6" fill="#1e293b" stroke="#38bdf8" strokeWidth="1.5" />
        <text x="140" y="55" fill="#38bdf8" fontSize="13" fontWeight="600" textAnchor="middle">
          1. Inbound Lead Intake
        </text>
        <text x="140" y="75" fill="#cbd5e1" fontSize="11" textAnchor="middle">
          Ad Click / Form / Call
        </text>
        <text x="140" y="93" fill="#94a3b8" fontSize="10" textAnchor="middle">
          Captures phone, address & urgency
        </text>
        <text x="140" y="110" fill="#64748b" fontSize="9" textAnchor="middle">
          Halo neighborhood attribution
        </text>

        {/* Phase 2: Jurisdiction & Timezone Resolution */}
        <rect x="290" y="30" width="220" height="95" rx="6" fill="#1e293b" stroke="#8b5cf6" strokeWidth="1.5" />
        <text x="400" y="55" fill="#c4b5fd" fontSize="13" fontWeight="600" textAnchor="middle">
          2. Timezone & Jurisdiction
        </text>
        <text x="400" y="75" fill="#cbd5e1" fontSize="11" textAnchor="middle">
          Area code + State code resolution
        </text>
        <text x="400" y="93" fill="#cbd5e1" fontSize="11" textAnchor="middle">
          Detects FL / OK / WA / MD laws
        </text>
        <text x="400" y="110" fill="#64748b" fontSize="9" textAnchor="middle">
          resolveRecipientTimeZoneWithSource
        </text>

        {/* Phase 3: Quiet Hours Decision */}
        <rect x="550" y="30" width="220" height="95" rx="6" fill="#1e293b" stroke="#f59e0b" strokeWidth="1.5" />
        <text x="660" y="55" fill="#fbbf24" fontSize="13" fontWeight="600" textAnchor="middle">
          3. TCPA Gatekeeper
        </text>
        <text x="660" y="75" fill="#cbd5e1" fontSize="11" textAnchor="middle">
          State Mini-TCPA: 8:00 AM – 8:00 PM
        </text>
        <text x="660" y="93" fill="#94a3b8" fontSize="10" textAnchor="middle">
          Federal TCPA: 8:00 AM – 9:00 PM
        </text>
        <text x="660" y="110" fill="#94a3b8" fontSize="10" textAnchor="middle">
          Checks recipient local clock
        </text>

        <line x1="250" y1="77" x2="290" y2="77" stroke="#64748b" strokeWidth="2" />
        <line x1="510" y1="77" x2="550" y2="77" stroke="#64748b" strokeWidth="2" />

        {/* Operational Dispatch Matrix */}
        <rect x="30" y="155" width="740" height="215" rx="6" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
        <text x="400" y="180" fill="#f8fafc" fontSize="14" fontWeight="600" textAnchor="middle">
          Dispatch Pathways & Compliance Protection
        </text>

        {/* Daytime / Fast Dispatch */}
        <rect x="50" y="200" width="335" height="150" rx="4" fill="#0f172a" stroke="#10b981" />
        <text x="217" y="223" fill="#34d399" fontSize="12" fontWeight="600" textAnchor="middle">
          Daytime Window (Compliant)
        </text>
        <text x="217" y="245" fill="#cbd5e1" fontSize="10" textAnchor="middle">
          ⚡ Sub-60 Second Instant Dispatch
        </text>
        <text x="217" y="265" fill="#94a3b8" fontSize="10" textAnchor="middle">
          • Auto SMS sent to Homeowner with quote preview link
        </text>
        <text x="217" y="285" fill="#94a3b8" fontSize="10" textAnchor="middle">
          • Instant push alert & SMS to Contractor hotline
        </text>
        <text x="217" y="305" fill="#94a3b8" fontSize="10" textAnchor="middle">
          • Full opt-out compliance footer appended (STOP to cancel)
        </text>
        <text x="217" y="330" fill="#34d399" fontSize="10" fontWeight="600" textAnchor="middle">
          Dispatch Speed: 12 - 45 seconds average
        </text>

        {/* Nighttime / Scheduled Release */}
        <rect x="415" y="200" width="335" height="150" rx="4" fill="#0f172a" stroke="#f59e0b" />
        <text x="582" y="223" fill="#fbbf24" fontSize="12" fontWeight="600" textAnchor="middle">
          Quiet Hours (Nighttime Hold)
        </text>
        <text x="582" y="245" fill="#cbd5e1" fontSize="10" textAnchor="middle">
          🌙 Enqueued for Compliant Morning Release
        </text>
        <text x="582" y="265" fill="#94a3b8" fontSize="10" textAnchor="middle">
          • Holds homeowner marketing SMS until 8:01 AM local time
        </text>
        <text x="582" y="285" fill="#94a3b8" fontSize="10" textAnchor="middle">
          • Contractor portal receives silent dashboard lead notification
        </text>
        <text x="582" y="305" fill="#94a3b8" fontSize="10" textAnchor="middle">
          • Prevents statutory TCPA $500–$1,500 statutory penalties
        </text>
        <text x="582" y="330" fill="#fbbf24" fontSize="10" fontWeight="600" textAnchor="middle">
          Compliance Rate: 100% Zero-Violation Guarantee
        </text>
      </svg>
      <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: '#94a3b8' }}>
        <strong>Figure 11:</strong> Speed-to-Lead execution flow, multi-jurisdiction TCPA quiet hours gatekeeper (Federal vs FL/OK/WA/MD State Mini-TCPA), and morning queue release mechanism.
      </div>
    </div>
  );
}

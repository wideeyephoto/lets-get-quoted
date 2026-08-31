import React from 'react';

export function LeadToPaidLifecycleVisual() {
  return (
    <div className="manual-visual-container" style={{ margin: '1.5rem 0', background: 'var(--admin-surface, #0f172a)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--admin-border, #334155)' }}>
      <svg
        viewBox="0 0 800 380"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label="Lead to Paid Job Lifecycle Swimlane"
      >
        <rect width="800" height="380" rx="8" fill="#0b1329" />

        {/* Column Headers */}
        <text x="90" y="35" fill="#38bdf8" fontSize="12" fontWeight="600" textAnchor="middle">1. Intake</text>
        <text x="240" y="35" fill="#a78bfa" fontSize="12" fontWeight="600" textAnchor="middle">2. Estimating</text>
        <text x="390" y="35" fill="#34d399" fontSize="12" fontWeight="600" textAnchor="middle">3. Booking & Dispatch</text>
        <text x="540" y="35" fill="#fbbf24" fontSize="12" fontWeight="600" textAnchor="middle">4. Execution</text>
        <text x="690" y="35" fill="#f472b6" fontSize="12" fontWeight="600" textAnchor="middle">5. Invoicing & Pay</text>

        <line x1="20" y1="45" x2="780" y2="45" stroke="#334155" strokeWidth="1" />

        {/* Swimlane 1: Customer */}
        <text x="30" y="100" fill="#94a3b8" fontSize="11" fontWeight="600">Customer</text>
        <rect x="35" y="120" width="110" height="50" rx="6" fill="#1e293b" stroke="#38bdf8" />
        <text x="90" y="142" fill="#f1f5f9" fontSize="11" textAnchor="middle">Submits Form /</text>
        <text x="90" y="157" fill="#f1f5f9" fontSize="11" textAnchor="middle">SMS Request</text>

        <rect x="185" y="120" width="110" height="50" rx="6" fill="#1e293b" stroke="#a78bfa" />
        <text x="240" y="142" fill="#f1f5f9" fontSize="11" textAnchor="middle">Reviews Online</text>
        <text x="240" y="157" fill="#f1f5f9" fontSize="11" textAnchor="middle">Quote & Options</text>

        <rect x="335" y="120" width="110" height="50" rx="6" fill="#1e293b" stroke="#34d399" />
        <text x="390" y="142" fill="#f1f5f9" fontSize="11" textAnchor="middle">Accepts & Signs,</text>
        <text x="390" y="157" fill="#f1f5f9" fontSize="11" textAnchor="middle">Pays Deposit</text>

        <rect x="485" y="120" width="110" height="50" rx="6" fill="#1e293b" stroke="#fbbf24" />
        <text x="540" y="142" fill="#f1f5f9" fontSize="11" textAnchor="middle">Receives Arrival</text>
        <text x="540" y="157" fill="#f1f5f9" fontSize="11" textAnchor="middle">SMS & Tracking</text>

        <rect x="635" y="120" width="110" height="50" rx="6" fill="#1e293b" stroke="#f472b6" />
        <text x="690" y="142" fill="#f1f5f9" fontSize="11" textAnchor="middle">Pays via Card /</text>
        <text x="690" y="157" fill="#f1f5f9" fontSize="11" textAnchor="middle">ACH / Quick Stop</text>

        {/* Swimlane 2: Contractor */}
        <text x="30" y="240" fill="#94a3b8" fontSize="11" fontWeight="600">Contractor</text>
        <rect x="35" y="260" width="110" height="50" rx="6" fill="#1e293b" stroke="#38bdf8" />
        <text x="90" y="282" fill="#f1f5f9" fontSize="11" textAnchor="middle">AI Smart Intake /</text>
        <text x="90" y="297" fill="#f1f5f9" fontSize="11" textAnchor="middle">Lead Priority</text>

        <rect x="185" y="260" width="110" height="50" rx="6" fill="#1e293b" stroke="#a78bfa" />
        <text x="240" y="282" fill="#f1f5f9" fontSize="11" textAnchor="middle">Builds Tiered</text>
        <text x="240" y="297" fill="#f1f5f9" fontSize="11" textAnchor="middle">Quote & Dispatches</text>

        <rect x="335" y="260" width="110" height="50" rx="6" fill="#1e293b" stroke="#34d399" />
        <text x="390" y="282" fill="#f1f5f9" fontSize="11" textAnchor="middle">Schedules Crew &</text>
        <text x="390" y="297" fill="#f1f5f9" fontSize="11" textAnchor="middle">Route Density</text>

        <rect x="485" y="260" width="110" height="50" rx="6" fill="#1e293b" stroke="#fbbf24" />
        <text x="540" y="282" fill="#f1f5f9" fontSize="11" textAnchor="middle">Crew Field App:</text>
        <text x="540" y="297" fill="#f1f5f9" fontSize="11" textAnchor="middle">Photos & Time</text>

        <rect x="635" y="260" width="110" height="50" rx="6" fill="#1e293b" stroke="#f472b6" />
        <text x="690" y="282" fill="#f1f5f9" fontSize="11" textAnchor="middle">Settles Invoice &</text>
        <text x="690" y="297" fill="#f1f5f9" fontSize="11" textAnchor="middle">Receives Payout</text>

        {/* Horizontal Connector Line */}
        <line x1="145" y1="145" x2="185" y2="145" stroke="#64748b" strokeWidth="2" />
        <line x1="295" y1="145" x2="335" y2="145" stroke="#64748b" strokeWidth="2" />
        <line x1="445" y1="145" x2="485" y2="145" stroke="#64748b" strokeWidth="2" />
        <line x1="595" y1="145" x2="635" y2="145" stroke="#64748b" strokeWidth="2" />

        <line x1="90" y1="170" x2="90" y2="260" stroke="#64748b" strokeWidth="1.5" strokeDasharray="3 3" />
        <line x1="240" y1="260" x2="240" y2="170" stroke="#64748b" strokeWidth="1.5" strokeDasharray="3 3" />
        <line x1="390" y1="170" x2="390" y2="260" stroke="#64748b" strokeWidth="1.5" strokeDasharray="3 3" />
        <line x1="690" y1="170" x2="690" y2="260" stroke="#64748b" strokeWidth="1.5" strokeDasharray="3 3" />
      </svg>
      <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: '#94a3b8' }}>
        <strong>Figure 3:</strong> Swimlane diagram of the complete Lead-to-Paid-Job operational journey.
      </div>
    </div>
  );
}

import React from 'react';

export function IncidentInvestigationVisual() {
  return (
    <div className="manual-visual-container" style={{ margin: '1.5rem 0', background: 'var(--admin-surface, #0f172a)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--admin-border, #334155)' }}>
      <svg
        viewBox="0 0 800 400"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label="Incident Investigation and Triage Decision Tree"
      >
        <rect width="800" height="400" rx="8" fill="#0b1329" />

        {/* Step 1: Detect & Classify */}
        <rect x="40" y="30" width="220" height="90" rx="6" fill="#1e293b" stroke="#38bdf8" strokeWidth="1.5" />
        <text x="150" y="55" fill="#38bdf8" fontSize="13" fontWeight="600" textAnchor="middle">1. Detect & Classify</text>
        <text x="150" y="75" fill="#cbd5e1" fontSize="11" textAnchor="middle">Symptom Reported</text>
        <text x="150" y="93" fill="#94a3b8" fontSize="10" textAnchor="middle">P1 (Money/Outage) vs P2/P3</text>

        {/* Step 2: Evidence & Isolation */}
        <rect x="290" y="30" width="220" height="90" rx="6" fill="#1e293b" stroke="#f59e0b" strokeWidth="1.5" />
        <text x="400" y="55" fill="#fbbf24" fontSize="13" fontWeight="600" textAnchor="middle">2. Evidence & Isolate</text>
        <text x="400" y="75" fill="#cbd5e1" fontSize="11" textAnchor="middle">Check /admin/failures</text>
        <text x="400" y="93" fill="#94a3b8" fontSize="10" textAnchor="middle">Do NOT mutate before logs captured</text>

        {/* Step 3: Mitigation */}
        <rect x="540" y="30" width="220" height="90" rx="6" fill="#1e293b" stroke="#10b981" strokeWidth="1.5" />
        <text x="650" y="55" fill="#34d399" fontSize="13" fontWeight="600" textAnchor="middle">3. Bounded Mitigation</text>
        <text x="650" y="75" fill="#cbd5e1" fontSize="11" textAnchor="middle">Single Bounded Action</text>
        <text x="650" y="93" fill="#94a3b8" fontSize="10" textAnchor="middle">Circuit Breaker / Rollback</text>

        <line x1="260" y1="75" x2="290" y2="75" stroke="#64748b" strokeWidth="2" />
        <line x1="510" y1="75" x2="540" y2="75" stroke="#64748b" strokeWidth="2" />

        {/* Decision branches */}
        <rect x="40" y="150" width="720" height="215" rx="6" fill="#1e293b" stroke="#8b5cf6" strokeWidth="2" />
        <text x="400" y="175" fill="#c4b5fd" fontSize="14" fontWeight="600" textAnchor="middle">Incident Escalation & Root-Cause Pathways</text>

        {/* Branch 1: Payment issue */}
        <rect x="60" y="195" width="210" height="145" rx="4" fill="#0f172a" stroke="#475569" />
        <text x="165" y="218" fill="#38bdf8" fontSize="12" fontWeight="600" textAnchor="middle">Stripe / Billing Degradation</text>
        <text x="165" y="240" fill="#cbd5e1" fontSize="10" textAnchor="middle">1. Check /admin/billing-operations</text>
        <text x="165" y="260" fill="#cbd5e1" fontSize="10" textAnchor="middle">2. Check webhook dead letters</text>
        <text x="165" y="280" fill="#cbd5e1" fontSize="10" textAnchor="middle">3. Run late-success reconciler</text>
        <text x="165" y="300" fill="#cbd5e1" fontSize="10" textAnchor="middle">4. Escalate to Finance / Ops lead</text>

        {/* Branch 2: SMS Provider issue */}
        <rect x="295" y="195" width="210" height="145" rx="4" fill="#0f172a" stroke="#475569" />
        <text x="400" y="218" fill="#34d399" fontSize="12" fontWeight="600" textAnchor="middle">SignalWire / Delivery Fail</text>
        <text x="400" y="240" fill="#cbd5e1" fontSize="10" textAnchor="middle">1. Check /admin/messaging failure rate</text>
        <text x="400" y="260" fill="#cbd5e1" fontSize="10" textAnchor="middle">2. Verify 10DLC registration status</text>
        <text x="400" y="280" fill="#cbd5e1" fontSize="10" textAnchor="middle">3. Check shared sender fallback</text>
        <text x="400" y="300" fill="#cbd5e1" fontSize="10" textAnchor="middle">4. Escalate to Ops lead</text>

        {/* Branch 3: Data Loss / Outage */}
        <rect x="530" y="195" width="210" height="145" rx="4" fill="#0f172a" stroke="#ef4444" />
        <text x="635" y="218" fill="#f87171" fontSize="12" fontWeight="600" textAnchor="middle">Database / Core Outage (P1)</text>
        <text x="635" y="240" fill="#cbd5e1" fontSize="10" textAnchor="middle">1. Post notice on /admin/incidents</text>
        <text x="635" y="260" fill="#cbd5e1" fontSize="10" textAnchor="middle">2. Freeze mutating cron workers</text>
        <text x="635" y="280" fill="#cbd5e1" fontSize="10" textAnchor="middle">3. Inspect PITR restore readiness</text>
        <text x="635" y="300" fill="#cbd5e1" fontSize="10" textAnchor="middle">4. Escalate to Super Admin / Founder</text>
      </svg>
      <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: '#94a3b8' }}>
        <strong>Figure 8:</strong> Incident investigation decision tree and domain-specific mitigation pathways.
      </div>
    </div>
  );
}

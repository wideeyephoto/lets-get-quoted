import React from 'react';

export function RoutesTrustBoundariesVisual() {
  return (
    <div className="manual-visual-container" style={{ margin: '1.5rem 0', background: 'var(--admin-surface, #0f172a)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--admin-border, #334155)' }}>
      <svg
        viewBox="0 0 800 400"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label="Routes and Trust Boundaries Diagram"
      >
        <rect width="800" height="400" rx="8" fill="#0b1329" />

        {/* Boundary 1: Public Routes */}
        <rect x="30" y="30" width="165" height="340" rx="6" fill="#1e293b" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="4 4" />
        <text x="112" y="55" fill="#38bdf8" fontSize="13" fontWeight="600" textAnchor="middle">Public Zone</text>
        <text x="112" y="75" fill="#94a3b8" fontSize="10" textAnchor="middle">No Auth Required</text>
        <rect x="45" y="95" width="135" height="45" rx="4" fill="#0f172a" stroke="#475569" />
        <text x="112" y="122" fill="#e2e8f0" fontSize="11" textAnchor="middle">/ (Marketing)</text>
        <rect x="45" y="150" width="135" height="45" rx="4" fill="#0f172a" stroke="#475569" />
        <text x="112" y="177" fill="#e2e8f0" fontSize="11" textAnchor="middle">/quote/[id] (Client)</text>
        <rect x="45" y="205" width="135" height="45" rx="4" fill="#0f172a" stroke="#475569" />
        <text x="112" y="232" fill="#e2e8f0" fontSize="11" textAnchor="middle">/pay/[id] (Invoicing)</text>
        <rect x="45" y="260" width="135" height="45" rx="4" fill="#0f172a" stroke="#475569" />
        <text x="112" y="287" fill="#e2e8f0" fontSize="11" textAnchor="middle">/api/public/* (SSRF safe)</text>

        {/* Boundary 2: Tenant Owner / Crew */}
        <rect x="220" y="30" width="165" height="340" rx="6" fill="#1e293b" stroke="#10b981" strokeWidth="1.5" />
        <text x="302" y="55" fill="#34d399" fontSize="13" fontWeight="600" textAnchor="middle">Tenant Dashboard</text>
        <text x="302" y="75" fill="#94a3b8" fontSize="10" textAnchor="middle">requireOwnerContext()</text>
        <rect x="235" y="95" width="135" height="45" rx="4" fill="#0f172a" stroke="#475569" />
        <text x="302" y="122" fill="#e2e8f0" fontSize="11" textAnchor="middle">/dashboard/*</text>
        <rect x="235" y="150" width="135" height="45" rx="4" fill="#0f172a" stroke="#475569" />
        <text x="302" y="177" fill="#e2e8f0" fontSize="11" textAnchor="middle">/field / /crew/*</text>
        <rect x="235" y="205" width="135" height="45" rx="4" fill="#0f172a" stroke="#475569" />
        <text x="302" y="232" fill="#e2e8f0" fontSize="11" textAnchor="middle">RLS Isolation (account_id)</text>
        <rect x="235" y="260" width="135" height="45" rx="4" fill="#0f172a" stroke="#475569" />
        <text x="302" y="287" fill="#e2e8f0" fontSize="11" textAnchor="middle">Owner / Office Guard</text>

        {/* Boundary 3: Staff Console */}
        <rect x="410" y="30" width="175" height="340" rx="6" fill="#1e293b" stroke="#8b5cf6" strokeWidth="2" />
        <text x="497" y="55" fill="#a78bfa" fontSize="13" fontWeight="600" textAnchor="middle">Staff Console (/admin)</text>
        <text x="497" y="75" fill="#94a3b8" fontSize="10" textAnchor="middle">requireAdmin() · 404 Cloaking</text>
        <rect x="425" y="95" width="145" height="45" rx="4" fill="#0f172a" stroke="#6d28d9" />
        <text x="497" y="122" fill="#e2e8f0" fontSize="11" textAnchor="middle">/admin (Command Center)</text>
        <rect x="425" y="150" width="145" height="45" rx="4" fill="#0f172a" stroke="#6d28d9" />
        <text x="497" y="177" fill="#e2e8f0" fontSize="11" textAnchor="middle">requirePermission(...) gate</text>
        <rect x="425" y="205" width="145" height="45" rx="4" fill="#0f172a" stroke="#6d28d9" />
        <text x="497" y="232" fill="#e2e8f0" fontSize="11" textAnchor="middle">MFA AAL2 Step-Up</text>
        <rect x="425" y="260" width="145" height="45" rx="4" fill="#0f172a" stroke="#6d28d9" />
        <text x="497" y="287" fill="#e2e8f0" fontSize="11" textAnchor="middle">Full Admin Audit Logging</text>

        {/* Boundary 4: Webhook / Cron Token Gated */}
        <rect x="610" y="30" width="160" height="340" rx="6" fill="#1e293b" stroke="#f59e0b" strokeWidth="1.5" />
        <text x="690" y="55" fill="#fbbf24" fontSize="13" fontWeight="600" textAnchor="middle">System & Webhooks</text>
        <text x="690" y="75" fill="#94a3b8" fontSize="10" textAnchor="middle">Bearer CRON_SECRET / Sig</text>
        <rect x="625" y="95" width="130" height="45" rx="4" fill="#0f172a" stroke="#475569" />
        <text x="690" y="122" fill="#e2e8f0" fontSize="11" textAnchor="middle">/api/cron/*</text>
        <rect x="625" y="150" width="130" height="45" rx="4" fill="#0f172a" stroke="#475569" />
        <text x="690" y="177" fill="#e2e8f0" fontSize="11" textAnchor="middle">/api/webhooks/stripe</text>
        <rect x="625" y="205" width="130" height="45" rx="4" fill="#0f172a" stroke="#475569" />
        <text x="690" y="232" fill="#e2e8f0" fontSize="11" textAnchor="middle">/api/webhooks/sms</text>
        <rect x="625" y="260" width="130" height="45" rx="4" fill="#0f172a" stroke="#475569" />
        <text x="690" y="287" fill="#e2e8f0" fontSize="11" textAnchor="middle">Service-Role Ingestion</text>
      </svg>
      <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: '#94a3b8' }}>
        <strong>Figure 2:</strong> Network and application trust boundaries showing authorization gates, RLS boundaries, and token-verification patterns.
      </div>
    </div>
  );
}

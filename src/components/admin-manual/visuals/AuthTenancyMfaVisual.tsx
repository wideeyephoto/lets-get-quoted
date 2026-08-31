import React from 'react';

export function AuthTenancyMfaVisual() {
  return (
    <div className="manual-visual-container" style={{ margin: '1.5rem 0', background: 'var(--admin-surface, #0f172a)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--admin-border, #334155)' }}>
      <svg
        viewBox="0 0 800 390"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label="Staff Roles, Tenancy and MFA Decision Tree"
      >
        <rect width="800" height="390" rx="8" fill="#0b1329" />

        {/* Gate 1: Allowlist / Bootstrap */}
        <rect x="40" y="30" width="220" height="80" rx="6" fill="#1e293b" stroke="#38bdf8" strokeWidth="1.5" />
        <text x="150" y="55" fill="#38bdf8" fontSize="13" fontWeight="600" textAnchor="middle">Gate 1: ADMIN_EMAILS</text>
        <text x="150" y="75" fill="#cbd5e1" fontSize="11" textAnchor="middle">Environment Variable Allowlist</text>
        <text x="150" y="93" fill="#94a3b8" fontSize="10" textAnchor="middle">Missing/Unlisted → 404 Cloaking</text>

        {/* Gate 2: Database Staff Row */}
        <rect x="290" y="30" width="220" height="80" rx="6" fill="#1e293b" stroke="#10b981" strokeWidth="1.5" />
        <text x="400" y="55" fill="#34d399" fontSize="13" fontWeight="600" textAnchor="middle">Gate 2: staff Row (active)</text>
        <text x="400" y="75" fill="#cbd5e1" fontSize="11" textAnchor="middle">Database Role & Status Check</text>
        <text x="400" y="93" fill="#94a3b8" fontSize="10" textAnchor="middle">Inactive staff → Instant 404</text>

        {/* Gate 3: MFA Step-Up */}
        <rect x="540" y="30" width="220" height="80" rx="6" fill="#1e293b" stroke="#f59e0b" strokeWidth="1.5" />
        <text x="650" y="55" fill="#fbbf24" fontSize="13" fontWeight="600" textAnchor="middle">Gate 3: MFA (AAL2)</text>
        <text x="650" y="75" fill="#cbd5e1" fontSize="11" textAnchor="middle">Authenticator Assurance Level</text>
        <text x="650" y="93" fill="#94a3b8" fontSize="10" textAnchor="middle">Required for High-Risk Mutations</text>

        <line x1="260" y1="70" x2="290" y2="70" stroke="#64748b" strokeWidth="2" />
        <line x1="510" y1="70" x2="540" y2="70" stroke="#64748b" strokeWidth="2" />

        {/* Role Matrix */}
        <rect x="40" y="145" width="720" height="215" rx="6" fill="#1e293b" stroke="#8b5cf6" strokeWidth="2" />
        <text x="400" y="175" fill="#c4b5fd" fontSize="14" fontWeight="600" textAnchor="middle">Staff Role Matrix & Boundaries</text>

        {/* Columns for roles */}
        <rect x="60" y="195" width="125" height="145" rx="4" fill="#0f172a" stroke="#475569" />
        <text x="122" y="218" fill="#f8fafc" fontSize="12" fontWeight="600" textAnchor="middle">super_admin</text>
        <text x="122" y="240" fill="#94a3b8" fontSize="10" textAnchor="middle">All Permissions</text>
        <text x="122" y="260" fill="#94a3b8" fontSize="10" textAnchor="middle">account.delete</text>
        <text x="122" y="280" fill="#94a3b8" fontSize="10" textAnchor="middle">staff.manage</text>
        <text x="122" y="300" fill="#94a3b8" fontSize="10" textAnchor="middle">Production Scripts</text>

        <rect x="195" y="195" width="105" height="145" rx="4" fill="#0f172a" stroke="#475569" />
        <text x="247" y="218" fill="#f8fafc" fontSize="12" fontWeight="600" textAnchor="middle">support</text>
        <text x="247" y="240" fill="#94a3b8" fontSize="10" textAnchor="middle">account.support</text>
        <text x="247" y="260" fill="#94a3b8" fontSize="10" textAnchor="middle">account.export</text>
        <text x="247" y="280" fill="#94a3b8" fontSize="10" textAnchor="middle">privacy.manage</text>
        <text x="247" y="300" fill="#ef4444" fontSize="10" textAnchor="middle">No Money / Enforce</text>

        <rect x="310" y="195" width="105" height="145" rx="4" fill="#0f172a" stroke="#475569" />
        <text x="362" y="218" fill="#f8fafc" fontSize="12" fontWeight="600" textAnchor="middle">finance</text>
        <text x="362" y="240" fill="#94a3b8" fontSize="10" textAnchor="middle">money.refund</text>
        <text x="362" y="260" fill="#94a3b8" fontSize="10" textAnchor="middle">money.credit</text>
        <text x="362" y="280" fill="#94a3b8" fontSize="10" textAnchor="middle">money.payouts</text>
        <text x="362" y="300" fill="#94a3b8" fontSize="10" textAnchor="middle">money.plan</text>

        <rect x="425" y="195" width="105" height="145" rx="4" fill="#0f172a" stroke="#475569" />
        <text x="477" y="218" fill="#f8fafc" fontSize="12" fontWeight="600" textAnchor="middle">risk</text>
        <text x="477" y="240" fill="#94a3b8" fontSize="10" textAnchor="middle">account.support</text>
        <text x="477" y="260" fill="#94a3b8" fontSize="10" textAnchor="middle">account.enforce</text>
        <text x="477" y="280" fill="#94a3b8" fontSize="10" textAnchor="middle">Quick Stop Lock</text>
        <text x="477" y="300" fill="#ef4444" fontSize="10" textAnchor="middle">No Money Moves</text>

        <rect x="540" y="195" width="105" height="145" rx="4" fill="#0f172a" stroke="#475569" />
        <text x="592" y="218" fill="#f8fafc" fontSize="12" fontWeight="600" textAnchor="middle">ops</text>
        <text x="592" y="240" fill="#94a3b8" fontSize="10" textAnchor="middle">account.support</text>
        <text x="592" y="260" fill="#94a3b8" fontSize="10" textAnchor="middle">ops.manage</text>
        <text x="592" y="280" fill="#94a3b8" fontSize="10" textAnchor="middle">Webhook Deadletters</text>
        <text x="592" y="300" fill="#94a3b8" fontSize="10" textAnchor="middle">Releases & Incidents</text>

        <rect x="655" y="195" width="85" height="145" rx="4" fill="#0f172a" stroke="#475569" />
        <text x="697" y="218" fill="#f8fafc" fontSize="12" fontWeight="600" textAnchor="middle">read_only</text>
        <text x="697" y="250" fill="#94a3b8" fontSize="10" textAnchor="middle">Look only</text>
        <text x="697" y="270" fill="#ef4444" fontSize="10" textAnchor="middle">0 Actions</text>
        <text x="697" y="290" fill="#ef4444" fontSize="10" textAnchor="middle">0 Writes</text>
      </svg>
      <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: '#94a3b8' }}>
        <strong>Figure 5:</strong> Multi-layer gate authentication decision tree and role-to-permission mapping matrix.
      </div>
    </div>
  );
}

import React from 'react';

export function SystemLandscapeVisual() {
  return (
    <div className="manual-visual-container" style={{ margin: '1.5rem 0', background: 'var(--admin-surface, #0f172a)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--admin-border, #334155)' }}>
      <svg
        viewBox="0 0 800 420"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label="System Landscape Architecture Diagram"
      >
        <rect width="800" height="420" rx="8" fill="#0b1329" />
        
        {/* Tier 1: Clients / Consumers */}
        <rect x="40" y="30" width="220" height="65" rx="6" fill="#1e293b" stroke="#3b82f6" strokeWidth="2" />
        <text x="150" y="58" fill="#93c5fd" fontSize="13" fontWeight="600" textAnchor="middle">Public & Customer App</text>
        <text x="150" y="78" fill="#cbd5e1" fontSize="11" textAnchor="middle">Next.js App Router (Public / Dashboard)</text>

        <rect x="290" y="30" width="220" height="65" rx="6" fill="#1e293b" stroke="#8b5cf6" strokeWidth="2" />
        <text x="400" y="58" fill="#c4b5fd" fontSize="13" fontWeight="600" textAnchor="middle">Staff Console (/admin)</text>
        <text x="400" y="78" fill="#cbd5e1" fontSize="11" textAnchor="middle">Role-Gated Ops & Command Center</text>

        <rect x="540" y="30" width="220" height="65" rx="6" fill="#1e293b" stroke="#10b981" strokeWidth="2" />
        <text x="650" y="58" fill="#6ee7b7" fontSize="13" fontWeight="600" textAnchor="middle">Inbound Webhooks</text>
        <text x="650" y="78" fill="#cbd5e1" fontSize="11" textAnchor="middle">Stripe, SignalWire, Resend</text>

        {/* Down arrows */}
        <line x1="150" y1="95" x2="150" y2="140" stroke="#64748b" strokeWidth="2" markerEnd="url(#arrow)" />
        <line x1="400" y1="95" x2="400" y2="140" stroke="#64748b" strokeWidth="2" markerEnd="url(#arrow)" />
        <line x1="650" y1="95" x2="650" y2="140" stroke="#64748b" strokeWidth="2" markerEnd="url(#arrow)" />

        {/* Tier 2: Application / Gate Layer */}
        <rect x="40" y="140" width="720" height="85" rx="6" fill="#1e293b" stroke="#475569" strokeWidth="2" />
        <text x="400" y="165" fill="#f8fafc" fontSize="14" fontWeight="600" textAnchor="middle">Security, Authentication & Authorization Gate</text>
        <text x="400" y="185" fill="#94a3b8" fontSize="12" textAnchor="middle">requireOwnerContext() · requireAdmin() · requirePermission() · AAL2 MFA Step-Up</text>
        <text x="400" y="205" fill="#94a3b8" fontSize="11" textAnchor="middle">Service-Role Isolation & Rate Limiting · Dynamic force-dynamic no-store Fetch</text>

        {/* Down arrows */}
        <line x1="200" y1="225" x2="200" y2="270" stroke="#64748b" strokeWidth="2" />
        <line x1="400" y1="225" x2="400" y2="270" stroke="#64748b" strokeWidth="2" />
        <line x1="600" y1="225" x2="600" y2="270" stroke="#64748b" strokeWidth="2" />

        {/* Tier 3: Core Engines & Database */}
        <rect x="40" y="270" width="220" height="110" rx="6" fill="#0f172a" stroke="#0ea5e9" strokeWidth="2" />
        <text x="150" y="295" fill="#38bdf8" fontSize="13" fontWeight="600" textAnchor="middle">Supabase Postgres 17</text>
        <text x="150" y="315" fill="#cbd5e1" fontSize="11" textAnchor="middle">Multi-Tenant Accounts (RLS)</text>
        <text x="150" y="333" fill="#cbd5e1" fontSize="11" textAnchor="middle">Staff Permissions & Audit Logs</text>
        <text x="150" y="351" fill="#cbd5e1" fontSize="11" textAnchor="middle">Event Inboxes & Projections</text>

        <rect x="290" y="270" width="220" height="110" rx="6" fill="#0f172a" stroke="#f59e0b" strokeWidth="2" />
        <text x="400" y="295" fill="#fbbf24" fontSize="13" fontWeight="600" textAnchor="middle">Background Workers & Cron</text>
        <text x="400" y="315" fill="#cbd5e1" fontSize="11" textAnchor="middle">Projection Coordinator (Stripe)</text>
        <text x="400" y="333" fill="#cbd5e1" fontSize="11" textAnchor="middle">SMS Delivery & Inbound Action</text>
        <text x="400" y="351" fill="#cbd5e1" fontSize="11" textAnchor="middle">Allowance Reset & Dunning</text>

        <rect x="540" y="270" width="220" height="110" rx="6" fill="#0f172a" stroke="#ec4899" strokeWidth="2" />
        <text x="650" y="295" fill="#f472b6" fontSize="13" fontWeight="600" textAnchor="middle">External Providers</text>
        <text x="650" y="315" fill="#cbd5e1" fontSize="11" textAnchor="middle">Stripe (Direct & Connect)</text>
        <text x="650" y="333" fill="#cbd5e1" fontSize="11" textAnchor="middle">SignalWire (SMS & Voice 10DLC)</text>
        <text x="650" y="351" fill="#cbd5e1" fontSize="11" textAnchor="middle">Resend (Transactional & Blast)</text>
      </svg>
      <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: '#94a3b8' }}>
        <strong>Figure 1:</strong> System landscape illustrating trust boundaries, authentication gates, core database repositories, background cron workers, and third-party API providers.
      </div>
    </div>
  );
}

import React from 'react';

export function SmsConsentDeliveryVisual() {
  return (
    <div className="manual-visual-container" style={{ margin: '1.5rem 0', background: 'var(--admin-surface, #0f172a)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--admin-border, #334155)' }}>
      <svg
        viewBox="0 0 800 380"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label="SMS Consent and Delivery Lifecycle State Machine"
      >
        <rect width="800" height="380" rx="8" fill="#0b1329" />

        {/* State 1: Outbound Intent */}
        <rect x="40" y="50" width="180" height="90" rx="6" fill="#1e293b" stroke="#38bdf8" strokeWidth="1.5" />
        <text x="130" y="75" fill="#38bdf8" fontSize="13" fontWeight="600" textAnchor="middle">1. Outbound Intent</text>
        <text x="130" y="95" fill="#cbd5e1" fontSize="11" textAnchor="middle">Producer Queue Boundary</text>
        <text x="130" y="115" fill="#94a3b8" fontSize="10" textAnchor="middle">Scope & Consent Check</text>

        {/* State 2: Delivery Worker */}
        <rect x="310" y="50" width="180" height="90" rx="6" fill="#1e293b" stroke="#10b981" strokeWidth="1.5" />
        <text x="400" y="75" fill="#34d399" fontSize="13" fontWeight="600" textAnchor="middle">2. SignalWire Provider</text>
        <text x="400" y="95" fill="#cbd5e1" fontSize="11" textAnchor="middle">10DLC Number Delivery</text>
        <text x="400" y="115" fill="#94a3b8" fontSize="10" textAnchor="middle">Delivery Worker Cron</text>

        {/* State 3: Delivered / Failed */}
        <rect x="580" y="50" width="180" height="90" rx="6" fill="#1e293b" stroke="#f59e0b" strokeWidth="1.5" />
        <text x="670" y="75" fill="#fbbf24" fontSize="13" fontWeight="600" textAnchor="middle">3. Provider Status</text>
        <text x="670" y="95" fill="#cbd5e1" fontSize="11" textAnchor="middle">Webhook DLR Receipt</text>
        <text x="670" y="115" fill="#94a3b8" fontSize="10" textAnchor="middle">Delivered / Undelivered</text>

        <line x1="220" y1="95" x2="310" y2="95" stroke="#64748b" strokeWidth="2" />
        <line x1="490" y1="95" x2="580" y2="95" stroke="#64748b" strokeWidth="2" />

        {/* Inbound & Consent Section */}
        <rect x="40" y="180" width="720" height="170" rx="6" fill="#1e293b" stroke="#8b5cf6" strokeWidth="2" />
        <text x="400" y="208" fill="#c4b5fd" fontSize="14" fontWeight="600" textAnchor="middle">Inbound Compliance & Keyword State Machine</text>

        <rect x="60" y="225" width="200" height="100" rx="4" fill="#0f172a" stroke="#ef4444" />
        <text x="160" y="250" fill="#f87171" fontSize="12" fontWeight="600" textAnchor="middle">STOP / CANCEL / UNSUB</text>
        <text x="160" y="270" fill="#cbd5e1" fontSize="10" textAnchor="middle">Immediate Opt-Out Written</text>
        <text x="160" y="288" fill="#cbd5e1" fontSize="10" textAnchor="middle">sms_consent.opted_out = true</text>
        <text x="160" y="306" fill="#cbd5e1" fontSize="10" textAnchor="middle">All Marketing Blocked</text>

        <rect x="290" y="225" width="200" height="100" rx="4" fill="#0f172a" stroke="#10b981" />
        <text x="390" y="250" fill="#34d399" fontSize="12" fontWeight="600" textAnchor="middle">START / UNSTOP</text>
        <text x="390" y="270" fill="#cbd5e1" fontSize="10" textAnchor="middle">Re-Consent Logged</text>
        <text x="390" y="288" fill="#cbd5e1" fontSize="10" textAnchor="middle">sms_consent.opted_out = false</text>
        <text x="390" y="306" fill="#cbd5e1" fontSize="10" textAnchor="middle">Channel Re-Enabled</text>

        <rect x="520" y="225" width="220" height="100" rx="4" fill="#0f172a" stroke="#38bdf8" />
        <text x="630" y="250" fill="#38bdf8" fontSize="12" fontWeight="600" textAnchor="middle">Customer Message Body</text>
        <text x="630" y="270" fill="#cbd5e1" fontSize="10" textAnchor="middle">SMS Inbound Action Worker</text>
        <text x="630" y="288" fill="#cbd5e1" fontSize="10" textAnchor="middle">Triage & Thread Ingest</text>
        <text x="630" y="306" fill="#cbd5e1" fontSize="10" textAnchor="middle">Inbox Mirror & Push Alerts</text>
      </svg>
      <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: '#94a3b8' }}>
        <strong>Figure 6:</strong> SMS lifecycle sequence from producer queue to SignalWire 10DLC delivery, alongside mandatory STOP/START compliance handling.
      </div>
    </div>
  );
}

import React from 'react';

export function AdBillingWalletVisual() {
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
        aria-label="Google Ads Wallet Lifecycle and Billing Rails"
      >
        <rect width="800" height="400" rx="8" fill="#0b1329" />

        {/* Phase 1: Deposit / Tier Selection */}
        <rect x="30" y="30" width="220" height="95" rx="6" fill="#1e293b" stroke="#38bdf8" strokeWidth="1.5" />
        <text x="140" y="55" fill="#38bdf8" fontSize="13" fontWeight="600" textAnchor="middle">
          1. Wallet Fund Deposit
        </text>
        <text x="140" y="75" fill="#cbd5e1" fontSize="11" textAnchor="middle">
          Weekly Tiers: $250 – $2,500
        </text>
        <text x="140" y="93" fill="#94a3b8" fontSize="10" textAnchor="middle">
          Contractor Card Charged via Stripe
        </text>
        <text x="140" y="110" fill="#64748b" fontSize="9" textAnchor="middle">
          Writes ad_wallet_ledger entry
        </text>

        {/* Phase 2: Fee Split & Ad Pool */}
        <rect x="290" y="30" width="220" height="95" rx="6" fill="#1e293b" stroke="#10b981" strokeWidth="1.5" />
        <text x="400" y="55" fill="#34d399" fontSize="13" fontWeight="600" textAnchor="middle">
          2. Platform Split & CPC Pool
        </text>
        <text x="400" y="75" fill="#cbd5e1" fontSize="11" textAnchor="middle">
          15% Platform Management Fee
        </text>
        <text x="400" y="93" fill="#cbd5e1" fontSize="11" textAnchor="middle">
          85% Net Google Ads Media Spend
        </text>
        <text x="400" y="110" fill="#64748b" fontSize="9" textAnchor="middle">
          Daily CPC synced from Google API
        </text>

        {/* Phase 3: Auto-Refill Trigger */}
        <rect x="550" y="30" width="220" height="95" rx="6" fill="#1e293b" stroke="#f59e0b" strokeWidth="1.5" />
        <text x="660" y="55" fill="#fbbf24" fontSize="13" fontWeight="600" textAnchor="middle">
          3. Threshold & Auto-Refill
        </text>
        <text x="660" y="75" fill="#cbd5e1" fontSize="11" textAnchor="middle">
          Remaining Balance ≤ 20%
        </text>
        <text x="660" y="93" fill="#94a3b8" fontSize="10" textAnchor="middle">
          Trigger Auto-Refill Worker
        </text>
        <text x="660" y="110" fill="#94a3b8" fontSize="10" textAnchor="middle">
          Stripe Off-Session PaymentIntent
        </text>

        <line x1="250" y1="77" x2="290" y2="77" stroke="#64748b" strokeWidth="2" />
        <line x1="510" y1="77" x2="550" y2="77" stroke="#64748b" strokeWidth="2" />

        {/* State Machine / Guardrails */}
        <rect x="30" y="155" width="740" height="215" rx="6" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
        <text x="400" y="180" fill="#f8fafc" fontSize="14" fontWeight="600" textAnchor="middle">
          Ad Campaign Operational Guardrails & Failure Modes
        </text>

        {/* Card 1: Normal Refill Succeeded */}
        <rect x="50" y="200" width="215" height="150" rx="4" fill="#0f172a" stroke="#10b981" />
        <text x="157" y="223" fill="#34d399" fontSize="12" fontWeight="600" textAnchor="middle">
          Auto-Refill Succeeded
        </text>
        <text x="157" y="245" fill="#cbd5e1" fontSize="10" textAnchor="middle">
          Balance Restored to Target
        </text>
        <text x="157" y="265" fill="#94a3b8" fontSize="10" textAnchor="middle">
          Google Ads Campaign Continuous
        </text>
        <text x="157" y="285" fill="#94a3b8" fontSize="10" textAnchor="middle">
          Zero lead pipeline interruption
        </text>
        <text x="157" y="315" fill="#34d399" fontSize="10" fontWeight="600" textAnchor="middle">
          Status: ACTIVE / HEALTHY
        </text>

        {/* Card 2: Refill Card Decline */}
        <rect x="292" y="200" width="215" height="150" rx="4" fill="#0f172a" stroke="#f59e0b" />
        <text x="399" y="223" fill="#fbbf24" fontSize="12" fontWeight="600" textAnchor="middle">
          Card Decline (Grace Window)
        </text>
        <text x="399" y="245" fill="#cbd5e1" fontSize="10" textAnchor="middle">
          48-Hour Dunning Period
        </text>
        <text x="399" y="265" fill="#94a3b8" fontSize="10" textAnchor="middle">
          SMS & Email payment alerts
        </text>
        <text x="399" y="285" fill="#94a3b8" fontSize="10" textAnchor="middle">
          Balance drains to zero
        </text>
        <text x="399" y="315" fill="#fbbf24" fontSize="10" fontWeight="600" textAnchor="middle">
          Status: DUNNING_ATTEMPT_1
        </text>

        {/* Card 3: Zero Balance / Paused */}
        <rect x="535" y="200" width="215" height="150" rx="4" fill="#0f172a" stroke="#ef4444" />
        <text x="642" y="223" fill="#f87171" fontSize="12" fontWeight="600" textAnchor="middle">
          Zero Balance / Auto-Paused
        </text>
        <text x="642" y="245" fill="#cbd5e1" fontSize="10" textAnchor="middle">
          Google API sets status=PAUSED
        </text>
        <text x="642" y="265" fill="#94a3b8" fontSize="10" textAnchor="middle">
          Prevents unbudgeted debt
        </text>
        <text x="642" y="285" fill="#94a3b8" fontSize="10" textAnchor="middle">
          Resumes upon manual top-up
        </text>
        <text x="642" y="315" fill="#ef4444" fontSize="10" fontWeight="600" textAnchor="middle">
          Status: BUDGET_DEPLETED
        </text>
      </svg>
      <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: '#94a3b8' }}>
        <strong>Figure 10:</strong> Google Ads wallet billing architecture, 15% platform fee split, auto-refill triggers, and fail-safe campaign pause state machine.
      </div>
    </div>
  );
}

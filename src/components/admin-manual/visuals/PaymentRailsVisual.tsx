import React from 'react';

export function PaymentRailsVisual() {
  return (
    <div className="manual-visual-container" style={{ margin: '1.5rem 0', background: 'var(--admin-surface, #0f172a)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--admin-border, #334155)' }}>
      <svg
        viewBox="0 0 800 420"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label="Payment Rails and Entitlement Flow Architecture"
      >
        <rect width="800" height="420" rx="8" fill="#0b1329" />

        {/* Rail 1: Platform SaaS Subscription */}
        <rect x="30" y="30" width="225" height="170" rx="6" fill="#1e293b" stroke="#38bdf8" strokeWidth="1.5" />
        <text x="142" y="55" fill="#38bdf8" fontSize="13" fontWeight="600" textAnchor="middle">1. SaaS Subscriptions</text>
        <text x="142" y="72" fill="#94a3b8" fontSize="10" textAnchor="middle">Stripe Customer Billing</text>
        <rect x="45" y="85" width="195" height="30" rx="4" fill="#0f172a" stroke="#475569" />
        <text x="142" y="105" fill="#e2e8f0" fontSize="11" textAnchor="middle">Starter / Growth / Scale</text>
        <rect x="45" y="122" width="195" height="30" rx="4" fill="#0f172a" stroke="#475569" />
        <text x="142" y="142" fill="#e2e8f0" fontSize="11" textAnchor="middle">Stripe Webhook Event Inbox</text>
        <rect x="45" y="159" width="195" height="30" rx="4" fill="#0f172a" stroke="#475569" />
        <text x="142" y="179" fill="#e2e8f0" fontSize="11" textAnchor="middle">Subscription Event Projector</text>

        {/* Rail 2: Connected Invoicing */}
        <rect x="285" y="30" width="230" height="170" rx="6" fill="#1e293b" stroke="#10b981" strokeWidth="1.5" />
        <text x="400" y="55" fill="#34d399" fontSize="13" fontWeight="600" textAnchor="middle">2. Contractor Invoicing</text>
        <text x="400" y="72" fill="#94a3b8" fontSize="10" textAnchor="middle">Direct & Connect Rails</text>
        <rect x="300" y="85" width="200" height="30" rx="4" fill="#0f172a" stroke="#475569" />
        <text x="400" y="105" fill="#e2e8f0" fontSize="11" textAnchor="middle">Direct / Connect Checkout</text>
        <rect x="300" y="122" width="200" height="30" rx="4" fill="#0f172a" stroke="#475569" />
        <text x="400" y="142" fill="#e2e8f0" fontSize="11" textAnchor="middle">Payment Projection Worker</text>
        <rect x="300" y="159" width="200" height="30" rx="4" fill="#0f172a" stroke="#475569" />
        <text x="400" y="179" fill="#e2e8f0" fontSize="11" textAnchor="middle">Late-Success Reconciler</text>

        {/* Rail 3: Quick Stops */}
        <rect x="545" y="30" width="225" height="170" rx="6" fill="#1e293b" stroke="#f59e0b" strokeWidth="1.5" />
        <text x="657" y="55" fill="#fbbf24" fontSize="13" fontWeight="600" textAnchor="middle">3. Quick Stop Rails</text>
        <text x="657" y="72" fill="#94a3b8" fontSize="10" textAnchor="middle">Instant Booking & Capture</text>
        <rect x="560" y="85" width="195" height="30" rx="4" fill="#0f172a" stroke="#475569" />
        <text x="657" y="105" fill="#e2e8f0" fontSize="11" textAnchor="middle">Pre-Authorized Card Hold</text>
        <rect x="560" y="122" width="195" height="30" rx="4" fill="#0f172a" stroke="#475569" />
        <text x="657" y="142" fill="#e2e8f0" fontSize="11" textAnchor="middle">Onsite Auto-Capture</text>
        <rect x="560" y="159" width="195" height="30" rx="4" fill="#0f172a" stroke="#475569" />
        <text x="657" y="179" fill="#e2e8f0" fontSize="11" textAnchor="middle">Platform Fee Retention</text>

        {/* Bottom Tier: Entitlement Engine & Overages */}
        <rect x="30" y="230" width="740" height="155" rx="6" fill="#1e293b" stroke="#8b5cf6" strokeWidth="2" />
        <text x="400" y="258" fill="#c4b5fd" fontSize="14" fontWeight="600" textAnchor="middle">4. Entitlements, Top-Ups & Usage Ledger</text>
        
        <rect x="50" y="280" width="155" height="85" rx="4" fill="#0f172a" stroke="#475569" />
        <text x="127" y="305" fill="#93c5fd" fontSize="12" fontWeight="600" textAnchor="middle">Seat Caps</text>
        <text x="127" y="325" fill="#cbd5e1" fontSize="10" textAnchor="middle">Owner + Office Seats</text>
        <text x="127" y="345" fill="#cbd5e1" fontSize="10" textAnchor="middle">Purchased Crew Seats</text>

        <rect x="230" y="280" width="155" height="85" rx="4" fill="#0f172a" stroke="#475569" />
        <text x="307" y="305" fill="#a7f3d0" fontSize="12" fontWeight="600" textAnchor="middle">Voice Minutes</text>
        <text x="307" y="325" fill="#cbd5e1" fontSize="10" textAnchor="middle">Included Monthly Pool</text>
        <text x="307" y="345" fill="#cbd5e1" fontSize="10" textAnchor="middle">Top-Up Minute Reserve</text>

        <rect x="410" y="280" width="155" height="85" rx="4" fill="#0f172a" stroke="#475569" />
        <text x="487" y="305" fill="#fde68a" fontSize="12" fontWeight="600" textAnchor="middle">SMS Credits</text>
        <text x="487" y="325" fill="#cbd5e1" fontSize="10" textAnchor="middle">Transactional & Marketing</text>
        <text x="487" y="345" fill="#cbd5e1" fontSize="10" textAnchor="middle">10DLC Dedicated Sender</text>

        <rect x="590" y="280" width="160" height="85" rx="4" fill="#0f172a" stroke="#475569" />
        <text x="670" y="305" fill="#fbcfe8" fontSize="12" fontWeight="600" textAnchor="middle">Overages & Dunning</text>
        <text x="670" y="325" fill="#cbd5e1" fontSize="10" textAnchor="middle">Grace Period Tracking</text>
        <text x="670" y="345" fill="#cbd5e1" fontSize="10" textAnchor="middle">Monthly Allowance Reset</text>
      </svg>
      <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: '#94a3b8' }}>
        <strong>Figure 4:</strong> Multi-rail payment flow diagram detailing subscription projectors, invoice settlement, Quick Stop holds, and the usage entitlement ledger.
      </div>
    </div>
  );
}

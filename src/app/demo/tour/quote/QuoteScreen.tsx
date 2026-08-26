'use client';

import { useState } from 'react';
import Link from 'next/link';
import DemoTourBar from '@/components/demo/DemoTourBar';
import { useDemoTourState } from '@/components/demo/DemoTourStateProvider';
import {
  TOUR_STEPS,
  DEMO_TOUR_CONTRACTOR,
  DEMO_TOUR_CUSTOMER,
  DEMO_TOUR_JOB,
} from '@/lib/demo-tour-data';
import { trackDemoEvent } from '@/lib/demo-analytics';
import styles from '../tour.module.css';

export default function QuoteScreen() {
  const currentStep = TOUR_STEPS[3];
  const { state, setUpgradeSelected, setQuoteSent } = useDemoTourState();
  const [showDetails, setShowDetails] = useState(false);

  const total = DEMO_TOUR_JOB.baseTotal + (state.upgradeSelected ? DEMO_TOUR_JOB.upgradeTotal : 0);

  const handleSimulateSend = () => {
    setQuoteSent(true);
    trackDemoEvent('action_simulated', {
      step: 4,
      stepSlug: 'quote',
      action: 'quote_dispatched_simulation',
      total,
      upgradeSelected: state.upgradeSelected,
      quoteId: DEMO_TOUR_JOB.quoteId,
    });
  };

  return (
    <div className={styles.tourContainer}>
      <DemoTourBar currentStep={currentStep} />

      {/* Perspective Context Banner */}
      <div className={styles.perspectiveHeroContractor}>
        <div className={styles.perspectiveHeroInner}>
          <div className={styles.perspectiveInfo}>
            <span className={`${styles.perspectiveTag} ${styles.perspectiveTagContractor}`}>
              🛠️ Contractor Perspective · Step 4 of 6
            </span>
            <h1 className={styles.perspectiveHeading}>Contractor prepares &amp; sends itemized quote</h1>
            <p className={styles.perspectiveSub}>
              Line items, optional upgrades, and deposit terms are pre-populated. Preview simulated SMS delivery in one tap.
            </p>
          </div>
        </div>
      </div>

      <div className={styles.cardLayout}>
        {/* Lightweight Dashboard Context Framing */}
        <div
          style={{
            background: '#0e2333',
            border: '1px solid rgba(80, 227, 189, 0.3)',
            borderRadius: '12px 12px 0 0',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            color: '#9eb5c2',
            borderBottom: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#50e3bd', fontWeight: 800 }}>{DEMO_TOUR_CONTRACTOR.name}</span>
            <span>&rsaquo;</span>
            <span style={{ color: '#ffffff', fontWeight: 600 }}>Quotes Workspace</span>
            <span>&rsaquo;</span>
            <span style={{ color: '#ffd166' }}>{DEMO_TOUR_JOB.quoteId}</span>
          </div>
          <span style={{ background: 'rgba(80, 227, 189, 0.15)', color: '#50e3bd', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
            Live LGQ Dashboard Preview
          </span>
        </div>

        <div className={styles.panelCard} style={{ borderRadius: '0 0 14px 14px' }}>
          {/* Quote Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: '18px',
              borderBottom: '1px solid rgba(168, 204, 255, 0.15)',
              marginBottom: '20px',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#ffd166', textTransform: 'uppercase' }}>
                Quote Builder &middot; {DEMO_TOUR_JOB.quoteId}
              </div>
              <h2 style={{ fontSize: '22px', fontWeight: 800, margin: '4px 0 0', color: '#ffffff' }}>
                {DEMO_TOUR_JOB.title}
              </h2>
              <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#9db0bd' }}>
                Client: {DEMO_TOUR_CUSTOMER.name} &middot; {DEMO_TOUR_CUSTOMER.city}, MI
              </p>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: '#9db0bd', textTransform: 'uppercase' }}>Total Quote Value</div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#50e3bd' }}>
                ${total.toLocaleString()}
              </div>
              <span style={{ fontSize: '12px', color: '#ffd166' }}>$500.00 deposit required</span>
            </div>
          </div>

          {/* Optional Upgrades Section (Placed prominently) */}
          <div style={{ marginBottom: '22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <h3 style={{ fontSize: '14.5px', fontWeight: 700, color: '#ffd166', margin: 0 }}>
                Optional Upgrades &middot; Boost Ticket Size
              </h3>
              <span style={{ fontSize: '12px', color: '#9db0bd' }}>Editable by homeowner on approval</span>
            </div>

            <div
              style={{
                background: state.upgradeSelected ? 'rgba(80, 227, 189, 0.08)' : 'rgba(255, 209, 102, 0.06)',
                border: `1px solid ${state.upgradeSelected ? 'rgba(80, 227, 189, 0.35)' : 'rgba(255, 209, 102, 0.25)'}`,
                borderRadius: '10px',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <input
                  type="checkbox"
                  id="includeUpgrade"
                  checked={state.upgradeSelected}
                  onChange={(e) => setUpgradeSelected(e.target.checked)}
                  aria-label={`Add optional ${DEMO_TOUR_JOB.optionalUpgrades[0].title} (+$${DEMO_TOUR_JOB.optionalUpgrades[0].amount})`}
                  style={{ width: '20px', height: '20px', marginTop: '2px', accentColor: '#ff6a24', cursor: 'pointer' }}
                />
                <div>
                  <label htmlFor="includeUpgrade" style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff', cursor: 'pointer' }}>
                    {DEMO_TOUR_JOB.optionalUpgrades[0].title}
                  </label>
                  <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: '#b7cdd7' }}>
                    {DEMO_TOUR_JOB.optionalUpgrades[0].description}
                  </p>
                </div>
              </div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#ffd166', whiteSpace: 'nowrap' }}>
                +${DEMO_TOUR_JOB.optionalUpgrades[0].amount}
              </div>
            </div>
          </div>

          {/* Itemized Line Items Table (Collapsible on Mobile to reduce scroll friction) */}
          <div style={{ marginBottom: '22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <h3 style={{ fontSize: '14.5px', fontWeight: 700, color: '#d1e2eb', margin: 0 }}>
                Base Service Line Items
              </h3>
              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#50e3bd',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: '4px 0',
                }}
                aria-label={showDetails ? 'Hide line item descriptions' : 'Show full line item descriptions'}
              >
                {showDetails ? 'Collapse descriptions' : 'Expand descriptions'}
              </button>
            </div>

            <div
              style={{
                background: '#040d14',
                border: '1px solid rgba(168, 204, 255, 0.12)',
                borderRadius: '10px',
                overflow: 'hidden',
              }}
            >
              {DEMO_TOUR_JOB.lineItems.map((item, i) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    padding: showDetails ? '14px 18px' : '10px 18px',
                    borderBottom:
                      i === DEMO_TOUR_JOB.lineItems.length - 1 ? 'none' : '1px solid rgba(255, 255, 255, 0.06)',
                    gap: '14px',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#ffffff' }}>
                      {item.title}
                    </div>
                    {showDetails ? (
                      <div style={{ fontSize: '12.5px', color: '#8faab7', lineHeight: '1.4', marginTop: '4px' }}>
                        {item.description}
                      </div>
                    ) : null}
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#e2edf2', whiteSpace: 'nowrap' }}>
                    ${item.amount.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Send Quote Action Card */}
          <div
            style={{
              background: '#040d14',
              border: '1px solid rgba(168, 204, 255, 0.15)',
              borderRadius: '10px',
              padding: '18px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff' }}>
                {state.quoteSent ? `✓ Simulated dispatch to ${DEMO_TOUR_CUSTOMER.phone}` : `Dispatch Quote to ${DEMO_TOUR_CUSTOMER.name}`}
              </div>
              <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#9db0bd' }}>
                {state.quoteSent
                  ? 'Demo complete — no real SMS text was sent.'
                  : 'Customer receives instant SMS link to review, toggle upgrades, e-sign, and pay deposit.'}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              {!state.quoteSent ? (
                <button
                  type="button"
                  onClick={handleSimulateSend}
                  style={{
                    background: '#50e3bd',
                    color: '#071a26',
                    fontSize: '13.5px',
                    fontWeight: 800,
                    padding: '10px 18px',
                    minHeight: '44px',
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                  aria-label="Simulate sending quote to customer"
                >
                  📱 Simulate sending quote
                </button>
              ) : (
                <span
                  style={{
                    background: 'rgba(80, 227, 189, 0.15)',
                    border: '1px solid #50e3bd',
                    color: '#50e3bd',
                    fontWeight: 700,
                    fontSize: '13px',
                    padding: '8px 14px',
                    borderRadius: '6px',
                  }}
                  role="status"
                >
                  ✓ Simulated text sent
                </span>
              )}

              <Link
                href="/demo/tour/approve"
                className={styles.tourNextActionBtn}
                style={{ minHeight: '44px' }}
                aria-label="Proceed to Homeowner Approval Screen"
              >
                View Customer Approval Screen &rarr;
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Compact Mobile Sticky Action Dock */}
      <div className={styles.mobileStickyActionDock}>
        <div>
          <span style={{ fontSize: '11px', color: '#9db0bd', display: 'block' }}>Total with deposit:</span>
          <strong style={{ fontSize: '16px', color: '#50e3bd' }}>${total.toLocaleString()}</strong>
        </div>
        {!state.quoteSent ? (
          <button
            type="button"
            onClick={handleSimulateSend}
            style={{
              background: '#50e3bd',
              color: '#071a26',
              fontSize: '13px',
              fontWeight: 800,
              padding: '10px 16px',
              minHeight: '44px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
            }}
            aria-label="Simulate sending quote on mobile"
          >
            📱 Simulate sending
          </button>
        ) : (
          <Link
            href="/demo/tour/approve"
            className={styles.tourNextActionBtn}
            style={{ minHeight: '44px', padding: '8px 16px', fontSize: '13px' }}
            aria-label="Review customer approval on mobile"
          >
            Customer Approval &rarr;
          </Link>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import DemoTourBar from '@/components/demo/DemoTourBar';
import {
  TOUR_STEPS,
  DEMO_TOUR_CONTRACTOR,
  DEMO_TOUR_CUSTOMER,
  DEMO_TOUR_JOB,
} from '@/lib/demo-tour-data';
import styles from '../tour.module.css';

export default function ApproveScreen() {
  const currentStep = TOUR_STEPS[4];
  const [hasSurgeUpgrade, setHasSurgeUpgrade] = useState(true);
  const [signature, setSignature] = useState('Sarah Jenkins');
  const [depositPaid, setDepositPaid] = useState(false);
  const [isPaying, setIsPaying] = useState(false);

  const total = DEMO_TOUR_JOB.baseTotal + (hasSurgeUpgrade ? DEMO_TOUR_JOB.upgradeTotal : 0);

  const handlePayDeposit = () => {
    setIsPaying(true);
    setTimeout(() => {
      setIsPaying(false);
      setDepositPaid(true);
    }, 1000);
  };

  return (
    <div className={styles.tourContainer}>
      <DemoTourBar currentStep={currentStep} />

      {/* Perspective Context Banner */}
      <div className={styles.perspectiveHero}>
        <div className={styles.perspectiveHeroInner}>
          <div className={styles.perspectiveInfo}>
            <span className={styles.perspectiveTag}>👤 Homeowner Perspective · Step 5 of 6</span>
            <h1 className={styles.perspectiveHeading}>Homeowner approves upgrades, e-signs &amp; pays deposit</h1>
            <p className={styles.perspectiveSub}>
              Customer reviews quote on mobile/portal, toggles optional surge protection, e-signs, and pays $500 deposit.
            </p>
          </div>
          <Link href="/demo/tour/complete" className={styles.tourNextActionBtn}>
            Complete Tour &rarr;
          </Link>
        </div>
      </div>

      <div className={styles.cardLayout}>
        <div
          style={{
            maxWidth: '680px',
            margin: '0 auto',
            background: '#ffffff',
            color: '#1a2830',
            borderRadius: '14px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.45)',
            overflow: 'hidden',
            border: '1px solid #cbd5e0',
          }}
        >
          {/* Mobile Portal Header */}
          <div
            style={{
              background: '#0f2434',
              color: '#ffffff',
              padding: '24px 28px',
              borderBottom: '3px solid #50e3bd',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#50e3bd', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  Customer Portal &middot; Estimate Review
                </span>
                <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '4px 0 0', color: '#ffffff' }}>
                  {DEMO_TOUR_CONTRACTOR.name}
                </h2>
                <div style={{ fontSize: '13px', color: '#a0aec0', marginTop: '2px' }}>
                  Quote #{DEMO_TOUR_JOB.quoteId} &middot; Prepared for {DEMO_TOUR_CUSTOMER.name}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '11px', color: '#a0aec0', textTransform: 'uppercase' }}>Amount</span>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#50e3bd' }}>
                  ${total.toLocaleString()}
                </div>
              </div>
            </div>
          </div>

          <div style={{ padding: '24px 28px' }}>
            {/* Scope Summary */}
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#2d3748', margin: '0 0 10px' }}>
                {DEMO_TOUR_JOB.title}
              </h3>
              <div style={{ background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px' }}>
                {DEMO_TOUR_JOB.lineItems.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '13.5px',
                      padding: '6px 0',
                      borderBottom: '1px dashed #edf2f7',
                    }}
                  >
                    <span style={{ color: '#4a5568' }}>{item.title}</span>
                    <strong style={{ color: '#2d3748' }}>${item.amount.toLocaleString()}</strong>
                  </div>
                ))}
              </div>
            </div>

            {/* Optional Upgrade Checkbox */}
            <div style={{ marginBottom: '24px' }}>
              <div
                style={{
                  background: hasSurgeUpgrade ? '#f0fff4' : '#f7fafc',
                  border: `2px solid ${hasSurgeUpgrade ? '#38a169' : '#e2e8f0'}`,
                  borderRadius: '10px',
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  cursor: 'pointer',
                }}
                onClick={() => setHasSurgeUpgrade(!hasSurgeUpgrade)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="checkbox"
                    checked={hasSurgeUpgrade}
                    onChange={(e) => setHasSurgeUpgrade(e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: '#38a169' }}
                  />
                  <div>
                    <strong style={{ fontSize: '14px', color: '#1a202c' }}>
                      Add {DEMO_TOUR_JOB.optionalUpgrades[0].title}
                    </strong>
                    <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: '#4a5568' }}>
                      Protects electric vehicle charger &amp; electronics from lightning/spikes.
                    </p>
                  </div>
                </div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#2f855a', whiteSpace: 'nowrap' }}>
                  +$350.00
                </div>
              </div>
            </div>

            {/* E-Signature Box */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '13px', fontWeight: 700, color: '#2d3748', display: 'block', marginBottom: '6px' }}>
                Electronic Signature &middot; Legally Binding Acceptance
              </label>
              <div
                style={{
                  background: '#f7fafc',
                  border: '1px dashed #cbd5e0',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <input
                  type="text"
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  style={{
                    fontFamily: 'cursive, serif',
                    fontSize: '20px',
                    border: 'none',
                    background: 'transparent',
                    color: '#2b6cb0',
                    width: '100%',
                    outline: 'none',
                  }}
                  placeholder="Type signature..."
                />
                <span style={{ fontSize: '12px', color: '#38a169', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  ✓ Signed
                </span>
              </div>
            </div>

            {/* Deposit Payment Box */}
            {!depositPaid ? (
              <div
                style={{
                  background: '#ebf8ff',
                  border: '1px solid #bee3f8',
                  borderRadius: '10px',
                  padding: '18px',
                  marginBottom: '20px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div>
                    <strong style={{ fontSize: '14.5px', color: '#2b6cb0' }}>Pay Required Deposit ($500.00)</strong>
                    <div style={{ fontSize: '12.5px', color: '#4a5568' }}>
                      Reserves arrival slot for {DEMO_TOUR_JOB.scheduledDate}.
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', background: '#3182ce', color: '#ffffff', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                    Stripe Secured
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handlePayDeposit}
                  disabled={isPaying}
                  style={{
                    width: '100%',
                    background: '#000000',
                    color: '#ffffff',
                    fontSize: '16px',
                    fontWeight: 700,
                    padding: '14px',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
                  }}
                >
                  {isPaying ? 'Processing Deposit...' : 'Pay $500.00 with Pay'}
                </button>
              </div>
            ) : (
              <div
                style={{
                  background: '#f0fff4',
                  border: '1px solid #9ae6b4',
                  borderRadius: '10px',
                  padding: '20px',
                  marginBottom: '20px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '24px', marginBottom: '6px' }}>🎉</div>
                <strong style={{ fontSize: '16px', color: '#22543d', display: 'block' }}>
                  Deposit Paid &middot; Booking Confirmed!
                </strong>
                <p style={{ fontSize: '13.5px', color: '#276749', margin: '6px 0 14px' }}>
                  Arrival window confirmed for <strong>{DEMO_TOUR_JOB.scheduledDate} ({DEMO_TOUR_JOB.scheduledArrivalWindow})</strong>.
                  Marcus Rivera is assigned to your project.
                </p>
                <Link
                  href="/demo/tour/complete"
                  className={styles.tourNextActionBtn}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  View Tour Summary &rarr;
                </Link>
              </div>
            )}

            {!depositPaid && (
              <div style={{ textAlign: 'center', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={handlePayDeposit}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#4a5568',
                    fontSize: '12.5px',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                  }}
                >
                  Or simulate credit card deposit &rarr;
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

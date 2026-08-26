'use client';

import { useState, useEffect } from 'react';
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

export default function ApproveScreen() {
  const currentStep = TOUR_STEPS[4];
  const {
    state,
    setUpgradeSelected,
    setSignature,
    setSigned,
    setDepositSimulated,
  } = useDemoTourState();

  const [isProcessing, setIsProcessing] = useState(false);

  // Check URL query parameters for cross-device QR code handoff
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const upgradeParam = params.get('upgrade');
      if (upgradeParam === '1') {
        setUpgradeSelected(true);
      } else if (upgradeParam === '0') {
        setUpgradeSelected(false);
      }
    } catch {
      // Non-blocking
    }
  }, [setUpgradeSelected]);

  const total = DEMO_TOUR_JOB.baseTotal + (state.upgradeSelected ? DEMO_TOUR_JOB.upgradeTotal : 0);
  const canPay = state.signed && Boolean(state.signature.trim());

  const handleApplyDemoSignature = () => {
    setSignature(DEMO_TOUR_CUSTOMER.name);
    setSigned(true);
    trackDemoEvent('signature_applied', {
      step: 5,
      stepSlug: 'approve',
      signer: DEMO_TOUR_CUSTOMER.name,
    });
    trackDemoEvent('step_interacted', {
      step: 5,
      stepSlug: 'approve',
      action: 'demo_signature_applied',
    });
  };

  const handleSignatureChange = (val: string) => {
    setSignature(val);
    if (val.trim()) {
      trackDemoEvent('signature_applied', {
        step: 5,
        stepSlug: 'approve',
        signer: val,
      });
      trackDemoEvent('step_interacted', {
        step: 5,
        stepSlug: 'approve',
        action: 'signature_typed',
      });
    }
  };

  const handleSimulatePayment = (method: 'apple_pay' | 'card') => {
    if (!canPay) return;
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setDepositSimulated(true, method);
      trackDemoEvent('deposit_simulated', {
        step: 5,
        stepSlug: 'approve',
        depositAmount: DEMO_TOUR_JOB.requiredDeposit,
        paymentMethod: method,
      });
      trackDemoEvent('step_interacted', {
        step: 5,
        stepSlug: 'approve',
        action: 'deposit_simulated',
      });
      trackDemoEvent('step_completed', {
        step: 5,
        stepSlug: 'approve',
        perspective: 'homeowner',
        depositAmount: DEMO_TOUR_JOB.requiredDeposit,
        paymentMethod: method,
        simulated: true,
      });
    }, 850);
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
              Customer reviews quote in mobile customer portal, toggles optional lighting, applies signature, and tests simulated deposit.
            </p>
          </div>
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
              padding: '20px 24px',
              borderBottom: '3px solid #50e3bd',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#50e3bd', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  Customer Portal &middot; Estimate Review
                </span>
                <h2 style={{ fontSize: '19px', fontWeight: 800, margin: '3px 0 0', color: '#ffffff' }}>
                  {DEMO_TOUR_CONTRACTOR.name}
                </h2>
                <div style={{ fontSize: '12.5px', color: '#a0aec0', marginTop: '2px' }}>
                  Quote #{DEMO_TOUR_JOB.quoteId} &middot; Prepared for {DEMO_TOUR_CUSTOMER.name}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '11px', color: '#a0aec0', textTransform: 'uppercase' }}>Amount</span>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#50e3bd' }}>
                  ${total.toLocaleString()}
                </div>
              </div>
            </div>
          </div>

          <div style={{ padding: '20px 24px' }}>
            {/* Scope Summary */}
            <div style={{ marginBottom: '18px' }}>
              <h3 style={{ fontSize: '14.5px', fontWeight: 700, color: '#2d3748', margin: '0 0 8px' }}>
                {DEMO_TOUR_JOB.title}
              </h3>
              <div style={{ background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px' }}>
                {DEMO_TOUR_JOB.lineItems.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '13px',
                      padding: '5px 0',
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
            <div style={{ marginBottom: '20px' }}>
              <div
                style={{
                  background: state.upgradeSelected ? '#f0fff4' : '#f7fafc',
                  border: `2px solid ${state.upgradeSelected ? '#38a169' : '#cbd5e0'}`,
                  borderRadius: '10px',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  cursor: 'pointer',
                }}
                onClick={() => setUpgradeSelected(!state.upgradeSelected)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="checkbox"
                    id="portalUpgradeCheckbox"
                    checked={state.upgradeSelected}
                    onChange={(e) => setUpgradeSelected(e.target.checked)}
                    aria-label={`Add optional ${DEMO_TOUR_JOB.optionalUpgrades[0].title} (+$${DEMO_TOUR_JOB.optionalUpgrades[0].amount})`}
                    style={{ width: '18px', height: '18px', accentColor: '#38a169', cursor: 'pointer' }}
                  />
                  <div>
                    <label htmlFor="portalUpgradeCheckbox" style={{ fontSize: '13.5px', fontWeight: 700, color: '#1a202c', cursor: 'pointer' }}>
                      Add {DEMO_TOUR_JOB.optionalUpgrades[0].title}
                    </label>
                    <p style={{ margin: '1px 0 0', fontSize: '12px', color: '#4a5568' }}>
                      {DEMO_TOUR_JOB.optionalUpgrades[0].description}
                    </p>
                  </div>
                </div>
                <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#2f855a', whiteSpace: 'nowrap' }}>
                  +${DEMO_TOUR_JOB.optionalUpgrades[0].amount}.00
                </div>
              </div>
            </div>

            {/* E-Signature Box */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                <label htmlFor="signatureInput" style={{ fontSize: '12.5px', fontWeight: 700, color: '#2d3748' }}>
                  Electronic Signature &middot; Acceptance
                </label>
                {!state.signed ? (
                  <button
                    type="button"
                    onClick={handleApplyDemoSignature}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#2b6cb0',
                      fontSize: '12px',
                      fontWeight: 700,
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      padding: '4px 0',
                    }}
                    aria-label="Apply demo signature for Taylor Brooks"
                  >
                    Apply demo signature
                  </button>
                ) : null}
              </div>

              <div
                style={{
                  background: '#f7fafc',
                  border: state.signed ? '1px solid #38a169' : '1px dashed #cbd5e0',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <input
                  id="signatureInput"
                  type="text"
                  value={state.signature}
                  onChange={(e) => handleSignatureChange(e.target.value)}
                  style={{
                    fontFamily: 'cursive, serif',
                    fontSize: '18px',
                    border: 'none',
                    background: 'transparent',
                    color: '#2b6cb0',
                    width: '100%',
                    outline: 'none',
                  }}
                  placeholder="Type name to sign..."
                  aria-label="Signature name"
                />
                {state.signed ? (
                  <span style={{ fontSize: '12px', color: '#38a169', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    ✓ Signed
                  </span>
                ) : (
                  <span style={{ fontSize: '12px', color: '#a0aec0', fontStyle: 'italic', whiteSpace: 'nowrap' }}>
                    (Unsigned)
                  </span>
                )}
              </div>
            </div>

            {/* Deposit Payment Box (Guarded by Signature) */}
            {!state.depositSimulated ? (
              <div
                style={{
                  background: canPay ? '#ebf8ff' : '#f8fafc',
                  border: `1px solid ${canPay ? '#bee3f8' : '#e2e8f0'}`,
                  borderRadius: '10px',
                  padding: '16px',
                  marginBottom: '16px',
                  transition: 'all 0.3s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '6px' }}>
                  <div>
                    <strong style={{ fontSize: '14px', color: canPay ? '#2b6cb0' : '#4a5568' }}>
                      Simulate Required Deposit ($500.00)
                    </strong>
                    <div style={{ fontSize: '12px', color: '#4a5568' }}>
                      Reserves arrival slot for {DEMO_TOUR_JOB.scheduledDate} (Sample transaction).
                    </div>
                  </div>
                  <span style={{ fontSize: '10.5px', background: canPay ? '#3182ce' : '#94a3b8', color: '#ffffff', padding: '2px 7px', borderRadius: '4px', fontWeight: 700 }}>
                    Stripe Simulation
                  </span>
                </div>

                {!canPay ? (
                  <div style={{ background: '#fffaf0', border: '1px solid #feebc8', borderRadius: '6px', padding: '8px 12px', marginBottom: '12px', fontSize: '12px', color: '#c05621' }}>
                    🔒 Please apply signature above to unlock deposit payment.
                  </div>
                ) : (
                  <div style={{ background: '#f0fff4', border: '1px solid #c6f6d5', borderRadius: '6px', padding: '8px 12px', marginBottom: '12px', fontSize: '12px', color: '#276749', fontWeight: 600 }}>
                    ✓ Signature confirmed &mdash; deposit payment unlocked.
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => handleSimulatePayment('apple_pay')}
                  disabled={!canPay || isProcessing}
                  aria-disabled={!canPay || isProcessing}
                  style={{
                    width: '100%',
                    background: canPay ? '#000000' : '#64748b',
                    opacity: canPay ? 1 : 0.65,
                    color: '#ffffff',
                    fontSize: '14.5px',
                    fontWeight: 700,
                    padding: '12px 18px',
                    minHeight: '44px',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: canPay ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: canPay ? '0 4px 12px rgba(0, 0, 0, 0.25)' : 'none',
                    transition: 'all 0.2s ease',
                  }}
                  aria-label={canPay ? 'Simulate Apple Pay deposit of $500' : 'Sign above to unlock Apple Pay deposit'}
                >
                  {isProcessing ? (
                    'Processing simulated deposit...'
                  ) : (
                    <>
                      {/* Clean SVG Apple Icon to avoid missing unicode glyph box */}
                      <svg width="15" height="18" viewBox="0 0 170 170" fill="#ffffff" aria-hidden="true">
                        <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.04-7.69-7.85-11.97-14.42-6.53-9.97-11.7-21.72-15.52-35.25-3.82-13.53-5.73-26.17-5.73-37.92 0-14.93 3.65-27.18 10.96-36.75 7.31-9.57 16.59-14.48 27.84-14.73 4.9 0 10.37 1.34 16.42 4.02 6.05 2.68 9.94 4.08 11.67 4.2 2.01-.24 6.13-1.68 12.37-4.32 6.24-2.64 11.64-3.83 16.2-3.57 12.74.85 22.84 5.75 30.3 14.7-10.96 6.66-16.32 15.77-16.08 27.33.24 9.38 3.86 17.29 10.86 23.73 7 6.44 15.24 10.23 24.72 11.37-2.32 7.08-5.22 14.28-8.7 21.61zM119.22 31.84c0-7.23 2.65-13.97 7.95-20.22 5.3-6.25 11.83-10.33 19.59-12.24-.24 1.34-.42 2.45-.54 3.33-.85 6.65-3.69 13.1-8.52 19.35-4.83 6.25-10.87 10.42-18.12 12.51-.24-.97-.36-1.88-.36-2.73z" />
                      </svg>
                      <span>{canPay ? 'Simulate Apple Pay deposit ($500.00)' : 'Sign above to unlock Apple Pay ($500.00)'}</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div
                style={{
                  background: '#f0fff4',
                  border: '1px solid #9ae6b4',
                  borderRadius: '10px',
                  padding: '18px',
                  marginBottom: '16px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '22px', marginBottom: '4px' }}>🎉</div>
                <strong style={{ fontSize: '15px', color: '#22543d', display: 'block' }}>
                  Simulated Deposit Recorded &middot; Booking Confirmed!
                </strong>
                <p style={{ fontSize: '13px', color: '#276749', margin: '4px 0 12px' }}>
                  Demo complete — simulated $500.00 deposit was captured (no money moved). Arrival slot reserved for <strong>{DEMO_TOUR_JOB.scheduledDate}</strong>.
                </p>

                {/* LGQ Business Result Chip */}
                <div
                  style={{
                    background: 'rgba(56, 161, 105, 0.12)',
                    border: '1px solid rgba(56, 161, 105, 0.35)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    marginBottom: '14px',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <span style={{ fontSize: '15px' }} aria-hidden="true">⚡</span>
                  <span style={{ fontSize: '12px', color: '#22543d' }}>
                    <strong style={{ color: '#22543d' }}>LGQ Automated Result:</strong> Deposit captured directly into Stripe with 0 phone tag. Customer automatically booked for Thursday, Aug 28.
                  </span>
                </div>

                <Link
                  href="/demo/tour/complete"
                  className={styles.tourNextActionBtn}
                  style={{ width: '100%', justifyContent: 'center', minHeight: '44px' }}
                  aria-label="Proceed to Tour Summary"
                >
                  View Tour Summary &rarr;
                </Link>
              </div>
            )}

            {!state.depositSimulated && (
              <div style={{ textAlign: 'center', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => handleSimulatePayment('card')}
                  disabled={!canPay || isProcessing}
                  aria-disabled={!canPay || isProcessing}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: canPay ? '#4a5568' : '#a0aec0',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    textDecoration: canPay ? 'underline' : 'none',
                    cursor: canPay ? 'pointer' : 'not-allowed',
                    minHeight: '44px',
                    padding: '6px 10px',
                  }}
                  aria-label="Simulate credit card deposit payment"
                >
                  {canPay ? 'Or simulate credit card deposit →' : '(Credit card deposit unlocks after signature)'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

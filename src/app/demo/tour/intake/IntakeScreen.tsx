'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import DemoTourBar from '@/components/demo/DemoTourBar';
import {
  TOUR_STEPS,
  DEMO_TOUR_CONTRACTOR,
  DEMO_TOUR_CUSTOMER,
  DEMO_TOUR_JOB,
} from '@/lib/demo-tour-data';
import styles from '../tour.module.css';

type AnalysisStep = {
  id: string;
  label: string;
  detail: string;
  icon: string;
};

const ANALYSIS_STEPS: AnalysisStep[] = [
  { id: 'received', label: '1. Request Received', detail: 'Homeowner submitted inquiry via website instant estimate', icon: '📥' },
  { id: 'extracting', label: '2. Extracting Scope', detail: 'Identified 380 sq ft paver patio, curved seat wall, natural stone fire pit', icon: '🔍' },
  { id: 'location', label: '3. Checking Service & Route', detail: 'Royal Oak, MI (Primary zone · 1.4 mi from Tuesday crew route)', icon: '📍' },
  { id: 'pricing', label: '4. Estimating Range', detail: 'Catalog matched pavers, drainage base, and fire pit hardware ($4,650 – $5,000)', icon: '⚡' },
];

export default function IntakeScreen() {
  const currentStep = TOUR_STEPS[1];
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [message] = useState(DEMO_TOUR_JOB.homeownerInquiry);

  useEffect(() => {
    // Check prefers-reduced-motion
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setActiveStepIndex(ANALYSIS_STEPS.length);
      setIsCompleted(true);
      return;
    }

    let current = 0;
    const interval = setInterval(() => {
      current += 1;
      if (current <= ANALYSIS_STEPS.length) {
        setActiveStepIndex(current);
      }
      if (current >= ANALYSIS_STEPS.length) {
        setIsCompleted(true);
        clearInterval(interval);
      }
    }, 850);

    return () => clearInterval(interval);
  }, []);

  const handleSkipAnimation = () => {
    setActiveStepIndex(ANALYSIS_STEPS.length);
    setIsCompleted(true);
  };

  const handleReplay = () => {
    setIsCompleted(false);
    setActiveStepIndex(0);
    let current = 0;
    const interval = setInterval(() => {
      current += 1;
      if (current <= ANALYSIS_STEPS.length) {
        setActiveStepIndex(current);
      }
      if (current >= ANALYSIS_STEPS.length) {
        setIsCompleted(true);
        clearInterval(interval);
      }
    }, 800);
  };

  return (
    <div className={styles.tourContainer}>
      <DemoTourBar currentStep={currentStep} />

      {/* Perspective Context Banner */}
      <div className={styles.perspectiveHero}>
        <div className={styles.perspectiveHeroInner}>
          <div className={styles.perspectiveInfo}>
            <span className={styles.perspectiveTag}>👤 Homeowner Perspective · Step 2 of 6</span>
            <h1 className={styles.perspectiveHeading}>Homeowner requests an instant estimate</h1>
            <p className={styles.perspectiveSub}>
              Watch how AI Intake qualifies scope, detects urgency, and prepares preliminary pricing automatically in seconds.
            </p>
          </div>
        </div>
      </div>

      <div className={styles.cardLayout}>
        <div className={styles.panelCard}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#50e3bd', letterSpacing: '1px', textTransform: 'uppercase' }}>
                AI Smart Intake &middot; 24/7 Live Qualification
              </span>
              <h2 style={{ fontSize: '24px', fontWeight: 700, margin: '4px 0 0', color: '#ffffff' }}>
                {DEMO_TOUR_CONTRACTOR.name} &mdash; Project Intake
              </h2>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {!isCompleted ? (
                <button
                  type="button"
                  onClick={handleSkipAnimation}
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    color: '#d1e2eb',
                    fontSize: '13px',
                    fontWeight: 600,
                    padding: '8px 14px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    minHeight: '44px',
                  }}
                  aria-label="Show result immediately"
                >
                  Show result immediately &rarr;
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleReplay}
                  style={{
                    background: 'rgba(80, 227, 189, 0.15)',
                    border: '1px solid rgba(80, 227, 189, 0.4)',
                    color: '#50e3bd',
                    fontSize: '13px',
                    fontWeight: 700,
                    padding: '8px 14px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    minHeight: '44px',
                  }}
                  aria-label="Re-play AI qualification analysis"
                >
                  🔄 Re-play AI Analysis
                </button>
              )}
            </div>
          </div>

          <div
            style={{
              background: '#040d14',
              border: '1px solid rgba(168, 204, 255, 0.15)',
              borderRadius: '12px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}
          >
            {/* Customer Message Bubble */}
            <div style={{ alignSelf: 'flex-start', maxWidth: '85%' }}>
              <div style={{ fontSize: '12px', color: '#9db0bd', marginBottom: '4px', fontWeight: 600 }}>
                {DEMO_TOUR_CUSTOMER.name} &middot; {DEMO_TOUR_CUSTOMER.address}, {DEMO_TOUR_CUSTOMER.city}
              </div>
              <div
                style={{
                  background: '#153245',
                  color: '#ffffff',
                  padding: '14px 18px',
                  borderRadius: '12px 12px 12px 2px',
                  fontSize: '14.5px',
                  lineHeight: '1.5',
                  border: '1px solid rgba(80, 227, 189, 0.25)',
                }}
              >
                {message}
              </div>
            </div>

            {/* Staged Qualification Steps */}
            <div
              style={{
                background: 'rgba(8, 24, 36, 0.7)',
                border: '1px solid rgba(80, 227, 189, 0.2)',
                borderRadius: '10px',
                padding: '16px 20px',
              }}
              role="status"
              aria-live="polite"
            >
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#50e3bd', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '10px' }}>
                AI Processing Sequence
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {ANALYSIS_STEPS.map((s, idx) => {
                  const isDone = activeStepIndex > idx;
                  const isCurrent = activeStepIndex === idx && !isCompleted;
                  return (
                    <div
                      key={s.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        fontSize: '13.5px',
                        color: isDone ? '#50e3bd' : isCurrent ? '#ffd166' : '#57707e',
                        transition: 'all 0.3s ease',
                      }}
                    >
                      <span>{isDone ? '✓' : isCurrent ? '⏳' : '○'}</span>
                      <span style={{ fontWeight: isCurrent || isDone ? 700 : 500 }}>{s.label}:</span>
                      <span style={{ color: isDone ? '#d1e2eb' : isCurrent ? '#ffd166' : '#57707e', fontSize: '13px' }}>
                        {s.detail}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* AI Real-time Qualification Output Card */}
            {isCompleted ? (
              <div style={{ alignSelf: 'flex-end', maxWidth: '90%', width: '100%' }}>
                <div style={{ fontSize: '12px', color: '#50e3bd', marginBottom: '4px', fontWeight: 600, textAlign: 'right' }}>
                  ✦ AI Estimator Response &middot; Instant Breakdown
                </div>
                <div
                  style={{
                    background: 'linear-gradient(145deg, #0d2738 0%, #081a26 100%)',
                    color: '#f1f7fa',
                    padding: '20px',
                    borderRadius: '12px 12px 2px 12px',
                    fontSize: '14px',
                    lineHeight: '1.5',
                    border: '1px solid rgba(80, 227, 189, 0.35)',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
                  }}
                >
                  <p style={{ margin: '0 0 12px', color: '#ffffff', fontWeight: 600 }}>
                    Thanks Taylor! We specialize in custom paver patios, curved seat walls, and stone fire pits in Royal Oak.
                  </p>

                  <div style={{ background: 'rgba(0, 0, 0, 0.3)', borderRadius: '8px', padding: '12px 16px', margin: '12px 0' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', fontSize: '13px' }}>
                      <div><strong style={{ color: '#ffd166' }}>Scope:</strong> 380 sq ft Pavers</div>
                      <div><strong style={{ color: '#ffd166' }}>Features:</strong> Seat Wall &amp; Fire Pit</div>
                      <div><strong style={{ color: '#ffd166' }}>Sub-base:</strong> Drainage &amp; Edging</div>
                      <div><strong style={{ color: '#50e3bd' }}>Estimated Range:</strong> $4,650 &ndash; $5,000</div>
                    </div>
                  </div>

                  <p style={{ margin: '0', fontSize: '13px', color: '#9db0bd' }}>
                    Our project manager has been alerted. We will generate your final itemized quote right away!
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <div
            style={{
              marginTop: '28px',
              padding: '20px',
              background: 'rgba(255, 209, 102, 0.1)',
              border: '1px solid rgba(255, 209, 102, 0.3)',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <strong style={{ color: '#ffd166', fontSize: '15px' }}>Next in evaluation tour:</strong>
              <p style={{ margin: '2px 0 0', fontSize: '13.5px', color: '#eef5f6' }}>
                Switch perspectives and see how Taylor&apos;s lead arrives ranked in your contractor Leads inbox.
              </p>
            </div>
            <Link
              href="/demo/tour/lead"
              className={styles.tourNextActionBtn}
              style={{ background: '#ffd166', color: '#180c02', minHeight: '44px', display: 'inline-flex', alignItems: 'center' }}
              aria-label="Proceed to Contractor Leads Inbox"
            >
              View in Leads Inbox &rarr;
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

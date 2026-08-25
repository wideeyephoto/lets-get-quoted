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

export default function IntakeScreen() {
  const currentStep = TOUR_STEPS[1];
  const [stage, setStage] = useState<'prompt' | 'typing' | 'done'>('done');
  const [message] = useState(DEMO_TOUR_JOB.homeownerInquiry);

  const handleSimulate = () => {
    setStage('typing');
    setTimeout(() => {
      setStage('done');
    }, 1200);
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
              Watch how AI Intake qualifies scope, detects urgency, and prepares preliminary pricing automatically.
            </p>
          </div>
          <Link href="/demo/tour/lead" className={styles.tourNextActionBtn}>
            Switch to Contractor View &rarr;
          </Link>
        </div>
      </div>

      <div className={styles.cardLayout}>
        <div className={styles.panelCard}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#50e3bd', letterSpacing: '1px', textTransform: 'uppercase' }}>
                AI Smart Intake &middot; 24/7 Estimator
              </span>
              <h2 style={{ fontSize: '24px', fontWeight: 700, margin: '4px 0 0', color: '#ffffff' }}>
                {DEMO_TOUR_CONTRACTOR.name} &mdash; Project Intake
              </h2>
            </div>
            <button
              type="button"
              onClick={handleSimulate}
              style={{
                background: 'rgba(80, 227, 189, 0.15)',
                border: '1px solid rgba(80, 227, 189, 0.4)',
                color: '#50e3bd',
                fontSize: '13px',
                fontWeight: 700,
                padding: '6px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              🔄 Re-play AI Analysis
            </button>
          </div>

          <div
            style={{
              background: '#040d14',
              border: '1px solid rgba(168, 204, 255, 0.15)',
              borderRadius: '12px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
            }}
          >
            {/* Customer Message Bubble */}
            <div style={{ alignSelf: 'flex-start', maxWidth: '85%' }}>
              <div style={{ fontSize: '12px', color: '#9db0bd', marginBottom: '4px', fontWeight: 600 }}>
                {DEMO_TOUR_CUSTOMER.name} &middot; {DEMO_TOUR_CUSTOMER.address}
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

            {/* AI Real-time Qualification Analysis */}
            {stage === 'typing' ? (
              <div style={{ alignSelf: 'flex-end', maxWidth: '85%' }}>
                <div style={{ fontSize: '12px', color: '#50e3bd', marginBottom: '4px', fontWeight: 600 }}>
                  ✦ AI Estimator analyzing scope &amp; location...
                </div>
                <div
                  style={{
                    background: 'rgba(80, 227, 189, 0.1)',
                    color: '#a4bcc7',
                    padding: '14px 18px',
                    borderRadius: '12px 12px 2px 12px',
                    fontSize: '14px',
                    fontStyle: 'italic',
                  }}
                >
                  Checking service requirements, Maplewood permit rules, and route proximity...
                </div>
              </div>
            ) : (
              <div style={{ alignSelf: 'flex-end', maxWidth: '90%' }}>
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
                    Thanks Sarah! We specialize in heavy-up 200A panel upgrades and Level 2 EV charging circuits in Maplewood.
                  </p>

                  <div style={{ background: 'rgba(0, 0, 0, 0.3)', borderRadius: '8px', padding: '12px 16px', margin: '12px 0' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', fontSize: '13px' }}>
                      <div><strong style={{ color: '#ffd166' }}>Service:</strong> 200A Square D Panel</div>
                      <div><strong style={{ color: '#ffd166' }}>EV Run:</strong> 45 ft 50A Circuit</div>
                      <div><strong style={{ color: '#ffd166' }}>Permits:</strong> Included &amp; Filed</div>
                      <div><strong style={{ color: '#50e3bd' }}>Estimated Range:</strong> $4,650 &ndash; $5,000</div>
                    </div>
                  </div>

                  <p style={{ margin: '0', fontSize: '13px', color: '#9db0bd' }}>
                    Our master electrician has been alerted. We will generate your final itemized quote right away!
                  </p>
                </div>
              </div>
            )}
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
                Switch perspectives and see how Sarah&apos;s lead arrives ranked in your contractor Leads inbox.
              </p>
            </div>
            <Link
              href="/demo/tour/lead"
              className={styles.tourNextActionBtn}
              style={{ background: '#ffd166', color: '#180c02' }}
            >
              View in Leads Inbox &rarr;
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

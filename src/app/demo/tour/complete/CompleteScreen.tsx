'use client';

import Link from 'next/link';
import DemoTourBar from '@/components/demo/DemoTourBar';
import { useDemoTourState } from '@/components/demo/DemoTourStateProvider';
import {
  TOUR_STEPS,
  DEMO_TOUR_CUSTOMER,
  DEMO_TOUR_JOB,
} from '@/lib/demo-tour-data';
import { buildStartUrl } from '@/lib/signup-intent';
import { trackDemoEvent } from '@/lib/demo-analytics';
import { useEffect } from 'react';
import styles from '../tour.module.css';

export default function CompleteScreen() {
  const currentStep = TOUR_STEPS[5];
  const { state, resetTourState } = useDemoTourState();
  const signupUrl = buildStartUrl({ goal: 'build_site', source: 'demo_complete' });

  const total = DEMO_TOUR_JOB.baseTotal + (state.upgradeSelected ? DEMO_TOUR_JOB.upgradeTotal : 0);
  const anyActionSimulated = state.quoteSent || state.signed || state.depositSimulated;
  const allActionsSimulated = state.quoteSent && state.signed && state.depositSimulated;

  useEffect(() => {
    trackDemoEvent('tour_completed', {
      source: 'demo_evaluation_journey',
      totalSteps: 6,
      upgradeSelected: state.upgradeSelected,
      quoteSent: state.quoteSent,
      signed: state.signed,
      depositSimulated: state.depositSimulated,
      paymentMethod: state.paymentMethod,
    });
  }, [state]);

  const handleRestart = () => {
    resetTourState();
    trackDemoEvent('explore_freely', { source: 'tour_restart_button' });
  };

  return (
    <div className={styles.tourContainer}>
      <DemoTourBar currentStep={currentStep} />

      {/* Perspective Context Banner */}
      <div className={styles.perspectiveHeroSummary}>
        <div className={styles.perspectiveHeroInner}>
          <div className={styles.perspectiveInfo}>
            <span className={`${styles.perspectiveTag} ${styles.perspectiveTagSummary}`}>
              ✨ Evaluation Complete · 5-Minute Journey
            </span>
            <h1 className={styles.perspectiveHeading}>From first click to job kickoff</h1>
            <p className={styles.perspectiveSub}>
              You just walked through a complete contractor job lifecycle without switching tools or losing context.
            </p>
          </div>
        </div>
      </div>

      <div className={styles.cardLayout}>
        <div className={styles.panelCard} style={{ textAlign: 'center', maxWidth: '820px', margin: '0 auto' }}>
          <div style={{ fontSize: '42px', marginBottom: '12px' }}>🎯</div>
          <h2 style={{ fontSize: '32px', fontWeight: 800, color: '#ffffff', margin: '0 0 12px', letterSpacing: '-0.02em' }}>
            One connected system for winning work &amp; getting paid.
          </h2>

          {/* Dynamic Honest Summary Copy based on actual user interactions */}
          <p style={{ fontSize: '16px', color: '#b2c7d3', lineHeight: '1.6', margin: '0 auto 36px', maxWidth: '640px' }}>
            {allActionsSimulated ? (
              <>
                Taylor&apos;s quote was signed and the simulated $500 deposit was recorded for the{' '}
                <strong style={{ color: '#50e3bd' }}>${total.toLocaleString()}</strong> project (
                {state.upgradeSelected ? 'with lighting upgrade' : 'base hardscape package'}).
              </>
            ) : anyActionSimulated ? (
              <>
                In 5 minutes, you simulated key quote and deposit workflows for {DEMO_TOUR_CUSTOMER.name}&apos;s{' '}
                <strong style={{ color: '#50e3bd' }}>${total.toLocaleString()}</strong> paver patio project.
              </>
            ) : (
              <>
                You previewed the full contractor workflow for {DEMO_TOUR_CUSTOMER.name}&apos;s{' '}
                <strong style={{ color: '#50e3bd' }}>${total.toLocaleString()}</strong> project from website intake to quote review and scheduling.
              </>
            )}
          </p>

          {/* 5-Step Visual Recap Strip */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '12px',
              textAlign: 'left',
              marginBottom: '40px',
            }}
          >
            <div style={{ background: '#040d14', border: '1px solid rgba(80, 227, 189, 0.3)', borderRadius: '8px', padding: '14px' }}>
              <span style={{ fontSize: '10px', color: '#50e3bd', fontWeight: 800 }}>STEP 1</span>
              <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#ffffff', margin: '4px 0 2px' }}>Website Visit</div>
              <small style={{ color: '#8faab7', fontSize: '11.5px' }}>Free contractor site</small>
            </div>

            <div style={{ background: '#040d14', border: '1px solid rgba(80, 227, 189, 0.3)', borderRadius: '8px', padding: '14px' }}>
              <span style={{ fontSize: '10px', color: '#50e3bd', fontWeight: 800 }}>STEP 2</span>
              <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#ffffff', margin: '4px 0 2px' }}>AI Intake</div>
              <small style={{ color: '#8faab7', fontSize: '11.5px' }}>24/7 quote request</small>
            </div>

            <div style={{ background: '#040d14', border: '1px solid rgba(255, 209, 102, 0.3)', borderRadius: '8px', padding: '14px' }}>
              <span style={{ fontSize: '10px', color: '#ffd166', fontWeight: 800 }}>STEP 3</span>
              <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#ffffff', margin: '4px 0 2px' }}>Ranked Lead</div>
              <small style={{ color: '#8faab7', fontSize: '11.5px' }}>Score: 94/100 HOT</small>
            </div>

            <div style={{ background: '#040d14', border: '1px solid rgba(255, 209, 102, 0.3)', borderRadius: '8px', padding: '14px' }}>
              <span style={{ fontSize: '10px', color: '#ffd166', fontWeight: 800 }}>STEP 4</span>
              <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#ffffff', margin: '4px 0 2px' }}>Itemized Quote</div>
              <small style={{ color: '#8faab7', fontSize: '11.5px' }}>
                {state.upgradeSelected ? '+ Lighting ($5,000)' : 'Base only ($4,650)'}
              </small>
            </div>

            <div style={{ background: '#040d14', border: '1px solid rgba(80, 227, 189, 0.3)', borderRadius: '8px', padding: '14px' }}>
              <span style={{ fontSize: '10px', color: '#50e3bd', fontWeight: 800 }}>STEP 5</span>
              <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#ffffff', margin: '4px 0 2px' }}>
                {state.depositSimulated ? 'Simulated Deposit' : state.signed ? 'Signed Quote' : 'Approval Step'}
              </div>
              <small style={{ color: '#8faab7', fontSize: '11.5px' }}>
                {state.depositSimulated
                  ? `$500 ${state.paymentMethod === 'card' ? 'card' : 'Apple Pay'} demo`
                  : state.signed
                  ? 'Demo signature saved'
                  : 'Workflow previewed'}
              </small>
            </div>
          </div>

          {/* Primary Action Buttons */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              flexWrap: 'wrap',
            }}
          >
            <a
              href={signupUrl}
              onClick={() => {
                trackDemoEvent('cta_clicked', { source: 'tour_complete_main_button', action: 'build_free_site' });
                trackDemoEvent('signup_clicked', { source: 'tour_complete_main_button' });
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '44px',
                gap: '8px',
                background: '#ff6a24',
                color: '#0b1e2a',
                fontSize: '16px',
                fontWeight: 800,
                padding: '14px 28px',
                borderRadius: '8px',
                textDecoration: 'none',
                boxShadow: '0 4px 20px rgba(255, 106, 36, 0.4)',
                transition: 'all 0.2s ease',
              }}
              aria-label="Build my free site on Let's Get Quoted"
            >
              Build my free site &rarr;
            </a>

            <Link
              href="/demo"
              onClick={() => trackDemoEvent('explore_freely', { source: 'tour_complete_explore_button' })}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '44px',
                gap: '8px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#ffffff',
                fontSize: '15px',
                fontWeight: 700,
                padding: '13px 24px',
                borderRadius: '8px',
                textDecoration: 'none',
                transition: 'all 0.2s ease',
              }}
              aria-label="Explore demo dashboard freely"
            >
              Explore dashboard freely &rarr;
            </Link>

            <Link
              href="/demo/tour/site"
              onClick={handleRestart}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '44px',
                gap: '6px',
                background: 'transparent',
                border: '1px solid rgba(80, 227, 189, 0.3)',
                color: '#50e3bd',
                fontSize: '14px',
                fontWeight: 600,
                padding: '12px 18px',
                borderRadius: '8px',
                textDecoration: 'none',
                transition: 'all 0.2s ease',
              }}
              aria-label="Restart the evaluation tour"
            >
              🔄 Restart tour
            </Link>
          </div>

          <p style={{ marginTop: '24px', fontSize: '13px', color: '#7b93a2' }}>
            Sample simulation only &middot; Flex plan starts at $0/month &middot; No credit card required to start
          </p>
        </div>
      </div>
    </div>
  );
}

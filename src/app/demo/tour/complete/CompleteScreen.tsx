'use client';

import Link from 'next/link';
import DemoTourFrame from '@/components/demo/DemoTourFrame';
import { useDemoTourState } from '@/components/demo/DemoTourStateProvider';
import {
  TOUR_STEPS,
  DEMO_TOUR_CONTRACTOR,
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

  const signupUrl = buildStartUrl({
    goal: 'build_site',
    trade: DEMO_TOUR_CONTRACTOR.tradeKey || 'landscaping',
    source: 'demo_tour',
  });

  const total = DEMO_TOUR_JOB.baseTotal + (state.upgradeSelected ? DEMO_TOUR_JOB.upgradeTotal : 0);
  const anyActionSimulated = state.quoteSent || state.signed || state.depositSimulated;
  const allActionsSimulated = state.quoteSent && state.signed && state.depositSimulated;

  useEffect(() => {
    trackDemoEvent('tour_completed', {
      source: 'demo_evaluation_journey',
      totalSteps: 6,
      trade: DEMO_TOUR_CONTRACTOR.tradeKey || 'landscaping',
      upgradeSelected: state.upgradeSelected,
      quoteSent: state.quoteSent,
      signed: state.signed,
      depositSimulated: state.depositSimulated,
      paymentMethod: state.paymentMethod,
    });
  }, [state]);

  const handleRestart = () => {
    resetTourState();
    trackDemoEvent('tour_restarted', { source: 'tour_restart_button' });
    trackDemoEvent('explore_freely', { source: 'tour_restart_button' });
  };

  const tradeCtaLabel = DEMO_TOUR_CONTRACTOR.tradeCta || 'Build my landscaping site →';

  return (
    <DemoTourFrame currentStep={currentStep}>

      <div className={styles.cardLayout}>
        <div className={styles.panelCard} style={{ textAlign: 'center', maxWidth: '840px', margin: '0 auto' }}>
          <div style={{ fontSize: '40px', marginBottom: '10px' }}>🎯</div>
          <h2 style={{ fontSize: '30px', fontWeight: 800, color: '#ffffff', margin: '0 0 10px', letterSpacing: '-0.02em' }}>
            One connected system for winning work &amp; getting paid.
          </h2>

          {/* Dynamic Honest Summary Copy based on actual user interactions */}
          <p style={{ fontSize: '15px', color: '#b2c7d3', lineHeight: '1.6', margin: '0 auto 28px', maxWidth: '640px' }}>
            {allActionsSimulated ? (
              <>
                Taylor&apos;s quote was signed and the simulated ${DEMO_TOUR_JOB.requiredDeposit.toLocaleString()} deposit was recorded for the{' '}
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

          {/* Compact High-Impact Outcome KPI Result Card */}
          <div
            style={{
              background: '#040d14',
              border: '1px solid rgba(80, 227, 189, 0.35)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '32px',
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#50e3bd', letterSpacing: '1px', textTransform: 'uppercase' }}>
                Live operating result
              </span>
              <span style={{ fontSize: '11px', color: '#8faab7', background: 'rgba(255, 255, 255, 0.06)', padding: '2px 8px', borderRadius: '4px' }}>
                Illustrative Demo Metrics
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '14px',
              }}
            >
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <span style={{ fontSize: '11px', color: '#8faab7', textTransform: 'uppercase', display: 'block' }}>Response Time</span>
                <strong style={{ fontSize: '17px', color: '#50e3bd', display: 'block', marginTop: '2px' }}>&lt; 1 min</strong>
                <small style={{ fontSize: '11px', color: '#a0aec0' }}>Instant AI qualify</small>
              </div>

              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <span style={{ fontSize: '11px', color: '#8faab7', textTransform: 'uppercase', display: 'block' }}>Lead Score</span>
                <strong style={{ fontSize: '17px', color: '#ffd166', display: 'block', marginTop: '2px' }}>94/100 HOT</strong>
                <small style={{ fontSize: '11px', color: '#a0aec0' }}>2.1 mi route fit</small>
              </div>

              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <span style={{ fontSize: '11px', color: '#8faab7', textTransform: 'uppercase', display: 'block' }}>New Booked Work</span>
                <strong style={{ fontSize: '17px', color: '#ffffff', display: 'block', marginTop: '2px' }}>${total.toLocaleString()}</strong>
                <small style={{ fontSize: '11px', color: '#a0aec0' }}>{state.upgradeSelected ? '+ LED Lighting' : 'Base package'}</small>
              </div>

              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <span style={{ fontSize: '11px', color: '#8faab7', textTransform: 'uppercase', display: 'block' }}>Simulated Deposit</span>
                <strong style={{ fontSize: '17px', color: state.depositSimulated ? '#50e3bd' : '#ffd166', display: 'block', marginTop: '2px' }}>
                  ${DEMO_TOUR_JOB.requiredDeposit.toLocaleString()}
                </strong>
                <small style={{ fontSize: '11px', color: '#a0aec0' }}>
                  {state.depositSimulated ? `${state.paymentMethod === 'card' ? 'Card' : 'Apple Pay'} captured` : 'Ready for payment'}
                </small>
              </div>

              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <span style={{ fontSize: '11px', color: '#8faab7', textTransform: 'uppercase', display: 'block' }}>Next Step</span>
                <strong style={{ fontSize: '14px', color: '#ffffff', display: 'block', marginTop: '4px' }}>Thursday Crew</strong>
                <small style={{ fontSize: '11px', color: '#a0aec0' }}>Arrival window locked</small>
              </div>
            </div>

            <div className={styles.bookedJobResult}>
              <div className={styles.bookedJobDate}>
                <span>Thu</span>
                <strong>28</strong>
              </div>
              <div className={styles.bookedJobDetails}>
                <span>Scheduled job · {DEMO_TOUR_JOB.scheduledArrivalWindow}</span>
                <strong>{DEMO_TOUR_CUSTOMER.name} · {DEMO_TOUR_JOB.title}</strong>
                <small>{DEMO_TOUR_JOB.crewAssigned} · {DEMO_TOUR_CUSTOMER.address}</small>
              </div>
              <span className={styles.bookedJobStatus}>
                <i aria-hidden="true" /> {state.depositSimulated ? 'Booked & paid' : 'Ready to book'}
              </span>
            </div>
          </div>

          {/* Primary Action Buttons */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '14px',
              flexWrap: 'wrap',
            }}
          >
            <a
              href={signupUrl}
              onClick={() => {
                trackDemoEvent('cta_clicked', { source: 'tour_complete_main_button', action: 'build_landscaping_site', trade: 'landscaping' });
                trackDemoEvent('signup_clicked', { source: 'tour_complete_main_button', trade: 'landscaping' });
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '48px',
                gap: '8px',
                background: '#ff6a24',
                color: '#0b1e2a',
                fontSize: '15.5px',
                fontWeight: 800,
                padding: '14px 26px',
                borderRadius: '8px',
                textDecoration: 'none',
                boxShadow: '0 4px 20px rgba(255, 106, 36, 0.4)',
                transition: 'all 0.2s ease',
              }}
              aria-label={tradeCtaLabel}
            >
              {tradeCtaLabel}
            </a>

            <Link
              href="/demo/schedule/booking"
              onClick={() => trackDemoEvent('cta_clicked', { source: 'tour_complete_walkthrough_button', action: 'book_walkthrough' })}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '48px',
                gap: '8px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                color: '#ffffff',
                fontSize: '14.5px',
                fontWeight: 700,
                padding: '12px 22px',
                borderRadius: '8px',
                textDecoration: 'none',
                transition: 'all 0.2s ease',
              }}
              aria-label="Book a 15-minute product walkthrough"
            >
              Book a 15-minute walkthrough &rarr;
            </Link>

            <Link
              href="/demo/tour/site"
              onClick={handleRestart}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '48px',
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

          <div style={{ marginTop: '20px' }}>
            <Link
              href="/demo"
              onClick={() => trackDemoEvent('explore_freely', { source: 'tour_complete_explore_link' })}
              style={{ color: '#8faab7', fontSize: '13px', textDecoration: 'underline' }}
            >
              Or explore full demo dashboard freely &rarr;
            </Link>
          </div>

          <p style={{ marginTop: '20px', fontSize: '12.5px', color: '#637b8b' }}>
            Sample simulation only &middot; Flex plan starts at $0/month &middot; No credit card required to start
          </p>
        </div>
      </div>
    </DemoTourFrame>
  );
}

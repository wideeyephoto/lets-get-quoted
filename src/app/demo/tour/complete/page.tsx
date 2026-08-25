import Link from 'next/link';
import DemoTourBar from '@/components/demo/DemoTourBar';
import {
  TOUR_STEPS,
  DEMO_TOUR_CUSTOMER,
  DEMO_TOUR_JOB,
} from '@/lib/demo-tour-data';
import { buildStartUrl } from '@/lib/signup-intent';
import styles from '../tour.module.css';

export const metadata = {
  title: 'Evaluation Tour Complete — Let’s Get Quoted',
};

export default function DemoTourCompletePage() {
  const currentStep = TOUR_STEPS[5];
  const signupUrl = buildStartUrl({ goal: 'build_site', source: 'demo_complete' });

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
            <h1 className={styles.perspectiveHeading}>From first click to paid deposit</h1>
            <p className={styles.perspectiveSub}>
              You just walked through a complete contractor job lifecycle without switching tools or losing context.
            </p>
          </div>
          <a
            href={signupUrl}
            className={styles.tourNextActionBtn}
            style={{ background: '#50e3bd', color: '#09212f' }}
          >
            Build My Free Site &rarr;
          </a>
        </div>
      </div>

      <div className={styles.cardLayout}>
        <div className={styles.panelCard} style={{ textAlign: 'center', maxWidth: '820px', margin: '0 auto' }}>
          <div style={{ fontSize: '42px', marginBottom: '12px' }}>🎯</div>
          <h2 style={{ fontSize: '32px', fontWeight: 800, color: '#ffffff', margin: '0 0 12px', letterSpacing: '-0.02em' }}>
            One connected system for winning work &amp; getting paid.
          </h2>
          <p style={{ fontSize: '16px', color: '#b2c7d3', lineHeight: '1.6', margin: '0 auto 36px', maxWidth: '640px' }}>
            In 5 minutes, you saw how {DEMO_TOUR_CUSTOMER.name}&apos;s ${DEMO_TOUR_JOB.totalWithUpgrade.toLocaleString()} panel upgrade moved from a website visit to an e-signed quote with a $500 deposit in your bank.
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
              <small style={{ color: '#8faab7', fontSize: '11.5px' }}>+ Surge protection</small>
            </div>

            <div style={{ background: '#040d14', border: '1px solid rgba(80, 227, 189, 0.3)', borderRadius: '8px', padding: '14px' }}>
              <span style={{ fontSize: '10px', color: '#50e3bd', fontWeight: 800 }}>STEP 5</span>
              <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#ffffff', margin: '4px 0 2px' }}>Signed &amp; Paid</div>
              <small style={{ color: '#8faab7', fontSize: '11.5px' }}>$500 Pay deposit</small>
            </div>
          </div>

          {/* Two Primary Next Actions */}
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
              style={{
                display: 'inline-flex',
                alignItems: 'center',
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
            >
              Build my free site &rarr;
            </a>

            <Link
              href="/demo"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
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
            >
              Explore dashboard freely &rarr;
            </Link>
          </div>

          <p style={{ marginTop: '24px', fontSize: '13px', color: '#7b93a2' }}>
            Flex plan starts at $0/month &middot; No credit card required &middot; Free onboarding &amp; site setup
          </p>
        </div>
      </div>
    </div>
  );
}

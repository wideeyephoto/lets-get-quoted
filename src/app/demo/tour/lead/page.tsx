import Link from 'next/link';
import DemoTourFrame from '@/components/demo/DemoTourFrame';
import {
  TOUR_STEPS,
  DEMO_TOUR_CONTRACTOR,
  DEMO_TOUR_CUSTOMER,
  DEMO_TOUR_JOB,
} from '@/lib/demo-tour-data';
import styles from '../tour.module.css';

export const metadata = {
  title: 'Step 3: Receive Qualified Lead — Live Evaluation Tour',
};

export default function DemoTourLeadPage() {
  const currentStep = TOUR_STEPS[2];

  return (
    <DemoTourFrame currentStep={currentStep}>

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
            <span style={{ color: '#ffffff', fontWeight: 600 }}>Leads Workspace</span>
            <span>&rsaquo;</span>
            <span style={{ color: '#ffd166' }}>{DEMO_TOUR_JOB.leadId}</span>
          </div>
          <span style={{ background: 'rgba(80, 227, 189, 0.15)', color: '#50e3bd', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
            Live LGQ Dashboard Preview
          </span>
        </div>

        <div className={styles.panelCard} style={{ borderRadius: '0 0 14px 14px' }}>
          {/* Header row with Lead Score and badges */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: '20px',
              borderBottom: '1px solid rgba(168, 204, 255, 0.15)',
              marginBottom: '24px',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  style={{
                    background: '#ff6a24',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 800,
                    padding: '3px 10px',
                    borderRadius: '999px',
                    textTransform: 'uppercase',
                  }}
                >
                  🔥 Lead Score: {DEMO_TOUR_JOB.leadScore}/100 HOT
                </span>
                <span style={{ fontSize: '13px', color: '#9db0bd' }}>{DEMO_TOUR_JOB.leadId}</span>
              </div>
              <h2 style={{ fontSize: '24px', fontWeight: 800, margin: '8px 0 0', color: '#ffffff' }}>
                {DEMO_TOUR_JOB.title}
              </h2>
            </div>
          </div>

          {/* LGQ Business Result Chip */}
          <div
            style={{
              background: 'rgba(80, 227, 189, 0.12)',
              border: '1px solid rgba(80, 227, 189, 0.35)',
              borderRadius: '8px',
              padding: '10px 16px',
              marginBottom: '22px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <span style={{ fontSize: '16px' }} aria-hidden="true">⚡</span>
            <span style={{ fontSize: '13px', color: '#e2edf2', lineHeight: '1.4' }}>
              <strong style={{ color: '#50e3bd' }}>LGQ Automated Result:</strong> Scored 94/100 HOT &amp; mapped 2.1 mi from your existing Thursday route to maximize route density.
            </span>
          </div>

          {/* 3-Column Lead Intelligence Strip */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '16px',
              marginBottom: '28px',
            }}
          >
            <div
              style={{
                background: 'rgba(80, 227, 189, 0.08)',
                border: '1px solid rgba(80, 227, 189, 0.25)',
                borderRadius: '10px',
                padding: '16px',
              }}
            >
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#50e3bd', textTransform: 'uppercase' }}>
                📍 Route &amp; Proximity
              </span>
              <p style={{ margin: '6px 0 0', fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>
                {DEMO_TOUR_JOB.distanceMiles} miles from Thursday route
              </p>
              <small style={{ color: '#9eb5c2', fontSize: '12.5px' }}>Fits morning route in Royal Oak</small>
            </div>

            <div
              style={{
                background: 'rgba(255, 209, 102, 0.08)',
                border: '1px solid rgba(255, 209, 102, 0.25)',
                borderRadius: '10px',
                padding: '16px',
              }}
            >
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#ffd166', textTransform: 'uppercase' }}>
                💰 Estimated Job Value
              </span>
              <p style={{ margin: '6px 0 0', fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>
                ${DEMO_TOUR_JOB.baseTotal.toLocaleString()} &ndash; ${DEMO_TOUR_JOB.totalWithUpgrade.toLocaleString()}
              </p>
              <small style={{ color: '#9eb5c2', fontSize: '12.5px' }}>$500 deposit suggested</small>
            </div>

            <div
              style={{
                background: 'rgba(255, 106, 36, 0.08)',
                border: '1px solid rgba(255, 106, 36, 0.25)',
                borderRadius: '10px',
                padding: '16px',
              }}
            >
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#ff8a4c', textTransform: 'uppercase' }}>
                ⏱️ Urgency &amp; Fit
              </span>
              <p style={{ margin: '6px 0 0', fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>
                {DEMO_TOUR_JOB.urgency}
              </p>
              <small style={{ color: '#9eb5c2', fontSize: '12.5px' }}>{DEMO_TOUR_JOB.timeline}</small>
            </div>
          </div>

          {/* Customer & Intake Transcript Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '24px',
            }}
          >
            {/* Customer Record */}
            <div
              style={{
                background: '#040d14',
                border: '1px solid rgba(168, 204, 255, 0.12)',
                borderRadius: '10px',
                padding: '20px',
              }}
            >
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#d1e2eb', margin: '0 0 14px' }}>
                Customer &amp; Property Details
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13.5px' }}>
                <div>
                  <span style={{ color: '#7b93a2', display: 'block', fontSize: '11.5px', textTransform: 'uppercase' }}>Name</span>
                  <strong style={{ color: '#ffffff' }}>{DEMO_TOUR_CUSTOMER.name}</strong>
                </div>
                <div>
                  <span style={{ color: '#7b93a2', display: 'block', fontSize: '11.5px', textTransform: 'uppercase' }}>Phone</span>
                  <strong style={{ color: '#ffd166' }}>{DEMO_TOUR_CUSTOMER.phone}</strong>
                </div>
                <div>
                  <span style={{ color: '#7b93a2', display: 'block', fontSize: '11.5px', textTransform: 'uppercase' }}>Address</span>
                  <strong style={{ color: '#ffffff' }}>{DEMO_TOUR_CUSTOMER.address}, {DEMO_TOUR_CUSTOMER.city}, {DEMO_TOUR_CUSTOMER.state} {DEMO_TOUR_CUSTOMER.zip}</strong>
                </div>
                <div>
                  <span style={{ color: '#7b93a2', display: 'block', fontSize: '11.5px', textTransform: 'uppercase' }}>Property</span>
                  <span style={{ color: '#d1e2eb' }}>{DEMO_TOUR_CUSTOMER.propertyType}</span>
                </div>
                <div>
                  <span style={{ color: '#7b93a2', display: 'block', fontSize: '11.5px', textTransform: 'uppercase' }}>Project Area</span>
                  <span style={{ color: '#d1e2eb' }}>{DEMO_TOUR_CUSTOMER.projectArea}</span>
                </div>
              </div>
            </div>

            {/* AI Intake Summary */}
            <div
              style={{
                background: '#040d14',
                border: '1px solid rgba(168, 204, 255, 0.12)',
                borderRadius: '10px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#50e3bd', margin: '0 0 12px' }}>
                  AI Intake Project Summary
                </h3>
                <blockquote
                  style={{
                    margin: '0 0 16px',
                    padding: '12px 16px',
                    background: 'rgba(80, 227, 189, 0.06)',
                    borderLeft: '3px solid #50e3bd',
                    fontSize: '13.5px',
                    lineHeight: '1.5',
                    color: '#e2edf2',
                    fontStyle: 'italic',
                  }}
                >
                  &ldquo;{DEMO_TOUR_JOB.homeownerInquiry}&rdquo;
                </blockquote>
                <p style={{ fontSize: '13px', color: '#9eb5c2', lineHeight: '1.5', margin: 0 }}>
                  <strong>AI Scoring Reason:</strong> {DEMO_TOUR_JOB.leadFitReason}
                </p>
              </div>

              <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <Link
                  href="/demo/tour/quote"
                  className={styles.tourNextActionBtn}
                  style={{ width: '100%', justifyContent: 'center', minHeight: '44px' }}
                  aria-label="Review itemized quote and send to customer"
                >
                  Review Itemized Quote &amp; Send &rarr;
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DemoTourFrame>
  );
}

'use client';

import { useState } from 'react';
import styles from './flywheel.module.css';

type FlywheelStage = {
  id: string;
  num: string;
  shortLabel: string;
  icon: string;
  subtitle: string;
  title: string;
  description: string;
  metrics: { label: string; value: string }[];
  snippetTitle: string;
  snippetContent: string;
};

const STAGES: FlywheelStage[] = [
  {
    id: 'search',
    num: '01',
    shortLabel: 'Google Search Intent',
    icon: '🔍',
    subtitle: 'Step 1 · High-Intent PPC',
    title: 'High-Intent Trade Search & Negative Filter Shield',
    description:
      'Homeowner searches with buying urgency (e.g. "emergency roof repair Austin" or "water heater leaking"). Our AI bids exclusively on exact & phrase match buyer terms while blocking 100+ DIY, competitor, and salary keywords.',
    metrics: [
      { label: 'Quality Score', value: '9/10 Target' },
      { label: 'Negative Filters', value: '100+ Active' },
    ],
    snippetTitle: 'google_ads_bidding_payload.json',
    snippetContent: `{\n  "network": "Google Search PPC",\n  "intent": "High-Urgency Buyer",\n  "match_type": "Exact/Phrase",\n  "wasted_diy_blocked": true,\n  "target_cpc_optimized": "$4.80"\n}`,
  },
  {
    id: 'message-match',
    num: '02',
    shortLabel: 'Message-Match Intake',
    icon: '🌐',
    subtitle: 'Step 2 · Dynamic Landing',
    title: 'Dynamic Message-Match Landing Page Hero',
    description:
      'When the homeowner clicks the ad, your website headline dynamically matches their exact query (e.g., "Emergency Roof Leak Dispatch in Austin"). This boosts Google Quality Score by 40% and lowers your cost-per-click.',
    metrics: [
      { label: 'Form Conversion Lift', value: '+42%' },
      { label: 'Quality Score Impact', value: 'Lowers CPC' },
    ],
    snippetTitle: 'dynamic_hero_render.ts',
    snippetContent: `// Dynamic Message-Match Trigger\nconst headline = matchAdKeyword(query.utm_term);\n// Renders: "24/7 Emergency Roof Leak Dispatch in Austin"\nrenderHero({ headline, instantEstimate: true });`,
  },
  {
    id: 'speed-to-lead',
    num: '03',
    shortLabel: '12s Speed-to-Lead SMS',
    icon: '⚡',
    subtitle: 'Step 3 · Instant Engagement',
    title: 'Sub-60s AI Speed-to-Lead Auto-SMS',
    description:
      'Within 12 seconds of web form submission, AI texts the homeowner a personalized, trade-specific greeting on your behalf, confirming their job scope and locking in an on-site estimate slot before competitors answer.',
    metrics: [
      { label: 'Average Response Time', value: '12 Seconds' },
      { label: 'Lead Contact Rate', value: '94.6%' },
    ],
    snippetTitle: 'speed_to_lead_sms.log',
    snippetContent: `[10:14:02] Lead Form Submitted (gclid: Cj0KCQ...)\n[10:14:14] Outbound SMS dispatched to Sarah M.:\n"Hi Sarah! Apex Roofing received your leak request..."\n[10:14:48] Inbound Reply: "Tomorrow 10am works!"`,
  },
  {
    id: 'contract-won',
    num: '04',
    shortLabel: 'Won Contract & Deposit',
    icon: '💵',
    subtitle: 'Step 4 · Revenue Realization',
    title: 'Signed Contract & Instant Stripe Deposit',
    description:
      'Contractor conducts the on-site visit or sends a walk-up estimate. The homeowner e-signs the quote and pays the project deposit online via Stripe Connect, logging the exact revenue earned.',
    metrics: [
      { label: 'Average Won Job Ticket', value: '$5,800' },
      { label: 'Deposit Processing', value: 'Stripe Connect' },
    ],
    snippetTitle: 'job_record_revenue.json',
    snippetContent: `{\n  "job_id": "job_84920",\n  "status": "won_signed",\n  "contract_amount_dollars": 5800.00,\n  "deposit_cleared": 1450.00,\n  "gclid": "Cj0KCQiA...WfN"\n}`,
  },
  {
    id: 'closed-loop',
    num: '05',
    shortLabel: 'Closed-Loop Bidding Sync',
    icon: '🔄',
    subtitle: 'Step 5 · Google AI Training',
    title: 'Offline Conversion & Revenue Upload to Google',
    description:
      'Let’s Get Quoted automatically uploads the visitor’s gclid and $5,800 contract value back into the Google Ads API. Google’s Smart Bidding AI uses this data to seek out higher-ticket homeowners instead of tire-kickers.',
    metrics: [
      { label: 'API Conversion Upload', value: 'Automated' },
      { label: 'ROAS Compounding Lift', value: '3.8x → 5.2x' },
    ],
    snippetTitle: 'google_offline_conversion.ts',
    snippetContent: `await uploadOfflineConversion({\n  customerId: MCC_CUSTOMER_ID,\n  gclid: "Cj0KCQiA...WfN",\n  conversionAction: "Won_Contract_Revenue",\n  conversionValueDollars: 5800.00,\n  currencyCode: "USD"\n});`,
  },
];

export default function ClosedLoopFlywheel() {
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const activeStage = STAGES[activeStageIndex];

  return (
    <section className={styles.flywheelSection} aria-labelledby="flywheel-heading">
      <div className={styles.sectionHeader}>
        <span className={styles.badge}>
          <span aria-hidden="true">🔄</span> CLOSED-LOOP CONVERSION FLYWHEEL
        </span>
        <h2 id="flywheel-heading" className={styles.sectionTitle}>
          How Google search clicks turn into signed contracts and train the AI.
        </h2>
        <p className={styles.sectionDesc}>
          Most agencies stop at vanity click reports. Our closed-loop engine feeds real contract dollar values back to Google Ads Smart Bidding to continuously target bigger, higher-margin jobs.
        </p>
      </div>

      {/* Interactive 5-Stage Stepper Track */}
      <div className={styles.stepperTrack} role="tablist" aria-label="Closed-Loop Stages">
        {STAGES.map((stage, idx) => {
          const isActive = idx === activeStageIndex;
          return (
            <button
              key={stage.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`${styles.stepButton} ${isActive ? styles.stepButtonActive : ''}`}
              onClick={() => setActiveStageIndex(idx)}
            >
              <span className={styles.stepNum}>STAGE {stage.num}</span>
              <span className={styles.stepLabel}>{stage.icon} {stage.shortLabel}</span>
            </button>
          );
        })}
      </div>

      {/* Stage Detail Showcase */}
      <div className={styles.showcaseFrame}>
        <div className={styles.stageInfo}>
          <div className={styles.stageHeader}>
            <div className={styles.stageIcon} aria-hidden="true">
              {activeStage.icon}
            </div>
            <div>
              <span className={styles.stageSubtitle}>{activeStage.subtitle}</span>
              <h3 className={styles.stageTitle}>{activeStage.title}</h3>
            </div>
          </div>

          <p className={styles.stageBody}>{activeStage.description}</p>

          <div className={styles.stageMetricsGrid}>
            {activeStage.metrics.map((m) => (
              <div key={m.label} className={styles.metricItem}>
                <span className={styles.metricLabel}>{m.label}</span>
                <span className={styles.metricValue}>{m.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Live Mockup Screen */}
        <div className={styles.mockupDisplay}>
          <div className={styles.mockupTopBar}>
            <div className={styles.dots}>
              <span className={`${styles.dot} ${styles.dotRed}`} />
              <span className={`${styles.dot} ${styles.dotYellow}`} />
              <span className={`${styles.dot} ${styles.dotGreen}`} />
            </div>
            <span className={styles.mockupTag}>{activeStage.snippetTitle}</span>
          </div>
          <pre className={styles.codeSnippet}>
            <code>{activeStage.snippetContent}</code>
          </pre>
        </div>
      </div>

      {/* Flywheel Loop Compounding Banner */}
      <div className={styles.flywheelLoopBanner}>
        <div className={styles.loopBannerLeft}>
          <span className={styles.loopBannerIcon} aria-hidden="true">🔄</span>
          <div>
            <h4 className={styles.loopBannerTitle}>Continuous Machine Learning Feedback Loop</h4>
            <p className={styles.loopBannerDesc}>
              Every won job uploaded teaches Google's bidding algorithm what your ideal high-margin customer looks like.
            </p>
          </div>
        </div>
        <span className={styles.loopBannerPill}>Self-Optimizing ROAS</span>
      </div>
    </section>
  );
}

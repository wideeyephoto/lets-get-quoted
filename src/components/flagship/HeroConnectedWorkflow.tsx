'use client';

import { useState } from 'react';
import Link from 'next/link';
import styles from './hero-connected-workflow.module.css';

export type TradeId = 'plumbing' | 'hvac' | 'roofing' | 'electrical' | 'landscaping' | 'general';

export interface TradeData {
  name: string;
  badge: string;
  leadTitle: string;
  leadAddress: string;
  leadPhotoBadge: string;
  leadSummary: string;
  leadValue: string;
  quoteTotal: string;
  depositAmount: string;
  fieldBadge: string;
  fieldTitle: string;
  fieldVoiceMemo: string;
  fieldAiConfirmation: string;
  crewName: string;
  dispatchTime: string;
  payoutAmount: string;
}

export const TRADES_DATA: Record<TradeId, TradeData> = {
  plumbing: {
    name: 'Plumbing',
    badge: 'EMERGENCY · HOT LEAD',
    leadTitle: '50-Gal Tankless Water Heater Replacement',
    leadAddress: '1428 Elm Ridge Rd · 4.2 miles away',
    leadPhotoBadge: '2 photos analyzed · Basement utility closet',
    leadSummary: 'Active leak detected at bottom seal. Gas line verified 3/4", power vent required.',
    leadValue: '$3,800 – $4,600',
    quoteTotal: '$4,250.00',
    depositAmount: '$850.00',
    fieldBadge: '🎙️ VOICE MEMO & CHANGE ORDER',
    fieldTitle: 'Rough-in Passed · Dedicated 3/4" Gas Line Added',
    fieldVoiceMemo: '"Rough-in passed by inspector on Elm. Adding $450 line item for dedicated 3/4 inch gas line upgrade."',
    fieldAiConfirmation: '✅ Logged voice memo & updated quote to $4,250.00. Reply SEND to text approval link.',
    crewName: 'Mike & Dave (Van #3)',
    dispatchTime: 'Today · 8:30 AM',
    payoutAmount: '+$4,250.00',
  },
  hvac: {
    name: 'HVAC',
    badge: 'SAME-DAY · HIGH VALUE',
    leadTitle: '4-Ton Heat Pump Replacement & Duct Transition',
    leadAddress: '884 Meadow View Dr · 6.1 miles away',
    leadPhotoBadge: '3 photos analyzed · Outdoor compressor + Air Handler',
    leadSummary: '16-year-old R-410A system frozen coil. Customer requesting high-efficiency 18 SEER2 quote.',
    leadValue: '$8,200 – $11,500',
    quoteTotal: '$9,840.00',
    depositAmount: '$2,460.00',
    fieldBadge: '🎙️ VOICE MEMO & CHANGE ORDER',
    fieldTitle: 'Frozen Coil Diagnosed · Added Duct Transition',
    fieldVoiceMemo: '"Coil is completely iced over. Added $850 for custom sheet metal duct transition to the quote."',
    fieldAiConfirmation: '✅ Added $850.00 duct transition. Total quote updated to $9,840.00.',
    crewName: 'Carlos & Jason (Van #1)',
    dispatchTime: 'Today · 9:15 AM',
    payoutAmount: '+$9,840.00',
  },
  roofing: {
    name: 'Roofing',
    badge: 'INSURANCE · STORM SCOPE',
    leadTitle: 'Architectural Shingle Replacement (28 Squares)',
    leadAddress: '204 Whispering Pines Way · 3.8 miles away',
    leadPhotoBadge: '4 photos analyzed · Hail impact + valley wear',
    leadSummary: 'Multiple impact creases on South slope. GAF Timberline HDZ with ice & water shield specified.',
    leadValue: '$12,400 – $15,800',
    quoteTotal: '$14,200.00',
    depositAmount: '$4,260.00',
    fieldBadge: '📸 MMS PHOTO & SCOPE UPDATE',
    fieldTitle: 'Chimney Flashing Damage · Added Plywood Sheathing',
    fieldVoiceMemo: '"Rotted decking around chimney. Texted photo + adding 4 sheets OSB and ice/water shield."',
    fieldAiConfirmation: '✅ Extracted photo scope & added $600 decking allowance to J-104.',
    crewName: 'Roof Crew Alpha (6 Techs)',
    dispatchTime: 'Tomorrow · 7:00 AM',
    payoutAmount: '+$14,200.00',
  },
  electrical: {
    name: 'Electrical',
    badge: 'SAFETY AUDIT · HOT LEAD',
    leadTitle: '200A Main Panel Upgrade + EV Charger Pre-wire',
    leadAddress: '512 Oakwood Lane · 2.5 miles away',
    leadPhotoBadge: '2 photos analyzed · Split-bus Zinsco panel',
    leadSummary: 'Obsolete 100A service at capacity. Whole-home surge protector and NEMA 14-50 garage line requested.',
    leadValue: '$3,400 – $4,800',
    quoteTotal: '$4,150.00',
    depositAmount: '$1,000.00',
    fieldBadge: '🎙️ VOICE MEMO & CHANGE ORDER',
    fieldTitle: '200A Panel Passed · Added Garage EV Line',
    fieldVoiceMemo: '"Main disconnect replaced. Adding $750 for 50A EV charger 6/3 Romex run in garage."',
    fieldAiConfirmation: '✅ Added $750.00 EV circuit to quote. Margin verified at 82.4%.',
    crewName: 'Sarah K. (Service Truck #2)',
    dispatchTime: 'Today · 10:00 AM',
    payoutAmount: '+$4,150.00',
  },
  landscaping: {
    name: 'Landscaping',
    badge: 'HARDSCAPE · HIGH MARGIN',
    leadTitle: '650 sq ft Paver Patio & Integrated Fire Pit',
    leadAddress: '730 Highland Crest · 5.4 miles away',
    leadPhotoBadge: '3 photos analyzed · Backyard slope + access gate',
    leadSummary: 'Grading required with 6" crushed stone base, polymeric sand, and freestanding stone fire pit.',
    leadValue: '$7,500 – $9,800',
    quoteTotal: '$8,650.00',
    depositAmount: '$2,500.00',
    fieldBadge: '🧾 RECEIPT OCR & EXPENSE LOG',
    fieldTitle: 'Nursery Receipt · $480 Polymeric Sand & Edging',
    fieldVoiceMemo: '"Snapping receipt at SiteOne for patio polymeric sand and steel edging spikes."',
    fieldAiConfirmation: '✅ Logged $480.00 SiteOne receipt. Live project gross margin: 76.5%.',
    crewName: 'Grounds Crew B (4 Techs)',
    dispatchTime: 'Thursday · 8:00 AM',
    payoutAmount: '+$8,650.00',
  },
  general: {
    name: 'Remodeling',
    badge: 'TURNKEY · HIGH TICKET',
    leadTitle: 'Full Master Bathroom Remodel & Walk-in Shower',
    leadAddress: '1109 Lakeview Terrace · 3.1 miles away',
    leadPhotoBadge: '4 photos analyzed · 10x12 bath layout',
    leadSummary: 'Tub-to-shower conversion, Schluter waterproofing system, dual vanity plumbing re-route.',
    leadValue: '$16,000 – $22,000',
    quoteTotal: '$18,500.00',
    depositAmount: '$5,550.00',
    fieldBadge: '🎙️ VOICE MEMO & PUNCH LIST',
    fieldTitle: 'Schluter Shower Waterproofing Passed',
    fieldVoiceMemo: '"24-hour flood test passed on master shower pan. Scheduled tile crew for 7am tomorrow."',
    fieldAiConfirmation: '✅ Appended voice note to Miller job & checked off waterproofing task.',
    crewName: 'Lead Carpenter Brian + Crew',
    dispatchTime: 'Monday · 7:30 AM',
    payoutAmount: '+$18,500.00',
  },
};

export default function HeroConnectedWorkflow() {
  const [selectedTrade, setSelectedTrade] = useState<TradeId>('plumbing');
  const [activeStep, setActiveStep] = useState<number>(0);
  const [isWorkflowReplaying, setIsWorkflowReplaying] = useState(true);

  const trade = TRADES_DATA[selectedTrade];

  const replayWorkflow = () => {
    setIsWorkflowReplaying(false);
    requestAnimationFrame(() => {
      setIsWorkflowReplaying(true);
    });
  };

  return (
    <div className={styles.pricingVisual} aria-label="Interactive contractor workflow showcase">
      <div className={`${styles.visualOrbit} ${styles.orbitOne}`} aria-hidden="true" />
      <div className={`${styles.visualOrbit} ${styles.orbitTwo}`} aria-hidden="true" />

      {/* Card Header & Kicker */}
      <div className={styles.visualHeading}>
        <div>
          <span className={styles.visualKicker}><i aria-hidden="true" /> LIVE CONTRACTOR WORKFLOW</span>
          <h2 className={styles.visualTitle}>
            From homeowner photo to money in your bank.
          </h2>
        </div>
        <div className={styles.startingPrice}>
          <strong>$0</strong>
          <span>/mo to start</span>
        </div>
      </div>

      {/* Trade Filter Tabs */}
      <div className={styles.tradeFilterBar}>
        {(Object.keys(TRADES_DATA) as TradeId[]).map((tId) => (
          <button
            key={tId}
            type="button"
            onClick={() => setSelectedTrade(tId)}
            className={`${styles.tradePill} ${selectedTrade === tId ? styles.tradePillActive : ''}`}
          >
            {TRADES_DATA[tId].name}
          </button>
        ))}
      </div>

      {/* 4-Step Milestone Ticker */}
      <div
        className={`${styles.activityStrip} ${isWorkflowReplaying ? 'workflow-animating' : 'workflow-settled'}`}
        role="button"
        tabIndex={0}
        onClick={replayWorkflow}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            replayWorkflow();
          }
        }}
        aria-label="Workflow demonstration. Click to replay animation."
      >
        <div className={`${styles.activityEvent} ${styles.toneOrange}`}>
          <span className={styles.activityMark}>01</span>
          <div className={styles.activityContent}>
            <small>AI Photo Intake</small>
            <strong>{trade.leadValue}</strong>
          </div>
        </div>
        <div className={`${styles.activityEvent} ${styles.toneYellow}`}>
          <span className={styles.activityMark}>02</span>
          <div className={styles.activityContent}>
            <small>Quote Accepted</small>
            <strong>{trade.depositAmount} Paid</strong>
          </div>
        </div>
        <div className={`${styles.activityEvent} ${styles.toneTeal}`}>
          <span className={styles.activityMark}>03</span>
          <div className={styles.activityContent}>
            <small>Text-to-Job</small>
            <strong>{trade.quoteTotal}</strong>
          </div>
        </div>
        <div className={`${styles.activityEvent} ${styles.toneMint}`}>
          <span className={styles.activityMark}>04</span>
          <div className={styles.activityContent}>
            <small>Stripe &amp; QBO</small>
            <strong>{trade.payoutAmount}</strong>
          </div>
        </div>
      </div>

      {/* Step Switcher Buttons */}
      <div className={styles.stepSwitcher}>
        {[
          { idx: 0, num: '01', title: 'Smart Intake', sub: 'Photo AI & Scope' },
          { idx: 1, num: '02', title: 'Instant Quote', sub: 'E-Sign & Deposit' },
          { idx: 2, num: '03', title: 'Text-to-Job', sub: 'Voice Memo & SMS' },
          { idx: 3, num: '04', title: 'Dispatch & Pay', sub: 'Route & Stripe Sync' },
        ].map((step) => (
          <button
            key={step.idx}
            type="button"
            onClick={() => {
              setActiveStep(step.idx);
              replayWorkflow();
            }}
            className={`${styles.stepButton} ${activeStep === step.idx ? styles.stepButtonActive : ''}`}
          >
            <div className={styles.stepButtonHeader}>
              <span className={`${styles.stepNumber} ${activeStep === step.idx ? styles.stepNumberActive : ''}`}>
                {step.num}
              </span>
              {activeStep === step.idx && <span className={styles.activeDot} />}
            </div>
            <div className={styles.stepButtonTitle}>
              {step.title}
            </div>
            <div className={styles.stepButtonSub}>
              {step.sub}
            </div>
          </button>
        ))}
      </div>

      {/* Simulated Live Product Viewport */}
      <div className={styles.viewportStage}>
        {/* STAGE 1: AI INTAKE */}
        {activeStep === 0 && (
          <div>
            <div className={styles.stageRowTop}>
              <span className={styles.leadBadge}>
                ✦ {trade.badge}
              </span>
              <span style={{ color: '#4ee0bc', fontSize: '11px', fontWeight: 700 }}>
                Est. Value: {trade.leadValue}
              </span>
            </div>

            <div className={styles.leadTitleText}>
              {trade.leadTitle}
            </div>
            <div className={styles.leadAddressText}>
              📍 {trade.leadAddress}
            </div>

            <div className={styles.infoBox}>
              <div style={{ color: '#4ee0bc', fontWeight: 700, fontSize: '11px', marginBottom: '3px' }}>
                📸 {trade.leadPhotoBadge}
              </div>
              {trade.leadSummary}
            </div>

            <div className={styles.stageRowBottom}>
              <span style={{ color: '#ffc44d', fontWeight: 600 }}>✓ AI scope verified with profit margin</span>
              <div className={styles.actionBtnWrapper}>
                <span className={`${styles.waveRing} ${styles.wave1}`} aria-hidden="true" />
                <span className={`${styles.waveRing} ${styles.wave2}`} aria-hidden="true" />
                <span className={`${styles.waveRing} ${styles.wave3}`} aria-hidden="true" />
                <button
                  type="button"
                  className={styles.actionBtnNext}
                  onClick={() => setActiveStep(1)}
                  aria-label="Next Step: Draft Quote"
                >
                  <span className={styles.btnPulseDot} aria-hidden="true" />
                  <span className={styles.btnText}>Draft Quote</span>
                  <span className={styles.btnArrow} aria-hidden="true">→</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STAGE 2: QUOTE & E-SIGN */}
        {activeStep === 1 && (
          <div>
            <div className={styles.stageRowTop}>
              <span className={styles.proposalBadge}>
                ✓ PROPOSAL SIGNED ON MOBILE
              </span>
              <span style={{ color: '#f7f7f4', fontSize: '13px', fontWeight: 800 }}>
                Total: {trade.quoteTotal}
              </span>
            </div>

            <div className={styles.leadTitleText}>
              {trade.leadTitle}
            </div>

            <div className={styles.infoBoxProposal}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>Included Equipment &amp; Labor:</span>
                <strong style={{ color: '#fff' }}>{trade.quoteTotal}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4ee0bc' }}>
                <span>Initial 20% Deposit (Stripe):</span>
                <strong>{trade.depositAmount} Paid ✓</strong>
              </div>
            </div>

            <div className={styles.stageRowBottom}>
              <span style={{ color: '#8d9cae', fontWeight: 500 }}>Digital Signature: Eleanor M. (iPhone)</span>
              <div className={styles.actionBtnWrapper}>
                <span className={`${styles.waveRing} ${styles.wave1}`} aria-hidden="true" />
                <span className={`${styles.waveRing} ${styles.wave2}`} aria-hidden="true" />
                <span className={`${styles.waveRing} ${styles.wave3}`} aria-hidden="true" />
                <button
                  type="button"
                  className={styles.actionBtnNext}
                  onClick={() => setActiveStep(2)}
                  aria-label="Next Step: Field Update"
                >
                  <span className={styles.btnPulseDot} aria-hidden="true" />
                  <span className={styles.btnText}>Field Update</span>
                  <span className={styles.btnArrow} aria-hidden="true">→</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STAGE 3: TEXT-TO-JOB (VOICE & SMS FIELD INTAKE) */}
        {activeStep === 2 && (
          <div>
            <div className={styles.stageRowTop}>
              <span className={styles.fieldActionBadge}>
                {trade.fieldBadge}
              </span>
              <Link href="/features/text-to-job" className={styles.fieldFeatureLink}>
                Learn Text-to-Job →
              </Link>
            </div>

            <div className={styles.leadTitleText}>
              {trade.fieldTitle}
            </div>

            <div className={styles.infoBoxField}>
              <div className={styles.fieldVoiceSnippet}>
                <span className={styles.waveformDot} />
                <span className={styles.voiceText}>{trade.fieldVoiceMemo}</span>
              </div>
              <div className={styles.fieldAiResponse}>
                {trade.fieldAiConfirmation}
              </div>
            </div>

            <div className={styles.stageRowBottom}>
              <span style={{ color: '#50e3bd', fontWeight: 600 }}>✓ Updated from the truck — no app download</span>
              <div className={styles.actionBtnWrapper}>
                <span className={`${styles.waveRing} ${styles.wave1}`} aria-hidden="true" />
                <span className={`${styles.waveRing} ${styles.wave2}`} aria-hidden="true" />
                <span className={`${styles.waveRing} ${styles.wave3}`} aria-hidden="true" />
                <button
                  type="button"
                  className={styles.actionBtnNext}
                  onClick={() => setActiveStep(3)}
                  aria-label="Next Step: Dispatch & Pay"
                >
                  <span className={styles.btnPulseDot} aria-hidden="true" />
                  <span className={styles.btnText}>Dispatch Crew</span>
                  <span className={styles.btnArrow} aria-hidden="true">→</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STAGE 4: DISPATCH & STRIPE PAYOUT */}
        {activeStep === 3 && (
          <div>
            <div className={styles.stageRowTop}>
              <span className={styles.paidBadge}>
                ✓ JOB COMPLETE &amp; INVOICE PAID
              </span>
              <span style={{ color: '#4ee0bc', fontSize: '14px', fontWeight: 800 }}>
                {trade.payoutAmount}
              </span>
            </div>

            <div className={styles.leadTitleText}>
              {trade.leadTitle}
            </div>

            <div className={styles.infoBox}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>Assigned Tech: <strong>{trade.crewName}</strong></span>
                <span style={{ color: '#ffc44d' }}>{trade.dispatchTime}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4ee0bc' }}>
                <span>QuickBooks Online:</span>
                <strong>Synced (Invoice #1042) ✓</strong>
              </div>
            </div>

            <div className={styles.stageRowBottom}>
              <span style={{ color: '#8d9cae', fontWeight: 500 }}>Direct deposit initiated to Chase Business</span>
              <div className={styles.actionBtnWrapper}>
                <span className={`${styles.waveRingMint} ${styles.wave1}`} aria-hidden="true" />
                <span className={`${styles.waveRingMint} ${styles.wave2}`} aria-hidden="true" />
                <button
                  type="button"
                  className={styles.replayBtn}
                  onClick={() => setActiveStep(0)}
                  aria-label="Replay interactive tour"
                >
                  <span className={styles.btnPulseDotMint} aria-hidden="true" />
                  <span className={styles.btnText}>Replay Tour</span>
                  <span className={styles.replayIcon} aria-hidden="true">↺</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

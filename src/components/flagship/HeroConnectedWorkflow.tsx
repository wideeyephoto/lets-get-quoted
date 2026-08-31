'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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

const STEP_DWELL_MS = 4600;

export default function HeroConnectedWorkflow() {
  const [selectedTrade, setSelectedTrade] = useState<TradeId>('plumbing');
  const [activeStep, setActiveStep] = useState<number>(0);
  const [isWorkflowReplaying, setIsWorkflowReplaying] = useState(true);
  const [isAutoPlayEnabled, setIsAutoPlayEnabled] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const autoPlayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const trade = TRADES_DATA[selectedTrade];

  const replayWorkflow = useCallback(() => {
    setIsWorkflowReplaying(false);
    requestAnimationFrame(() => {
      setIsWorkflowReplaying(true);
    });
  }, []);

  const handleSelectStep = useCallback((idx: number) => {
    setActiveStep(idx);
    replayWorkflow();
  }, [replayWorkflow]);

  // Dynamic 3D mouse tracking tilt
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = containerRef.current.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;  // -0.5 to 0.5
    const ny = (e.clientY - rect.top) / rect.height - 0.5; // -0.5 to 0.5
    setTilt({
      x: -(ny * 5), // rotateX degrees
      y: nx * 6,   // rotateY degrees
    });
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setTilt({ x: 0, y: 0 });
  };

  // Autoplay progression loop (pauses on hover, focus, or when autoplay is paused)
  useEffect(() => {
    if (!isAutoPlayEnabled || isHovered) {
      if (autoPlayTimerRef.current) {
        clearInterval(autoPlayTimerRef.current);
        autoPlayTimerRef.current = null;
      }
      return;
    }

    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    autoPlayTimerRef.current = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % 4);
      replayWorkflow();
    }, STEP_DWELL_MS);

    return () => {
      if (autoPlayTimerRef.current) {
        clearInterval(autoPlayTimerRef.current);
        autoPlayTimerRef.current = null;
      }
    };
  }, [isAutoPlayEnabled, isHovered, replayWorkflow]);

  // Web Audio 2-tone radio dispatch chirp
  const playRadioChirp = () => {
    try {
      if (typeof window === 'undefined') return;
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(940, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1880, ctx.currentTime + 0.07);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.11);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.11);
    } catch {
      // Audio playback is purely decorative; fail silently if context unavailable
    }
  };

  // Handle Voice Memo Speech Audio
  const toggleVoicePlayback = () => {
    if (typeof window === 'undefined') return;

    if (isPlayingAudio) {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setIsPlayingAudio(false);
      return;
    }

    playRadioChirp();
    setIsPlayingAudio(true);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(trade.fieldVoiceMemo.replace(/"/g, ''));
      utterance.rate = 1.0;
      utterance.pitch = 0.95;
      utterance.onend = () => setIsPlayingAudio(false);
      utterance.onerror = () => setIsPlayingAudio(false);
      window.speechSynthesis.speak(utterance);
    } else {
      setTimeout(() => setIsPlayingAudio(false), 3500);
    }
  };

  return (
    <div
      ref={containerRef}
      className={styles.pricingVisual}
      aria-label="Interactive contractor workflow showcase"
      style={{
        transform: isHovered
          ? `perspective(1200px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateY(-6px)`
          : undefined,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
    >
      <div className={`${styles.visualOrbit} ${styles.orbitOne}`} aria-hidden="true">
        <span className={styles.orbitBead} />
      </div>
      <div className={`${styles.visualOrbit} ${styles.orbitTwo}`} aria-hidden="true">
        <span className={styles.orbitBead} />
      </div>

      {/* Card Header & Kicker */}
      <div className={styles.visualHeading}>
        <div>
          <div className={styles.kickerRow}>
            <span className={styles.visualKicker}>
              <i aria-hidden="true" /> LIVE CONTRACTOR WORKFLOW
            </span>
            <button
              type="button"
              onClick={() => setIsAutoPlayEnabled((prev) => !prev)}
              className={`${styles.autoPlayBadge} ${isAutoPlayEnabled && !isHovered ? styles.autoPlayActive : styles.autoPlayPaused}`}
              title={isAutoPlayEnabled ? 'Auto-play is active. Click to pause.' : 'Auto-play is paused. Click to play.'}
              aria-label={isAutoPlayEnabled ? 'Pause automated workflow tour' : 'Play automated workflow tour'}
            >
              <span className={styles.playDot} aria-hidden="true" />
              <span>{isHovered ? 'PAUSED ON HOVER' : isAutoPlayEnabled ? 'AUTO-PLAY ON' : 'PAUSED'}</span>
            </button>
          </div>
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
      <div className={styles.tradeFilterBar} role="tablist" aria-label="Select Contractor Trade">
        {(Object.keys(TRADES_DATA) as TradeId[]).map((tId) => {
          const isSelected = selectedTrade === tId;
          return (
            <button
              key={tId}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => {
                setSelectedTrade(tId);
                replayWorkflow();
              }}
              className={`${styles.tradePill} ${isSelected ? styles.tradePillActive : ''}`}
            >
              {TRADES_DATA[tId].name}
            </button>
          );
        })}
      </div>

      {/* 4-Step Milestone Ticker (Interactive Milestone Cards) */}
      <div
        className={`${styles.activityStrip} ${isWorkflowReplaying ? styles.stripAnimating : ''}`}
        aria-label="Workflow milestones. Click any step to inspect."
      >
        <button
          type="button"
          onClick={() => handleSelectStep(0)}
          className={`${styles.activityEvent} ${styles.toneOrange} ${activeStep === 0 ? styles.activityEventActive : ''}`}
          aria-label="Milestone 1: AI Photo Intake"
        >
          <span className={styles.activityMark}>01</span>
          <div className={styles.activityContent}>
            <small>AI Photo Intake</small>
            <strong>{trade.leadValue}</strong>
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleSelectStep(1)}
          className={`${styles.activityEvent} ${styles.toneYellow} ${activeStep === 1 ? styles.activityEventActive : ''}`}
          aria-label="Milestone 2: Quote Accepted & Deposit Paid"
        >
          <span className={styles.activityMark}>02</span>
          <div className={styles.activityContent}>
            <small>Quote Accepted</small>
            <strong>{trade.depositAmount} Paid</strong>
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleSelectStep(2)}
          className={`${styles.activityEvent} ${styles.toneTeal} ${activeStep === 2 ? styles.activityEventActive : ''}`}
          aria-label="Milestone 3: Text-to-Job Field Memo"
        >
          <span className={styles.activityMark}>03</span>
          <div className={styles.activityContent}>
            <small>Text-to-Job</small>
            <strong>{trade.quoteTotal}</strong>
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleSelectStep(3)}
          className={`${styles.activityEvent} ${styles.toneMint} ${activeStep === 3 ? styles.activityEventActive : ''}`}
          aria-label="Milestone 4: Stripe Payout & QuickBooks Sync"
        >
          <span className={styles.activityMark}>04</span>
          <div className={styles.activityContent}>
            <small>Stripe &amp; QBO</small>
            <strong>{trade.payoutAmount}</strong>
          </div>
        </button>
      </div>

      {/* Step Switcher Buttons */}
      <div className={styles.stepSwitcher} role="tablist" aria-label="Workflow Stages">
        {[
          { idx: 0, num: '01', title: 'Smart Intake', sub: 'Photo AI & Scope' },
          { idx: 1, num: '02', title: 'Instant Quote', sub: 'E-Sign & Deposit' },
          { idx: 2, num: '03', title: 'Text-to-Job', sub: 'Voice Memo & SMS' },
          { idx: 3, num: '04', title: 'Dispatch & Pay', sub: 'Route & Stripe Sync' },
        ].map((step) => {
          const isActive = activeStep === step.idx;
          return (
            <button
              key={step.idx}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => handleSelectStep(step.idx)}
              className={`${styles.stepButton} ${isActive ? styles.stepButtonActive : ''}`}
            >
              {isActive && isAutoPlayEnabled && !isHovered && (
                <span className={styles.dwellProgressTrack} aria-hidden="true">
                  <span className={styles.dwellProgressBar} style={{ animationDuration: `${STEP_DWELL_MS}ms` }} />
                </span>
              )}
              <div className={styles.stepButtonHeader}>
                <span className={`${styles.stepNumber} ${isActive ? styles.stepNumberActive : ''}`}>
                  {step.num}
                </span>
                {isActive && <span className={styles.activeDot} />}
              </div>
              <div className={styles.stepButtonTitle}>
                {step.title}
              </div>
              <div className={styles.stepButtonSub}>
                {step.sub}
              </div>
            </button>
          );
        })}
      </div>

      {/* Simulated Live Product Viewport Stage */}
      <div className={styles.viewportStage} role="region" aria-live="polite">
        {/* STAGE 1: AI INTAKE */}
        {activeStep === 0 && (
          <div className={styles.stageContentFade}>
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
                  onClick={() => handleSelectStep(1)}
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
          <div className={styles.stageContentFade}>
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
                  onClick={() => handleSelectStep(2)}
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
          <div className={styles.stageContentFade}>
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
                <button
                  type="button"
                  onClick={toggleVoicePlayback}
                  className={styles.voicePlayBtn}
                  aria-label={isPlayingAudio ? 'Stop voice memo audio' : 'Play voice memo audio'}
                >
                  {isPlayingAudio ? '⏹' : '▶'}
                </button>
                <div className={styles.voiceWaveTrack}>
                  <span className={`${styles.waveformBar} ${isPlayingAudio ? styles.waveBarActive : ''}`} style={{ height: '55%' }} />
                  <span className={`${styles.waveformBar} ${isPlayingAudio ? styles.waveBarActive : ''}`} style={{ height: '90%', animationDelay: '0.15s' }} />
                  <span className={`${styles.waveformBar} ${isPlayingAudio ? styles.waveBarActive : ''}`} style={{ height: '40%', animationDelay: '0.3s' }} />
                  <span className={`${styles.waveformBar} ${isPlayingAudio ? styles.waveBarActive : ''}`} style={{ height: '100%', animationDelay: '0.45s' }} />
                  <span className={`${styles.waveformBar} ${isPlayingAudio ? styles.waveBarActive : ''}`} style={{ height: '65%', animationDelay: '0.6s' }} />
                </div>
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
                  onClick={() => handleSelectStep(3)}
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
          <div className={styles.stageContentFade}>
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
                  onClick={() => handleSelectStep(0)}
                  aria-label="Replay interactive tour from step 1"
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

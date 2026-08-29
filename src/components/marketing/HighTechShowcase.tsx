'use client';

import { useState } from 'react';
import Link from 'next/link';
import styles from './high-tech-showcase.module.css';

type HighTechFeature = {
  id: 'text-to-job' | 'photo-scope' | 'quick-stops' | 'ai-intake';
  tabIcon: string;
  tabLabel: string;
  tabBadge: string;
  tabSummary: string;
  badgeStyle: string;
  eyebrow: string;
  title: string;
  blurb: string;
  bullets: string[];
  primaryCtaText: string;
  primaryHref: string;
  secondaryCtaText: string;
  secondaryHref: string;
};

const HIGH_TECH_FEATURES: HighTechFeature[] = [
  {
    id: 'text-to-job',
    tabIcon: '🎙️',
    tabLabel: 'Text-to-Job™ Co-Pilot',
    tabBadge: 'Field AI',
    tabSummary: 'Voice & SMS updates straight from the truck',
    badgeStyle: styles.badgeCyan,
    eyebrow: 'AI VOICE & SMS STEERING-WHEEL CO-PILOT',
    title: 'Update jobs, quotes & change orders while driving.',
    blurb:
      'Send a raw voice memo or quick text to your platform number. Gemini Multimodal strips out engine noise, identifies the customer, and drafts clean line items into your invoice.',
    bullets: [
      'Zero Destructive Guesses — never assumes ambiguous customer names',
      'Instant change order & margin recalculation from audio recordings',
      'Apple Siri & Google Assistant hands-free steering wheel dictation',
      'Automatic client portal sync with no late-night desk paperwork',
    ],
    primaryCtaText: 'Explore Text-to-Job',
    primaryHref: '/features/text-to-job',
    secondaryCtaText: 'View Voice Docs →',
    secondaryHref: '/features/ai-voice',
  },
  {
    id: 'photo-scope',
    tabIcon: '📸',
    tabLabel: 'Multimodal Photo Scope',
    tabBadge: 'Computer Vision',
    tabSummary: 'Damage detection & equipment OCR inspection',
    badgeStyle: styles.badgePurple,
    eyebrow: 'MULTIMODAL COMPUTER VISION & OCR',
    title: 'Extract serial numbers, dimensions & damage in seconds.',
    blurb:
      'Homeowners and crew upload photos; our visual inspection AI detects damage patterns, reads equipment rating plates via OCR, and drafts material pick-lists automatically.',
    bullets: [
      'Automatic equipment serial & model number OCR recognition',
      'Pre-visit risk detection (rot, non-code wiring, tight alcove access)',
      'Deterministic material checklist & trade-specific labor calculation',
      'Generates 1-page visual inspection summaries with high customer trust',
    ],
    primaryCtaText: 'Explore AI Vision Estimator',
    primaryHref: '/features/ai-vision',
    secondaryCtaText: 'Test Intake Sandbox →',
    secondaryHref: '/features/ai-intake',
  },
  {
    id: 'quick-stops',
    tabIcon: '⚡',
    tabLabel: 'Quick Stops™ Detour',
    tabBadge: 'Route Engine',
    tabSummary: 'Monetize route gaps with paid priority visits',
    badgeStyle: styles.badgeAmber,
    eyebrow: 'OPPORTUNISTIC ROUTE MONETIZATION',
    title: 'Get paid to fit nearby homeowners into today’s drive.',
    blurb:
      'When an emergency or quick inquiry lands near today’s route, Quick Stops computes the detour radius, proposes a custom arrival window, and collects payment before booking.',
    bullets: [
      'Live GPS detour matching (e.g. "0.7 mi off route · 6 min detour")',
      'Zero unexpected calendar crowding — you control every offer',
      'Pre-authorized Stripe fee collection before the truck rolls',
      'Full trade quote follows after on-site diagnostic assessment',
    ],
    primaryCtaText: 'Explore Quick Stops',
    primaryHref: '/features/quick-stops',
    secondaryCtaText: 'Explore Scheduling →',
    secondaryHref: '/features/scheduling',
  },
  {
    id: 'ai-intake',
    tabIcon: '🤖',
    tabLabel: '24/7 AI Smart Intake',
    tabBadge: 'Lead Gen',
    tabSummary: 'Conversational pricing & 2-ring call answering',
    badgeStyle: styles.badgeEmerald,
    eyebrow: '24/7 CONVERSATIONAL WEBSITE ESTIMATOR & VOICE HOTLINE',
    title: 'Turn tire-kickers into hot, pre-qualified leads 24/7.',
    blurb:
      'Replace dumb contact forms with a conversational estimator that asks the exact questions a veteran contractor would, estimates project cost bands, and ranks leads by urgency.',
    bullets: [
      'Interactive estimating widget matched to 12+ contractor trades',
      'Automated Lead Triage (Hot / Warm / Low) with high-value instant SMS alerts',
      '24/7 AI voice phone receptionist answering in 2 rings with audio transcripts',
      'Customer budget posture control from competitive to high-margin pricing',
    ],
    primaryCtaText: 'Explore Smart Intake',
    primaryHref: '/features/ai-intake',
    secondaryCtaText: 'Explore Website Builder →',
    secondaryHref: '/features/website-builder',
  },
];

// Interactive Sub-Scenarios for each tab
const TEXT_TO_JOB_SCENARIOS = [
  {
    id: 'voice-tile',
    label: '🎙️ Voice: $650 Shower Tile',
    transcript: '"Hey, we opened the drywall at Miller\'s and found black mold behind the shower. Adding 3 sheets cement board and waterproofing membrane, call it $650 extra."',
    matchedJob: 'Alex Miller · #1048 (Master Bath)',
    lineItem: '+$650.00 Cement Board & Hydro Barrier',
    marginImpact: 'Margin: 48.2% (+$312 profit)',
  },
  {
    id: 'sms-deduct',
    label: '💬 SMS: -$200 Vanity Credit',
    transcript: '"Customer supplied their own 48-inch vanity. Deduct $200 from rough-in quote and log receipt."',
    matchedJob: 'Sarah Jenkins · #1052 (Hallway Bath)',
    lineItem: '-$200.00 Client-Supplied Vanity Credit',
    marginImpact: 'Margin adjusted · Quote locked',
  },
  {
    id: 'siri-emergency',
    label: '🚗 Siri: Emergency Main Valve',
    transcript: '"Siri, tell LGQ to add emergency shutoff valve replacement for $380 on today\'s 2pm visit."',
    matchedJob: 'David Vance · #1055 (Emergency Plumbing)',
    lineItem: '+$380.00 1" Ball Valve Replacement',
    marginImpact: 'Approved via SMS signature',
  },
];

const PHOTO_SCOPE_SCENARIOS = [
  {
    id: 'heater-ocr',
    label: '🏷️ Water Heater Plate OCR',
    plateOcr: 'Model: GUR-50-400 · Serial: 2148A09 · 40,000 BTU · 50 Gal Gas',
    detectedIssue: 'Scale buildup & corroded T&P relief valve',
    materials: 'Bradford White 50-Gal Tall Gas + 3/4" Brass Relief Valve ($940)',
    confidence: '99.4% OCR Confidence',
  },
  {
    id: 'subfloor-vision',
    label: '🪵 Subfloor Moisture Damage',
    plateOcr: 'Visual Defect: 24 sq ft moisture rot + compromised joist edge',
    detectedIssue: 'Active subfloor sag beneath dishwasher supply line',
    materials: '1 Sheet 3/4" CDX Plywood + GRK Structural Fasteners ($112.50)',
    confidence: '96.8% Defect Segmentation',
  },
  {
    id: 'panel-defect',
    label: '⚡ 100A Panel Crowding',
    plateOcr: 'Zinsco Split-Bus 100A Panel · 0 Open Breaker Slots',
    detectedIssue: 'Double-tapped 20A breakers & non-compliant busbar',
    materials: 'Square D 100A Subpanel + 6/3 Feeder Cable ($222.50)',
    confidence: '98.1% NEC Violation Match',
  },
];

const QUICK_STOPS_SCENARIOS = [
  {
    id: 'detour-royal-oak',
    label: '📍 Royal Oak (0.7 mi detour)',
    client: 'Mark Stevens · Leaking Shutoff',
    detourMetrics: '+0.7 miles · +6 min drive time',
    feeOffer: '$149 Priority Window (2:15–4:15 PM)',
    prepayStatus: '✓ $149 Pre-Paid via Stripe Link',
  },
  {
    id: 'detour-birmingham',
    label: '📍 Birmingham (1.2 mi detour)',
    client: 'Claire Ross · Flickering Panel Circuit',
    detourMetrics: '+1.2 miles · +9 min drive time',
    feeOffer: '$189 Same-Day Slot (3:30–5:30 PM)',
    prepayStatus: '✓ $189 Pre-Paid via Stripe Link',
  },
];

const AI_INTAKE_SCENARIOS = [
  {
    id: 'drain-emergency',
    label: '🚰 Emergency Drain Backup',
    userInput: '"My basement drain is backing up and wastewater is spreading across the utility room."',
    aiFollowup: '✦ Is wastewater actively entering the room or contained in the basin?',
    triageScore: '🔥 HOT LEAD · Urgency: Today · Est: $450–$780',
  },
  {
    id: 'hvac-heatwave',
    label: '❄️ AC Blowing Warm Air',
    userInput: '"AC stopped cooling during heatwave, outdoor compressor is humming but fan isn\'t spinning."',
    aiFollowup: '✦ Is the outdoor breaker tripped or the copper line freezing up?',
    triageScore: '🔥 HOT LEAD · Urgency: 24h · Est: $250–$620',
  },
];

export default function HighTechShowcase() {
  const [activeTab, setActiveTab] = useState<HighTechFeature['id']>('text-to-job');
  const [activeVoiceScenario, setActiveVoiceScenario] = useState(0);
  const [activePhotoScenario, setActivePhotoScenario] = useState(0);
  const [activeRouteScenario, setActiveRouteScenario] = useState(0);
  const [activeIntakeScenario, setActiveIntakeScenario] = useState(0);

  const currentFeature = HIGH_TECH_FEATURES.find((f) => f.id === activeTab) ?? HIGH_TECH_FEATURES[0];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const total = HIGH_TECH_FEATURES.length;
    let nextIndex = index;
    if (e.key === 'ArrowRight') {
      nextIndex = (index + 1) % total;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (index - 1 + total) % total;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = total - 1;
    } else {
      return;
    }
    e.preventDefault();
    const nextId = HIGH_TECH_FEATURES[nextIndex]?.id;
    if (nextId) {
      setActiveTab(nextId);
      document.getElementById(`hightech-tab-${nextId}`)?.focus();
    }
  };

  return (
    <section className={styles.showcaseSection} id="high-tech-showcase" aria-labelledby="showcase-heading">
      <div className={`${styles.ambientGlow} ${styles.ambientTop}`} aria-hidden="true" />
      <div className={`${styles.ambientGlow} ${styles.ambientBottom}`} aria-hidden="true" />

      <div className={styles.container}>
        {/* Header */}
        <header className={styles.header}>
          <div className={styles.eyebrow}>
            <span className={styles.pulseDot} aria-hidden="true" />
            <span>2026 NEXT-GEN TRADE TECH · LIVE SHOWCASE</span>
          </div>
          <h2 className={styles.title} id="showcase-heading">
            High-tech breakthroughs built for the truck, <em>not just the desk.</em>
          </h2>
          <p className={styles.description}>
            Explore our 4 flagship AI &amp; field-automation engines designed to win profitable jobs, eliminate paperwork, and maximize every mile.
          </p>
        </header>

        {/* 4 Feature Tabs */}
        <div className={styles.tabList} role="tablist" aria-label="High-tech features showcase">
          {HIGH_TECH_FEATURES.map((feature, idx) => {
            const isActive = feature.id === activeTab;
            return (
              <button
                key={feature.id}
                type="button"
                role="tab"
                id={`hightech-tab-${feature.id}`}
                aria-selected={isActive}
                aria-controls={`hightech-panel-${feature.id}`}
                tabIndex={isActive ? 0 : -1}
                className={`${styles.tabButton} ${isActive ? styles.tabButtonActive : ''}`}
                onClick={() => setActiveTab(feature.id)}
                onKeyDown={(e) => handleKeyDown(e, idx)}
              >
                <div className={styles.tabTopRow}>
                  <span className={styles.tabIcon} aria-hidden="true">
                    {feature.tabIcon}
                  </span>
                  <span className={styles.tabBadge}>{feature.tabBadge}</span>
                </div>
                <p className={styles.tabLabel}>{feature.tabLabel}</p>
                <p className={styles.tabSummary}>{feature.tabSummary}</p>
              </button>
            );
          })}
        </div>

        {/* Main Showcase Stage */}
        <div
          className={styles.showcaseStage}
          id={`hightech-panel-${currentFeature.id}`}
          role="tabpanel"
          aria-labelledby={`hightech-tab-${currentFeature.id}`}
        >
          <div className={styles.stageGrid}>
            {/* Left Column: Context & Proof */}
            <div className={styles.featureInfo}>
              <span className={`${styles.badgePill} ${currentFeature.badgeStyle}`}>
                <span>✦</span> {currentFeature.eyebrow}
              </span>
              <h3 className={styles.featureTitle}>{currentFeature.title}</h3>
              <p className={styles.featureBlurb}>{currentFeature.blurb}</p>

              <ul className={styles.bulletList} aria-label={`${currentFeature.tabLabel} Key Capabilities`}>
                {currentFeature.bullets.map((bullet) => (
                  <li key={bullet} className={styles.bulletItem}>
                    <span className={styles.bulletIcon} aria-hidden="true">
                      ✓
                    </span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>

              <div className={styles.actionRow}>
                <Link className={styles.primaryLink} href={currentFeature.primaryHref}>
                  {currentFeature.primaryCtaText} <span aria-hidden="true">→</span>
                </Link>
                <Link className={styles.secondaryLink} href={currentFeature.secondaryHref}>
                  {currentFeature.secondaryCtaText}
                </Link>
              </div>
            </div>

            {/* Right Column: Live Interactive Sandbox Simulator */}
            <div className={styles.interactiveCanvas}>
              <div className={styles.canvasHeader}>
                <div className={styles.windowDots} aria-hidden="true">
                  <span className={styles.windowDot} />
                  <span className={styles.windowDot} />
                  <span className={styles.windowDot} />
                </div>
                <span className={styles.canvasStatusPill}>
                  <span className={styles.pulseDot} aria-hidden="true" />
                  LIVE SIMULATION MODE
                </span>
              </div>

              {/* SIMULATOR 1: TEXT-TO-JOB */}
              {activeTab === 'text-to-job' && (
                <>
                  <div className={styles.canvasScenarioBar} role="group" aria-label="Select Voice Scenario">
                    {TEXT_TO_JOB_SCENARIOS.map((sc, idx) => (
                      <button
                        key={sc.id}
                        type="button"
                        className={`${styles.scenarioChip} ${activeVoiceScenario === idx ? styles.scenarioChipActive : ''}`}
                        onClick={() => setActiveVoiceScenario(idx)}
                      >
                        {sc.label}
                      </button>
                    ))}
                  </div>

                  <div className={styles.canvasBody}>
                    <div className={styles.waveformBox}>
                      <div className={styles.waveBars} aria-hidden="true">
                        <span className={styles.waveBar} style={{ animationDelay: '0s' }} />
                        <span className={styles.waveBar} style={{ animationDelay: '0.2s' }} />
                        <span className={styles.waveBar} style={{ animationDelay: '0.4s' }} />
                        <span className={styles.waveBar} style={{ animationDelay: '0.1s' }} />
                        <span className={styles.waveBar} style={{ animationDelay: '0.3s' }} />
                      </div>
                      <div className={styles.audioTranscription}>
                        <small style={{ color: '#38bdf8', display: 'block', marginBottom: '2px' }}>
                          RAW FIELD AUDIO / SMS
                        </small>
                        {TEXT_TO_JOB_SCENARIOS[activeVoiceScenario]?.transcript}
                      </div>
                    </div>

                    <div className={styles.safetyCheckRow}>
                      <span aria-hidden="true">🛡️</span>
                      <span>
                        <b>Target Record:</b> {TEXT_TO_JOB_SCENARIOS[activeVoiceScenario]?.matchedJob} (Confidence: 99.8%)
                      </span>
                    </div>

                    <div className={styles.diffCard}>
                      <div className={styles.diffHead}>
                        <span>LIVE JOB INVOICE RECONCILIATION</span>
                        <span style={{ color: '#38bdf8' }}>PORTAL SYNCED</span>
                      </div>
                      <div className={styles.diffLineItem}>
                        <span>{TEXT_TO_JOB_SCENARIOS[activeVoiceScenario]?.lineItem}</span>
                        <span>APPLIED</span>
                      </div>
                      <small style={{ color: '#94a3b8' }}>
                        {TEXT_TO_JOB_SCENARIOS[activeVoiceScenario]?.marginImpact} · Deduplicated via Idempotency Hash
                      </small>
                    </div>
                  </div>
                </>
              )}

              {/* SIMULATOR 2: PHOTO SCOPE & OCR */}
              {activeTab === 'photo-scope' && (
                <>
                  <div className={styles.canvasScenarioBar} role="group" aria-label="Select Photo Inspection">
                    {PHOTO_SCOPE_SCENARIOS.map((sc, idx) => (
                      <button
                        key={sc.id}
                        type="button"
                        className={`${styles.scenarioChip} ${activePhotoScenario === idx ? styles.scenarioChipActive : ''}`}
                        onClick={() => setActivePhotoScenario(idx)}
                      >
                        {sc.label}
                      </button>
                    ))}
                  </div>

                  <div className={styles.canvasBody}>
                    <div className={styles.visionHud}>
                      <div className={styles.ocrBoundingBox}>
                        <span className={styles.ocrTag}>AI OCR &amp; DEFECT BOUNDING LAYER</span>
                        <div className={styles.ocrDataList}>
                          <div>
                            <small style={{ color: '#94a3b8', display: 'block' }}>RECOGNIZED METADATA</small>
                            <b>{PHOTO_SCOPE_SCENARIOS[activePhotoScenario]?.plateOcr}</b>
                          </div>
                          <div>
                            <small style={{ color: '#94a3b8', display: 'block' }}>DIAGNOSED RISK</small>
                            <span style={{ color: '#fbbf24' }}>
                              {PHOTO_SCOPE_SCENARIOS[activePhotoScenario]?.detectedIssue}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className={styles.diffCard}>
                        <div className={styles.diffHead}>
                          <span>GENERATED MATERIAL PICK-LIST</span>
                          <span style={{ color: '#34d399' }}>
                            {PHOTO_SCOPE_SCENARIOS[activePhotoScenario]?.confidence}
                          </span>
                        </div>
                        <div className={styles.diffLineItem}>
                          <span style={{ color: '#f8fafc', fontSize: '0.84rem' }}>
                            {PHOTO_SCOPE_SCENARIOS[activePhotoScenario]?.materials}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* SIMULATOR 3: QUICK STOPS */}
              {activeTab === 'quick-stops' && (
                <>
                  <div className={styles.canvasScenarioBar} role="group" aria-label="Select Detour Route">
                    {QUICK_STOPS_SCENARIOS.map((sc, idx) => (
                      <button
                        key={sc.id}
                        type="button"
                        className={`${styles.scenarioChip} ${activeRouteScenario === idx ? styles.scenarioChipActive : ''}`}
                        onClick={() => setActiveRouteScenario(idx)}
                      >
                        {sc.label}
                      </button>
                    ))}
                  </div>

                  <div className={styles.canvasBody}>
                    <div className={styles.routeDetourBox}>
                      <div className={styles.routeTimeline}>
                        <div className={styles.routeStop}>
                          <span className={styles.stopMarker}>1</span>
                          <span>9:00 AM</span>
                        </div>
                        <div className={styles.routeStop}>
                          <span className={`${styles.stopMarker} ${styles.stopMarkerActive}`}>+</span>
                          <span style={{ color: '#ff6a24', fontWeight: 'bold' }}>QUICK STOP</span>
                        </div>
                        <div className={styles.routeStop}>
                          <span className={styles.stopMarker}>2</span>
                          <span>1:30 PM</span>
                        </div>
                      </div>

                      <div className={styles.detourBadge}>
                        ⚡ {QUICK_STOPS_SCENARIOS[activeRouteScenario]?.detourMetrics} off today&rsquo;s route
                      </div>

                      <div className={styles.diffCard}>
                        <div className={styles.diffHead}>
                          <span>MATCHED NEARBY INQUIRY</span>
                          <span style={{ color: '#ff6a24' }}>
                            {QUICK_STOPS_SCENARIOS[activeRouteScenario]?.feeOffer}
                          </span>
                        </div>
                        <div className={styles.diffLineItem}>
                          <span>{QUICK_STOPS_SCENARIOS[activeRouteScenario]?.client}</span>
                        </div>
                        <small style={{ color: '#34d399', fontWeight: 600 }}>
                          {QUICK_STOPS_SCENARIOS[activeRouteScenario]?.prepayStatus}
                        </small>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* SIMULATOR 4: AI SMART INTAKE */}
              {activeTab === 'ai-intake' && (
                <>
                  <div className={styles.canvasScenarioBar} role="group" aria-label="Select Intake Scenario">
                    {AI_INTAKE_SCENARIOS.map((sc, idx) => (
                      <button
                        key={sc.id}
                        type="button"
                        className={`${styles.scenarioChip} ${activeIntakeScenario === idx ? styles.scenarioChipActive : ''}`}
                        onClick={() => setActiveIntakeScenario(idx)}
                      >
                        {sc.label}
                      </button>
                    ))}
                  </div>

                  <div className={styles.canvasBody}>
                    <div className={styles.diffCard}>
                      <small style={{ color: '#94a3b8' }}>HOMEOWNER INQUIRY</small>
                      <p style={{ color: '#f8fafc', margin: '4px 0 0', fontSize: '0.86rem' }}>
                        {AI_INTAKE_SCENARIOS[activeIntakeScenario]?.userInput}
                      </p>
                    </div>

                    <div className={styles.safetyCheckRow}>
                      <span aria-hidden="true">✦</span>
                      <span>{AI_INTAKE_SCENARIOS[activeIntakeScenario]?.aiFollowup}</span>
                    </div>

                    <div className={styles.diffCard} style={{ borderColor: 'rgba(52, 211, 153, 0.3)' }}>
                      <div className={styles.diffHead}>
                        <span>AUTOMATED LEAD TRIAGE</span>
                        <span style={{ color: '#34d399' }}>HIGH VALUE ALERT</span>
                      </div>
                      <div className={styles.diffLineItem} style={{ color: '#38bdf8' }}>
                        <span>{AI_INTAKE_SCENARIOS[activeIntakeScenario]?.triageScore}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Bottom Trust & Tech Benchmarks */}
          <div className={styles.bottomTrustRow}>
            <div className={styles.trustStat}>
              <b>0.2s Audio Extraction</b>
              <span>Powered by Gemini Multimodal Field Audio Model</span>
            </div>
            <div className={styles.trustStat}>
              <b>Zero Destructive Guesses</b>
              <span>Deterministic validation before modifying job records</span>
            </div>
            <div className={styles.trustStat}>
              <b>Stripe Pre-Auth Lock</b>
              <span>Guaranteed payout clearing prior to truck departure</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

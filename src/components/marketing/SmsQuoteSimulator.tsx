'use client';

import Image from 'next/image';
import { useState } from 'react';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import styles from './sms-quote-simulator.module.css';

type Scenario = {
  id: string;
  name: string;
  trade: string;
  homeownerMessage: string;
  aiResponse: string;
  quoteTitle: string;
  quoteLines: string[];
  total: string;
  deposit: string;
  contractorToastText: string;
  beforePhoto?: string;
  afterPhoto?: string;
};

const SCENARIOS: Scenario[] = [
  {
    id: 'bath-to-shower',
    name: '🚿 Tub-to-Shower Conversion',
    trade: 'Bathroom Remodeling',
    homeownerMessage:
      'We want to replace this tub with a low-threshold shower for my mom. Same footprint, no plumbing move. Could you include a seat, grab bar, niche, and glass door?',
    aiResponse:
      'The request fits a standard 60-inch alcove conversion. I organized the photo, safety requirements, and finish selections into a contractor-ready quote draft:',
    quoteTitle: '60-inch Low-Threshold Shower Conversion',
    quoteLines: [
      'Demolition, haul-away & plumbing prep: $1,650',
      'Waterproofing, tile & installation labor: $2,950',
      'Shower pan, glass & safety package: $3,500',
    ],
    total: '$8,100.00',
    deposit: '$810.00',
    contractorToastText: '🚿 $810.00 deposit paid! Michelle C. booked for final measure Thursday at 4:30 PM.',
    beforePhoto: '/demo/bath-to-shower/before.png',
    afterPhoto: '/demo/bath-to-shower/after.png',
  },
  {
    id: 'pipe-emergency',
    name: '⚡ Burst Pipe Emergency',
    trade: 'Emergency Plumbing',
    homeownerMessage: 'Hi! Pipe under my kitchen sink burst and water is running across the hardwood. Can someone come out ASAP?',
    aiResponse:
      '🚨 We can dispatch a technician right away. We are currently 1.8 miles away on route. Upfront emergency diagnosis & repair estimate ready below:',
    quoteTitle: 'Emergency Pipe Repair & Shutoff',
    quoteLines: [
      'Emergency Labor & Pressure Testing: $240',
      'Copper/PEX Couplings & Valve: $65',
    ],
    total: '$305.00',
    deposit: '$150.00',
    contractorToastText: '⚡ $150.00 Deposit Paid via Apple Pay! Dana R. booked for 2:15 PM.',
  },
  {
    id: 'deck-quote',
    name: '🔨 250 sq ft Cedar Deck',
    trade: 'Custom Carpentry',
    homeownerMessage: 'Looking to replace my old 250 sq ft backyard deck with cedar decking and black aluminum railings.',
    aiResponse:
      'Thanks for reaching out! Based on 250 sq ft cedar specifications in your area, here is your preliminary itemized estimate and 3D design slot:',
    quoteTitle: '250 sq ft Premium Cedar Deck',
    quoteLines: [
      'Demolition & Framing Labor: $3,200',
      'Cedar Decking & Aluminum Railings: $4,450',
    ],
    total: '$7,650.00',
    deposit: '$500.00',
    contractorToastText: '🔨 $500.00 Design Deposit Paid! Sarah K. site visit confirmed.',
  },
  {
    id: 'hvac-ac',
    name: '❄️ AC Blowing Warm Air',
    trade: 'Heating & Cooling (HVAC)',
    homeownerMessage: 'AC stopped cooling this morning. Fan spins outside but vents are blowing 78-degree room temperature air.',
    aiResponse:
      'We have an HVAC tech in your neighborhood between 1:00 PM and 3:00 PM. Here is your capacitor & refrigerant diagnostic quote:',
    quoteTitle: 'AC System Diagnostic & Tune',
    quoteLines: [
      'System Diagnostic & Capacitor Check: $149',
      'Capacitor Replacement & Coil Clean: $135',
    ],
    total: '$284.00',
    deposit: '$100.00',
    contractorToastText: '❄️ $100.00 Deposit Confirmed! Marcus T. added to afternoon route.',
  },
  {
    id: 'tree-removal',
    name: '🌳 Fallen Tree Branch',
    trade: 'Tree Care & Landscaping',
    homeownerMessage: 'A large oak limb snapped in last night’s storm and is blocking our driveway. Need it cut and hauled away.',
    aiResponse:
      'Our tree crew has a woodchipper in your sector today. We can clear and haul the limb by 4:00 PM today:',
    quoteTitle: 'Emergency Tree Limb Removal & Haul',
    quoteLines: [
      'Chainsaw Crew Labor & Chipper: $275',
      'Debris Disposal & Yard Sweep: $75',
    ],
    total: '$350.00',
    deposit: '$150.00',
    contractorToastText: '🌳 $150.00 Paid via Apple Pay! Driveway job booked.',
  },
];

export default function SmsQuoteSimulator() {
  const [selectedId, setSelectedId] = useState(SCENARIOS[0].id);
  // Stage: 0 = start, 1 = homeowner sent, 2 = AI answered + quote generated, 3 = paid with Apple Pay
  const [stage, setStage] = useState<number>(2);
  const [isSimulating, setIsSimulating] = useState(false);

  const scenario = SCENARIOS.find((s) => s.id === selectedId) || SCENARIOS[0];

  const handleSelectScenario = (id: string) => {
    setSelectedId(id);
    setStage(2);
    setIsSimulating(false);
  };

  const handlePlaySimulation = () => {
    setIsSimulating(true);
    setStage(1);
    setTimeout(() => {
      setStage(2);
      setIsSimulating(false);
    }, 1400);
  };

  const handlePayApplePay = () => {
    setStage(3);
  };

  const handleReset = () => {
    setStage(1);
  };

  return (
    <div className={styles.simulatorContainer} data-reel-frame="simulator">
      <div className={styles.card}>
        {/* Left Column Narrative */}
        <div className={styles.narrativeCol}>
          <div>
            <span className={styles.kicker}>Instant AI Inbound Engine</span>
            <h3 className={styles.heading}>
              From text message to <em>paid deposit</em> in 60 seconds.
            </h3>
            <p className={styles.description}>
              Homeowners text your business line 24/7. Let’s Get Quoted AI checks your service area, generates an
              accurate quote draft, and collects an instant deposit before competitors even check their voicemail.
            </p>
          </div>

          {/* Scenario Tabs */}
          <div className={styles.scenarioSection}>
            <span className={styles.scenarioLabel}>Select Trade Scenario</span>
            <div className={styles.scenarioGrid}>
              {SCENARIOS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleSelectScenario(s.id)}
                  className={`${styles.scenarioBtn} ${selectedId === s.id ? styles.scenarioBtnActive : ''}`}
                  data-scenario-id={s.id}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          {/* 4-Step Pipeline Status */}
          <div className={styles.stepPipeline}>
            <div className={`${styles.stepItem} ${stage >= 1 ? styles.stepItemActive : ''}`}>
              <div className={`${styles.stepNumber} ${stage >= 1 ? (stage > 1 ? styles.stepNumberDone : styles.stepNumberActive) : ''}`}>
                {stage > 1 ? '✓' : '1'}
              </div>
              <span>1. Homeowner texts description &amp; photos</span>
            </div>
            <div className={`${styles.stepItem} ${stage >= 2 ? styles.stepItemActive : ''}`}>
              <div className={`${styles.stepNumber} ${stage >= 2 ? (stage > 2 ? styles.stepNumberDone : styles.stepNumberActive) : ''}`}>
                {stage > 2 ? '✓' : '2'}
              </div>
              <span>2. AI qualifies trade scope &amp; sends interactive quote</span>
            </div>
            <div className={`${styles.stepItem} ${stage >= 3 ? styles.stepItemActive : ''}`}>
              <div className={`${styles.stepNumber} ${stage >= 3 ? styles.stepNumberDone : ''}`}>
                {stage >= 3 ? '✓' : '3'}
              </div>
              <span>3. Homeowner approves &amp; taps Apple Pay deposit</span>
            </div>
            <div className={`${styles.stepItem} ${stage >= 3 ? styles.stepItemActive : ''}`}>
              <div className={`${styles.stepNumber} ${stage >= 3 ? styles.stepNumberDone : ''}`}>
                {stage >= 3 ? '✓' : '4'}
              </div>
              <span>4. Contractor phone buzzes: Job booked &amp; cash in Stripe</span>
            </div>
          </div>

          <div>
            <a href={APP_SIGNUP_URL} className={styles.ctaButton}>
              Enable AI Intake on Flex ($0/mo) &rarr;
            </a>
          </div>
        </div>

        {/* Right Column Phone Simulation */}
        <div className={styles.phoneWrapper}>
          <div className={styles.phoneFrame} data-reel-frame="phone">
            <div className={styles.phoneNotch} />

            {/* Contractor Toast Alert when Paid */}
            {stage === 3 && (
              <div className={styles.contractorToast}>
                <span className={styles.toastIcon}>💰</span>
                <div>
                  <div className={styles.toastTitle}>Stripe Deposit Received</div>
                  <div className={styles.toastBody}>{scenario.contractorToastText}</div>
                </div>
              </div>
            )}

            {/* Header */}
            <div className={styles.phoneHeader}>
              <div className={styles.phoneHeaderTitle}>Let’s Get Quoted AI Assistant</div>
              <div className={styles.phoneHeaderSubtitle}>● Instant 24/7 Response Active</div>
            </div>

            {/* Chat Messages */}
            <div className={styles.phoneChatBody}>
              {/* Homeowner message */}
              {stage >= 1 && (
                <div className={styles.smsBubbleHomeowner}>
                  {scenario.beforePhoto ? (
                    <figure className={styles.projectPhoto}>
                      <Image
                        src={scenario.beforePhoto}
                        alt="Existing bathtub alcove submitted with the homeowner's request"
                        width={1456}
                        height={1092}
                        sizes="280px"
                        priority
                      />
                      <figcaption>Existing bathroom · 1 photo</figcaption>
                    </figure>
                  ) : null}
                  {scenario.homeownerMessage}
                </div>
              )}

              {/* AI Response & Quote Card */}
              {stage >= 2 && (
                <div className={styles.smsBubbleAi}>
                  <div>{scenario.aiResponse}</div>

                  {/* Interactive Quote Card */}
                  <div className={styles.quoteCardPreview}>
                    {scenario.afterPhoto ? (
                      <figure className={styles.projectPhoto}>
                        <Image
                          src={scenario.afterPhoto}
                          alt="Proposed low-threshold shower conversion in the same bathroom"
                          width={1456}
                          height={1092}
                          sizes="280px"
                          priority
                        />
                        <figcaption>Proposed finish · same footprint</figcaption>
                      </figure>
                    ) : null}
                    <div className={styles.quoteCardTitle}>{scenario.quoteTitle}</div>
                    {scenario.quoteLines.map((line) => (
                      <div className={styles.quoteLine} key={line}>
                        <span>{line}</span>
                      </div>
                    ))}
                    <div
                      style={{
                        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                        paddingTop: 4,
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontWeight: 800,
                        color: '#f5f0e7',
                      }}
                    >
                      <span>Total: {scenario.total}</span>
                      <span style={{ color: '#50e3bd' }}>Deposit: {scenario.deposit}</span>
                    </div>

                    {/* Apple Pay Button */}
                    {stage === 2 && (
                      <button
                        type="button"
                        onClick={handlePayApplePay}
                        className={styles.applePayBtn}
                        aria-label="Pay deposit with Apple Pay"
                        data-reel-action="pay-deposit"
                      >
                        <span>Apple Pay</span> &middot; Pay {scenario.deposit} Deposit
                      </button>
                    )}

                    {/* Paid status */}
                    {stage === 3 && (
                      <div className={styles.paidConfirmation}>
                        ✓ Deposit Paid &middot; Crew Dispatched
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Simulator Controls */}
            <div className={styles.phoneFooterControls}>
              <button
                type="button"
                onClick={handlePlaySimulation}
                disabled={isSimulating}
                className={styles.simBtn}
                data-reel-action="replay-flow"
              >
                {isSimulating ? 'Simulating...' : '▶ Replay Flow'}
              </button>
              <button type="button" onClick={handleReset} className={styles.resetBtn}>
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

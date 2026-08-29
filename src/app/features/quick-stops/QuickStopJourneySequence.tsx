'use client';

import { useState, useEffect, useRef } from 'react';
import { QuickStopIcon } from '@/components/quick-stop-icons';
import styles from './quick-stop-journey-sequence.module.css';

type ActorType = 'homeowner' | 'platform' | 'contractor';

type SequenceStep = {
  id: number;
  tag: string;
  title: string;
  subtitle: string;
  actors: {
    from: { name: string; role: string; type: ActorType };
    to: { name: string; role: string; type: ActorType };
    channel: string;
    channelIcon: string;
  };
  narrative: string;
  messages: {
    id: string;
    sender: ActorType;
    senderName: string;
    text: string;
    subtext?: string;
    chips?: string[];
    actionPill?: string;
    actionTargetStep?: number;
    badge?: string;
    badgeTone?: 'warning' | 'success' | 'info';
    time: string;
  }[];
  keyTakeaway: string;
};

const STEPS: SequenceStep[] = [
  {
    id: 1,
    tag: 'Turn 1 · Instant Intake',
    title: 'Customer asks for priority on your booking page',
    subtitle: 'Screened automatically for safety, location, and route compatibility in under a second.',
    actors: {
      from: { name: 'Jane Homeowner', role: 'Customer', type: 'homeowner' },
      to: { name: 'You (Apex Plumbing)', role: 'Contractor', type: 'contractor' },
      channel: 'Website Form → Dashboard Alert',
      channelIcon: '⚡',
    },
    narrative:
      'A homeowner fills in your Quick Stop intake. Customers near your active route or inside a priority area you have drawn are matched — texted and emailed to you the moment it lands.',
    messages: [
      {
        id: 'm1-1',
        sender: 'homeowner',
        senderName: 'Jane H. (Website Intake)',
        text: '“Kitchen faucet leaking under sink and the shut-off valve is stuck. Can anyone come out this afternoon?”',
        time: '9:38 AM',
      },
      {
        id: 'm1-2',
        sender: 'platform',
        senderName: 'Let’s Get Quoted Engine',
        text: '⚡ Route-Matched Quick Stop Request',
        subtext: '12 min detour from your 2:30 PM job on Maple St. 1 tech, ~30 min fix.',
        badge: '⏱ 30-min contractor response window',
        badgeTone: 'warning',
        chips: ['1 Tech OK', 'Safety Cleared', '2 Photos Attached'],
        actionPill: 'Tap to Review & Set Fee →',
        actionTargetStep: 2,
        time: '9:38 AM',
      },
    ],
    keyTakeaway: 'You get the request with exact route detour miles before picking up the phone.',
  },
  {
    id: 2,
    tag: 'Turn 2 · One-Tap Offer',
    title: 'You choose the arrival window & priority fee',
    subtitle: 'The platform instantly texts the customer with a 15-minute reservation hold.',
    actors: {
      from: { name: 'You (Apex Plumbing)', role: 'Contractor', type: 'contractor' },
      to: { name: 'Jane Homeowner', role: 'Customer', type: 'homeowner' },
      channel: 'A2P Verified Carrier SMS',
      channelIcon: '📲',
    },
    narrative:
      'You pick an arrival window (e.g. 3:00–5:00 PM) and set your fee (e.g. $95). The engine generates a secure checkout link and texts the homeowner immediately. No manual typing while driving.',
    messages: [
      {
        id: 'm2-1',
        sender: 'contractor',
        senderName: 'Apex Plumbing',
        text: 'Your Quick Stop offer from Apex Plumbing: arrive Today between 3:00 PM – 5:00 PM for a $95 priority visit fee. This reserves the visit; service and parts are billed separately.',
        subtext: 'Pay within 15 min to hold this window: app.letsgetquoted.com/pay/qs_8f29',
        badge: '⏱ Holds window for 14:58',
        badgeTone: 'warning',
        actionPill: 'Simulate Customer Apple Pay ($95) →',
        actionTargetStep: 3,
        time: '9:40 AM',
      },
    ],
    keyTakeaway: 'No manual phone tag or typing while driving — one tap sends the compliant text.',
  },
  {
    id: 3,
    tag: 'Turn 3 · Instant Payment & Lock',
    title: 'Customer pays with Apple Pay / Card',
    subtitle: 'Funds land via Stripe; the tentative slot automatically locks onto your live calendar.',
    actors: {
      from: { name: 'Jane Homeowner', role: 'Customer', type: 'homeowner' },
      to: { name: 'You (Apex Plumbing)', role: 'Contractor', type: 'contractor' },
      channel: 'Stripe Payment → Dispatch Calendar',
      channelIcon: '💳',
    },
    narrative:
      'The customer pays the priority fee in seconds. The placeholder automatically becomes a live job on your schedule, and the customer receives an instant confirmation text with tracking.',
    messages: [
      {
        id: 'm3-1',
        sender: 'platform',
        senderName: 'Stripe Payouts',
        text: '✓ $95.00 Priority Visit Fee Collected',
        subtext: 'Deposited directly to your Stripe account. Job locked on schedule.',
        badge: '✓ Payment Verified',
        badgeTone: 'success',
        chips: ['Apple Pay', 'Calendar Updated: 3–5 PM'],
        time: '9:42 AM',
      },
      {
        id: 'm3-2',
        sender: 'contractor',
        senderName: 'Apex Plumbing (Automated SMS)',
        text: 'You’re confirmed! Apex Plumbing will arrive Today 3:00 PM – 5:00 PM. Your visit fee is paid; any repair work is quoted & billed separately.',
        subtext: 'Manage or track: app.letsgetquoted.com/quick-stop/req_4410',
        actionPill: 'Simulate Day-of Dispatch →',
        actionTargetStep: 4,
        time: '9:42 AM',
      },
    ],
    keyTakeaway: 'Guaranteed payment before turning the steering wheel. Unpaid offers auto-expire.',
  },
  {
    id: 4,
    tag: 'Turn 4 · Day-of Arrival & ETA',
    title: 'Van en-route & live ETA texts',
    subtitle: 'One tap in your mobile dashboard notifies the customer when you are on the way.',
    actors: {
      from: { name: 'You (Apex Plumbing)', role: 'Contractor', type: 'contractor' },
      to: { name: 'Jane Homeowner', role: 'Customer', type: 'homeowner' },
      channel: 'Mobile Dashboard → Live SMS',
      channelIcon: '🚗',
    },
    narrative:
      'When heading over, tap "En Route" or "15m Away" in your dashboard. The platform texts the homeowner in real-time. Once on site, tap "I’ve Arrived" with GPS verification.',
    messages: [
      {
        id: 'm4-1',
        sender: 'contractor',
        senderName: 'Apex Plumbing (SMS Update)',
        text: 'Quick Stop update: Your technician is on the way and approximately 15 minutes away.',
        badge: '🚗 Van Dispatched',
        badgeTone: 'info',
        chips: ['En Route at 3:18 PM', 'ETA 3:33 PM'],
        time: '3:18 PM',
      },
      {
        id: 'm4-2',
        sender: 'contractor',
        senderName: 'Apex Plumbing (SMS Update)',
        text: 'Your technician has arrived on site.',
        badge: '📍 GPS Arrival Verified',
        badgeTone: 'success',
        chips: ['Arrived at 3:31 PM', '124 Main St'],
        time: '3:31 PM',
      },
    ],
    keyTakeaway: 'Keeps the homeowner informed without you ever typing out texts from the cab.',
  },
];

export default function QuickStopJourneySequence() {
  const [activeStepId, setActiveStepId] = useState(1);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);

  const activeStep = STEPS.find((s) => s.id === activeStepId) || STEPS[0];

  // Auto-play cycling
  useEffect(() => {
    if (!isAutoPlaying) {
      if (autoPlayTimerRef.current) clearInterval(autoPlayTimerRef.current);
      return;
    }

    autoPlayTimerRef.current = setInterval(() => {
      setActiveStepId((curr) => (curr < STEPS.length ? curr + 1 : 1));
    }, 4500);

    return () => {
      if (autoPlayTimerRef.current) clearInterval(autoPlayTimerRef.current);
    };
  }, [isAutoPlaying]);

  function handleTabSelect(id: number) {
    setIsAutoPlaying(false);
    setActiveStepId(id);
  }

  function handleActionPillClick(targetStep?: number) {
    if (targetStep && targetStep >= 1 && targetStep <= STEPS.length) {
      setIsAutoPlaying(false);
      setActiveStepId(targetStep);
    }
  }

  return (
    <section className={styles.sequenceWrapper} aria-labelledby="qs-journey-heading">
      {/* Decorative ambient glow */}
      <div className={styles.ambientGlow} aria-hidden="true" />

      <div className={styles.sectionHeader}>
        <span className={styles.eyebrow}>
          <QuickStopIcon name="spark" /> End-to-End Communication Journey
        </span>
        <h2 id="qs-journey-heading" className={styles.heading}>
          The complete 4-turn <span className={styles.gradientText}>texting &amp; dispatch loop</span>
        </h2>
        <p className={styles.lead}>
          Contractors hate phone tag and dread manual texting while driving. Here is the exact, automated
          ping-pong sequence that powers every Quick Stop from inquiry to arrival.
        </p>

        {/* Auto-Play Toggle */}
        <div className={styles.autoPlayControls}>
          <button
            type="button"
            className={`${styles.autoPlayBtn} ${isAutoPlaying ? styles.autoPlayBtnActive : ''}`}
            onClick={() => setIsAutoPlaying((prev) => !prev)}
            aria-label={isAutoPlaying ? 'Pause interactive tour' : 'Play interactive tour'}
          >
            <span className={styles.playIcon} aria-hidden="true">
              {isAutoPlaying ? '⏸' : '▶'}
            </span>
            <span>{isAutoPlaying ? 'Pause Tour' : 'Auto-Play Sequence'}</span>
          </button>
        </div>
      </div>

      {/* Step Navigation Tabs */}
      <div className={styles.tabBar} role="tablist" aria-label="Quick Stop communication steps">
        {STEPS.map((step) => {
          const isSelected = step.id === activeStepId;
          return (
            <button
              key={step.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              className={`${styles.tabBtn} ${isSelected ? styles.tabBtnActive : ''}`}
              onClick={() => handleTabSelect(step.id)}
            >
              <span className={styles.tabNumber}>{step.id}</span>
              <span className={styles.tabLabel}>{step.tag.split('·')[1]?.trim() || step.tag}</span>
            </button>
          );
        })}
      </div>

      {/* Main Interactive Stage */}
      <div className={styles.stageGrid}>
        {/* Left: Step Details & Mechanics */}
        <div className={styles.narrativePanel}>
          <div className={styles.stepBadgeRow}>
            <span className={styles.stepTag}>{activeStep.tag}</span>
            <div className={styles.channelPill}>
              <span className={styles.channelIcon} aria-hidden="true">
                {activeStep.actors.channelIcon}
              </span>
              <span>{activeStep.actors.channel}</span>
            </div>
          </div>

          <h3 className={styles.narrativeTitle}>{activeStep.title}</h3>
          <p className={styles.narrativeLead}>{activeStep.subtitle}</p>

          {/* Actor Flow Direction Card */}
          <div className={styles.actorFlowCard}>
            <div className={styles.actorNode}>
              <span className={styles.actorRole}>From</span>
              <div className={styles.actorNameRow}>
                <span
                  className={`${styles.actorAvatarDot} ${
                    activeStep.actors.from.type === 'homeowner'
                      ? styles.actorDotHomeowner
                      : activeStep.actors.from.type === 'contractor'
                      ? styles.actorDotContractor
                      : styles.actorDotPlatform
                  }`}
                  aria-hidden="true"
                />
                <strong className={styles.actorName}>{activeStep.actors.from.name}</strong>
              </div>
              <small className={styles.actorSub}>{activeStep.actors.from.role}</small>
            </div>

            <div className={styles.flowArrow} aria-hidden="true">
              <span className={styles.arrowIcon}>➔</span>
            </div>

            <div className={styles.actorNode}>
              <span className={styles.actorRole}>To</span>
              <div className={styles.actorNameRow}>
                <span
                  className={`${styles.actorAvatarDot} ${
                    activeStep.actors.to.type === 'homeowner'
                      ? styles.actorDotHomeowner
                      : activeStep.actors.to.type === 'contractor'
                      ? styles.actorDotContractor
                      : styles.actorDotPlatform
                  }`}
                  aria-hidden="true"
                />
                <strong className={styles.actorName}>{activeStep.actors.to.name}</strong>
              </div>
              <small className={styles.actorSub}>{activeStep.actors.to.role}</small>
            </div>
          </div>

          <p className={styles.narrativeBody}>{activeStep.narrative}</p>

          <div className={styles.takeawayBox}>
            <span className={styles.takeawayIcon} aria-hidden="true">
              💡
            </span>
            <p>
              <strong>Contractor guarantee:</strong> {activeStep.keyTakeaway}
            </p>
          </div>

          <div className={styles.stepNavControls}>
            <button
              type="button"
              className={styles.prevBtn}
              disabled={activeStepId === 1}
              onClick={() => handleTabSelect(Math.max(1, activeStepId - 1))}
            >
              ← Previous Turn
            </button>
            <button
              type="button"
              className={styles.nextBtn}
              onClick={() => handleTabSelect(activeStepId < STEPS.length ? activeStepId + 1 : 1)}
            >
              {activeStepId === STEPS.length ? 'Replay from Turn 1 ↻' : 'Next Turn →'}
            </button>
          </div>
        </div>

        {/* Right: Live Interactive Phone / Message Preview */}
        <div className={styles.previewContainer}>
          <div className={styles.phoneFrame}>
            <div className={styles.phoneBar}>
              <span className={styles.phoneTime}>9:41 AM</span>
              <div className={styles.phoneIsland}>
                <span className={styles.islandCamera} />
              </div>
              <span className={styles.phoneSignal}>5G 🔋</span>
            </div>

            <div className={styles.phoneHeader}>
              <div className={styles.avatarCircle}>
                {activeStep.actors.from.type === 'homeowner'
                  ? '👤'
                  : activeStep.actors.from.type === 'contractor'
                  ? '🛠️'
                  : '⚡'}
              </div>
              <div className={styles.headerInfo}>
                <strong>{activeStep.messages[0]?.senderName || 'Quick Stop Dispatch'}</strong>
                <small>Verified Business Line · SMS / Data</small>
              </div>
            </div>

            <div className={styles.phoneBody}>
              {activeStep.messages.map((msg) => (
                <div key={msg.id} className={styles.messageBubbleWrapper}>
                  {/* Status Badge */}
                  {msg.badge ? (
                    <div
                      className={`${styles.bubbleStatusBadge} ${
                        msg.badgeTone === 'success'
                          ? styles.badgeSuccess
                          : msg.badgeTone === 'warning'
                          ? styles.badgeWarning
                          : styles.badgeInfo
                      }`}
                    >
                      {msg.badge}
                    </div>
                  ) : null}

                  {/* Bubble */}
                  <div
                    className={`${styles.messageBubble} ${
                      msg.sender === 'homeowner'
                        ? styles.bubbleInbound
                        : msg.sender === 'contractor'
                        ? styles.bubbleContractor
                        : styles.bubblePlatform
                    }`}
                  >
                    <p className={styles.bubbleText}>{msg.text}</p>
                    {msg.subtext ? <p className={styles.bubbleSub}>{msg.subtext}</p> : null}

                    {/* Chips */}
                    {msg.chips && msg.chips.length > 0 ? (
                      <div className={styles.chipRow}>
                        {msg.chips.map((chip) => (
                          <span key={chip} className={styles.bubbleChip}>
                            {chip}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {/* Interactive Action Pill */}
                    {msg.actionPill ? (
                      <button
                        type="button"
                        className={styles.actionPill}
                        onClick={() => handleActionPillClick(msg.actionTargetStep)}
                      >
                        <span>{msg.actionPill}</span>
                      </button>
                    ) : null}

                    <span className={styles.messageTime}>{msg.time}</span>
                  </div>
                </div>
              ))}

              {/* Delivery Receipt */}
              <p className={styles.bubbleFooter}>
                ✓ Delivered via 10 CFR / TCR A2P 10DLC Route
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

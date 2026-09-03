'use client';

import { useState } from 'react';
import styles from './neighborhood-halo.module.css';

type JourneyStep = {
  id: number;
  tag: string;
  badge: string;
  badgeTone: 'info' | 'warning' | 'success';
  title: string;
  subtitle: string;
  channel: string;
  channelIcon: string;
  dialogue: {
    sender: 'crew' | 'platform' | 'neighbor' | 'estimator';
    senderName: string;
    text: string;
    subtext?: string;
    time: string;
  }[];
  takeaway: string;
  metric: string;
};

const JOURNEY_STEPS: JourneyStep[] = [
  {
    id: 1,
    tag: 'Turn 1 · Field Completion',
    badge: 'Field App Trigger',
    badgeTone: 'info',
    title: 'Crew wraps job on site and snaps completion photo',
    subtitle: 'Zero marketing effort required from the field tech—marking the job done initiates the halo.',
    channel: 'Let’s Get Quoted Field App',
    channelIcon: '📱',
    dialogue: [
      {
        sender: 'crew',
        senderName: 'Lead Tech Marcus (In Field)',
        text: '“Job #4092 complete! New 50-year architectural shingle roof installed on Maple Ave. Cleaned gutters and swept driveway.”',
        subtext: '📸 2 completion photos attached · Clean inspection signed',
        time: '3:15 PM',
      },
      {
        sender: 'platform',
        senderName: 'Halo Intelligence Engine',
        text: '⚡ Job Completed at 1428 Maple Ave, Rochester, MI',
        subtext: 'High-quality craftsmanship verified (1200x900 WebP). Ready for neighborhood halo micro-pacing.',
        time: '3:15 PM',
      },
    ],
    takeaway: 'Your technicians don’t need to know anything about marketing—they just tap complete.',
    metric: 'Trigger Time: <2 Seconds',
  },
  {
    id: 2,
    tag: 'Turn 2 · Privacy Sanitization',
    badge: 'Zero Privacy Leaks',
    badgeTone: 'success',
    title: 'AI automatically scrubs house numbers & locks 1.0-mile radius',
    subtitle: 'Extracts street clout without compromising client privacy or revealing exact home addresses.',
    channel: 'Privacy Shield Engine',
    channelIcon: '🛡️',
    dialogue: [
      {
        sender: 'platform',
        senderName: 'Address Sanitizer',
        text: '🔒 Sanitizing: 1428 Maple Ave, Rochester, MI 48307',
        subtext: 'House #1428 redacted. Customer name "Sarah Jenkins" suppressed. Public ad copy: "Completed on Maple Ave".',
        time: '3:16 PM',
      },
      {
        sender: 'platform',
        senderName: 'Geofence Mesh',
        text: '📍 Bounding Box Locked: 1.0 Mile Radius (42.68°N, 83.13°W)',
        subtext: 'Targets ~1,840 homeowner households on Maple Ave and connecting residential roads.',
        time: '3:16 PM',
      },
    ],
    takeaway: 'Clients never have their house advertised; neighbors only see street-level proof.',
    metric: 'House Number: 100% Redacted',
  },
  {
    id: 3,
    tag: 'Turn 3 · 1-Click Launch',
    badge: '$25 Micro-Budget',
    badgeTone: 'info',
    title: 'Surgical $25 / 5-day campaign deploys to Meta & Google',
    subtitle: 'Daily pacing capped at $5/day with 72-hour auto-kill protection to prevent wasted ad spend.',
    channel: 'Master MCC Ad Dispatch',
    channelIcon: '🚀',
    dialogue: [
      {
        sender: 'platform',
        senderName: 'Ad Network Dispatch',
        text: '📢 Deploying Sponsored Feed & Search Ads to Maple Ave Homeowners',
        subtext: 'Headline: "Just completed on Maple Ave · Up to $500 off with Neighbor Cluster Pricing".',
        time: '3:17 PM',
      },
      {
        sender: 'platform',
        senderName: '72h Auto-Kill Watchdog',
        text: '🛡️ Auto-Kill Guard Active: Monitoring impressions and CTR',
        subtext: 'If 0 clicks after 150 impressions in 72h, remaining balance automatically refunds to core search.',
        time: '3:17 PM',
      },
    ],
    takeaway: 'No $2,000 agency retainers or long-term commitments—just surgical $25 micro-bursts.',
    metric: 'Spend Cap: $25 / 5 Days',
  },
  {
    id: 4,
    tag: 'Turn 4 · Viral Cluster Share',
    badge: 'Route Multiplier',
    badgeTone: 'warning',
    title: 'Neighbor sees ad and invites adjacent homeowners',
    subtitle: 'Tiered group discounts incentivize homeowners to rally neighbors on the same street.',
    channel: 'Neighbor Group Chat / iMessage',
    channelIcon: '💬',
    dialogue: [
      {
        sender: 'neighbor',
        senderName: 'Neighbor Dave (1440 Maple Ave)',
        text: '“Hey neighbors! Saw the roofing truck at Sarah’s house today. They have an ad offering up to $250 off if 2 or 3 of us schedule estimates together this Thursday.”',
        subtext: 'Shared link: letsgetquoted.com/street/maple-ave-discount',
        time: '6:42 PM',
      },
      {
        sender: 'neighbor',
        senderName: 'Neighbor Linda (1432 Maple Ave)',
        text: '“Our roof had hail granules in the downspout too! Let’s book the afternoon slot so we all get the $250 discount.”',
        time: '6:48 PM',
      },
    ],
    takeaway: 'Homeowners do the selling for you to unlock their own cluster group discounts.',
    metric: 'Street Discount: $100 – $500',
  },
  {
    id: 5,
    tag: 'Turn 5 · Route Batching',
    badge: '0 Miles Windshield Time',
    badgeTone: 'success',
    title: 'Sub-60s SMS books 3 same-day appointments in 1 afternoon',
    subtitle: 'Estimator visits 3 adjacent homes back-to-back, completely eliminating travel time.',
    channel: 'A2P Carrier SMS & Scheduling',
    channelIcon: '⚡',
    dialogue: [
      {
        sender: 'platform',
        senderName: 'Speed-to-Lead AI (12s)',
        text: '“Hi Dave! We received your estimate request for Maple Ave. Would Thursday at 1:00 PM or 2:15 PM work better for our estimator to take a quick look?”',
        time: '6:49 PM',
      },
      {
        sender: 'estimator',
        senderName: 'Contractor Dispatch Calendar',
        text: '📅 3 Estimates Batched on Maple Ave: 1:00 PM, 2:15 PM, 3:30 PM',
        subtext: 'Windshield detour: 0.0 miles. Walking distance between all 3 visits.',
        time: '7:05 PM',
      },
    ],
    takeaway: 'Estimators double their closed contracts per day by cutting out windshield traffic.',
    metric: 'Detour Miles: 0.0 Mi',
  },
];

export default function HaloJourneySequence() {
  const [activeStepId, setActiveStepId] = useState<number>(1);

  const currentStep = JOURNEY_STEPS.find((s) => s.id === activeStepId) || JOURNEY_STEPS[0];

  return (
    <section className="section-block" aria-labelledby="journey-sequence-title" style={{ margin: '56px 0' }}>
      <div style={{ textAlign: 'center', maxWidth: '740px', margin: '0 auto 2rem' }}>
        <p className="eyebrow" style={{ color: 'var(--accent, #f97316)', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          ✦ Turn-by-Turn Anatomy
        </p>
        <h2 id="journey-sequence-title" style={{ fontSize: '2rem', fontWeight: 800, margin: '0.35rem 0 0.75rem', letterSpacing: '-0.02em' }}>
          From job wrap to 3 batched neighbor appointments.
        </h2>
        <p style={{ color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.6, fontSize: '0.98rem' }}>
          Step through the 5 autonomous stages of a Neighborhood Halo campaign to see exactly how private job records transform into route-dense neighbor contracts.
        </p>
      </div>

      {/* Step Navigation Pill Bar */}
      <div className={styles.journeyPillBar} role="tablist" aria-label="Halo journey steps">
        {JOURNEY_STEPS.map((s) => {
          const isActive = s.id === activeStepId;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveStepId(s.id)}
              className={`${styles.journeyPillBtn} ${isActive ? styles.journeyPillBtnActive : ''}`}
            >
              <span className={styles.journeyPillNum}>0{s.id}</span>
              <span className={styles.journeyPillTitle}>{s.tag.split('·')[1]?.trim() || s.tag}</span>
            </button>
          );
        })}
      </div>

      {/* Active Stage Card */}
      <div className={styles.journeyCard}>
        <div className={styles.journeyCardHeader}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span className={styles.journeyCardBadge}>
                {currentStep.tag}
              </span>
              <span className={styles.journeyChannelBadge}>
                {currentStep.channelIcon} {currentStep.channel}
              </span>
            </div>
            <h3 className={styles.journeyCardTitle}>{currentStep.title}</h3>
            <p className={styles.journeyCardSubtitle}>{currentStep.subtitle}</p>
          </div>

          <div className={styles.journeyMetricBox}>
            <span className={styles.journeyMetricLabel}>KEY PERFORMANCE METRIC</span>
            <strong className={styles.journeyMetricVal}>{currentStep.metric}</strong>
          </div>
        </div>

        {/* Dialogue Feed */}
        <div className={styles.journeyDialogueFeed}>
          {currentStep.dialogue.map((d, idx) => (
            <div
              key={idx}
              className={`${styles.dialogueBubble} ${
                d.sender === 'platform' ? styles.dialoguePlatform : d.sender === 'crew' ? styles.dialogueCrew : styles.dialogueNeighbor
              }`}
            >
              <div className={styles.dialogueHeader}>
                <strong>{d.senderName}</strong>
                <span>{d.time}</span>
              </div>
              <p className={styles.dialogueText}>{d.text}</p>
              {d.subtext && <span className={styles.dialogueSubtext}>{d.subtext}</span>}
            </div>
          ))}
        </div>

        {/* Key Takeaway Footer */}
        <div className={styles.journeyCardFooter}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.2rem' }}>💡</span>
            <div>
              <strong style={{ fontSize: '0.82rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                Operational Payoff
              </strong>
              <span style={{ fontSize: '0.92rem', color: '#f8fafc', fontWeight: 600 }}>
                {currentStep.takeaway}
              </span>
            </div>
          </div>

          <div className={styles.journeyNavButtons}>
            <button
              type="button"
              disabled={activeStepId === 1}
              onClick={() => setActiveStepId((prev) => Math.max(1, prev - 1))}
              className={styles.journeyNavBtn}
              aria-label="Previous step"
            >
              &larr; Prev
            </button>
            <button
              type="button"
              disabled={activeStepId === JOURNEY_STEPS.length}
              onClick={() => setActiveStepId((prev) => Math.min(JOURNEY_STEPS.length, prev + 1))}
              className={`${styles.journeyNavBtn} ${styles.journeyNavBtnPrimary}`}
              aria-label="Next step"
            >
              Next Step &rarr;
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import styles from './features-theme.module.css';

interface PulseEvent {
  id: string;
  trade: string;
  icon: string;
  location: string;
  trigger: string;
  outcome: string;
  value: string;
  timeAgo: string;
  featureHref: string;
}

const PULSE_EVENTS: PulseEvent[] = [
  {
    id: 'evt-1',
    trade: 'Roofing',
    icon: '🏠',
    location: 'Austin, TX',
    trigger: 'Homeowner uploaded 3 photos for instant estimate',
    outcome: 'Ballpark range ($9,400–$13,200) calculated & scope logged',
    value: '$11,200 Quote',
    timeAgo: 'Just now',
    featureHref: '/features/website-builder',
  },
  {
    id: 'evt-2',
    trade: 'Electrical',
    icon: '⚡',
    location: 'Royal Oak, MI',
    trigger: 'AI Copilot scanned panel photo & extracted 200A specs',
    outcome: '1-Click proposal approved & deposit collected',
    value: '$3,850 Paid',
    timeAgo: '2m ago',
    featureHref: '/features/ai-vision',
  },
  {
    id: 'evt-3',
    trade: 'HVAC',
    icon: '❄️',
    location: 'Denver, CO',
    trigger: '24/7 AI Voice Receptionist answered hotline in 2 rings',
    outcome: 'Condenser issue diagnosed & tech dispatched',
    value: 'Dispatched in 45s',
    timeAgo: '5m ago',
    featureHref: '/features/ai-intake',
  },
  {
    id: 'evt-4',
    trade: 'Plumbing',
    icon: '🚰',
    location: 'Tampa, FL',
    trigger: '1-Click SMS estimate delivered to homeowner phone',
    outcome: '$2,500 Deposit paid via Apple Pay & crew booked',
    value: '$2,500 Deposit',
    timeAgo: '7m ago',
    featureHref: '/features/quotes',
  },
  {
    id: 'evt-5',
    trade: 'Landscaping',
    icon: '📍',
    location: 'Charlotte, NC',
    trigger: 'Route engine matched nearby neighbor within 1.2 miles',
    outcome: 'Quick-Stop slot booked (+0.6 mi detour) with 0 added drive time',
    value: '+$185 Quick-Stop',
    timeAgo: '10m ago',
    featureHref: '/features/quick-stops',
  },
];

export default function LiveFieldPulse() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % PULSE_EVENTS.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [isPaused]);

  const current = PULSE_EVENTS[activeIndex];

  return (
    <aside
      className={styles.pulseContainer}
      aria-label="Real-time contractor field automations"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className={styles.pulseInner}>
        <div className={styles.pulseStatusBadge}>
          <span className={styles.pulseLiveDot} aria-hidden="true" />
          <span className={styles.pulseStatusText}>✦ REAL-TIME FIELD AUTOMATIONS</span>
          <span className={styles.pulseStatusSub}>Live Action Stream</span>
        </div>

        <div className={styles.pulseEventWrapper}>
          <a
            href={current.featureHref}
            className={styles.pulseEventCard}
            key={current.id}
            title="Click to explore related feature"
          >
            <div className={styles.pulseEventIconWrap}>
              <span className={styles.pulseEventIcon} aria-hidden="true">{current.icon}</span>
            </div>
            <div className={styles.pulseEventDetails}>
              <div className={styles.pulseEventMeta}>
                <span className={styles.pulseEventLocation}>📍 {current.location}</span>
                <span className={styles.pulseEventDot} aria-hidden="true">·</span>
                <span className={styles.pulseEventTrade}>{current.trade}</span>
                <span className={styles.pulseEventDot} aria-hidden="true">·</span>
                <span className={styles.pulseEventTime}>{current.timeAgo}</span>
              </div>
              <p className={styles.pulseEventAction}>
                <span>{current.trigger}</span>
                <span className={styles.pulseArrowDivider} aria-hidden="true"> ──► </span>
                <strong className={styles.pulseEventHighlight}>{current.outcome}</strong>
              </p>
            </div>
            <div className={styles.pulseEventValueBadge}>
              <span>{current.value}</span>
            </div>
          </a>
        </div>

        <div className={styles.pulseControls} aria-label="Activity carousel controls">
          <button
            type="button"
            className={styles.pulsePlayPauseBtn}
            onClick={() => setIsPaused((prev) => !prev)}
            aria-label={isPaused ? 'Resume live field pulse carousel' : 'Pause live field pulse carousel'}
            title={isPaused ? 'Resume updates' : 'Pause updates'}
          >
            <span aria-hidden="true">{isPaused ? '▶' : '⏸'}</span>
          </button>
          <div className={styles.pulseDotsList} role="tablist" aria-label="Live field updates">
            {PULSE_EVENTS.map((evt, idx) => (
              <button
                key={evt.id}
                type="button"
                role="tab"
                aria-selected={idx === activeIndex}
                aria-current={idx === activeIndex ? 'true' : undefined}
                className={`${styles.pulseDotBtn} ${idx === activeIndex ? styles.pulseDotActive : ''}`}
                onClick={() => setActiveIndex(idx)}
                aria-label={`View update ${idx + 1} of ${PULSE_EVENTS.length}: ${evt.trade} in ${evt.location}`}
              >
                <span className={styles.pulseDotInner} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

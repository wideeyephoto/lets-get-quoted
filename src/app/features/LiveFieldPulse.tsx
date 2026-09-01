'use client';

import React, { useState, useEffect } from 'react';
import styles from './features-theme.module.css';

interface PulseEvent {
  id: string;
  trade: string;
  icon: string;
  location: string;
  action: string;
  highlight: string;
  value: string;
  timeAgo: string;
  featureHref: string;
}

const PULSE_EVENTS: PulseEvent[] = [
  {
    id: 'evt-1',
    trade: 'Electrical',
    icon: '⚡',
    location: 'Royal Oak, MI',
    action: 'AI Copilot scanned 4 panel photos via OCR → Drafted 200A upgrade quote',
    highlight: 'Quote e-signed & deposit paid',
    value: '$3,850',
    timeAgo: 'Just now',
    featureHref: '#smart-intake',
  },
  {
    id: 'evt-2',
    trade: 'HVAC',
    icon: '❄️',
    location: 'Austin, TX',
    action: '24/7 AI Voice Receptionist answered emergency hotline',
    highlight: 'Condenser issue qualified & routed',
    value: '$1,420',
    timeAgo: '3m ago',
    featureHref: '#breakthroughs',
  },
  {
    id: 'evt-3',
    trade: 'Remodeling',
    icon: '🔨',
    location: 'Denver, CO',
    action: 'AI Copilot sent morning dispatch with tool checklist & gate code',
    highlight: '4-man crew on site',
    value: '3 jobs active',
    timeAgo: '5m ago',
    featureHref: '#scheduling',
  },
  {
    id: 'evt-4',
    trade: 'Plumbing',
    icon: '🚰',
    location: 'Tampa, FL',
    action: 'AI Copilot matched Quick Stop on return route (+0.6 mi detour)',
    highlight: 'Same-day visit fee collected',
    value: '+$165',
    timeAgo: '7m ago',
    featureHref: '#quick-stops',
  },
  {
    id: 'evt-5',
    trade: 'Roofing',
    icon: '🏠',
    location: 'Phoenix, AZ',
    action: 'AI Copilot logged texted change order from ladder → Quote upgraded',
    highlight: 'Customer selected Premium Shingles',
    value: '$11,200',
    timeAgo: '10m ago',
    featureHref: '#quotes',
  },
  {
    id: 'evt-6',
    trade: 'Landscaping',
    icon: '🌱',
    location: 'Charlotte, NC',
    action: 'AI Copilot generated 1-click trade website with local SEO & instant estimate',
    highlight: 'Published to custom domain',
    value: 'Live in 2 min',
    timeAgo: '12m ago',
    featureHref: '#website-builder',
  },
];

export default function LiveFieldPulse() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % PULSE_EVENTS.length);
    }, 4200);
    return () => clearInterval(interval);
  }, [isPaused]);

  const current = PULSE_EVENTS[activeIndex];

  return (
    <aside
      className={styles.pulseContainer}
      aria-label="Live platform activity and simulated field updates"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className={styles.pulseInner}>
        <div className={styles.pulseStatusBadge}>
          <span className={styles.pulseLiveDot} aria-hidden="true" />
          <span className={styles.pulseStatusText}>⚡ LIVE SPARKY FIELD PULSE</span>
          <span className={styles.pulseStatusSub}>Simulated Real-Time Activity</span>
        </div>

        <div className={styles.pulseEventWrapper}>
          <a
            href={current.featureHref}
            className={styles.pulseEventCard}
            key={current.id}
            title="Click to view related feature"
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
                {current.action} &mdash; <strong className={styles.pulseEventHighlight}>{current.highlight}</strong>
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

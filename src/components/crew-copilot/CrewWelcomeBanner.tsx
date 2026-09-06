'use client';

import React from 'react';
import styles from './crew-copilot.module.css';
import { getCompanion, type CompanionId } from '@/lib/ai-assistant/companions';

export function openCrewCopilot(prompt?: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('open-crew-copilot', { detail: { prompt } }));
  }
}

export function FieldHeaderCopilotButton() {
  return (
    <button
      type="button"
      className={styles.headerCopilotBtn}
      onClick={() => openCrewCopilot()}
      title="Open AI Field Copilot"
      aria-label="Open AI Field Copilot"
    >
      <span aria-hidden="true">✨</span>
      <span>Copilot</span>
    </button>
  );
}


interface CrewWelcomeBannerProps {
  crewName: string;
  businessName: string;
  todayStopsCount?: number;
  companionId?: CompanionId;
  activeJobId?: string;
  activeJobRef?: string;
}

export default function CrewWelcomeBanner({
  crewName,
  businessName,
  todayStopsCount = 0,
  companionId = 'sparky',
}: CrewWelcomeBannerProps) {
  const companion = getCompanion(companionId);
  const firstName = crewName.trim().split(/\s+/)[0] || 'there';

  const stopsText =
    todayStopsCount === 0
      ? 'No stops on your route yet today.'
      : todayStopsCount === 1
      ? '1 stop on your route today.'
      : `${todayStopsCount} stops on your route today.`;

  return (
    <div className={styles.welcomeBanner} role="region" aria-label="AI Field Copilot Greeting">
      <div className={styles.welcomeHeader}>
        <div className={styles.avatarContainer}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={companion.avatarSrc}
            alt={companion.name}
            className={styles.companionAvatar}
            width={48}
            height={48}
          />
          <span className={styles.onlineBadge} title="Copilot Online" aria-label="Online" />
        </div>
        <div className={styles.welcomeMeta}>
          <div className={styles.welcomeTitleRow}>
            <h2 className={styles.welcomeTitle}>Hey {firstName}! {companion.name} is on duty</h2>
            <span className={styles.copilotBadge}>AI Copilot</span>
          </div>
          <p className={styles.welcomeSubtitle}>
            {stopsText} Tap a quick action below or ask me anything.
          </p>
        </div>
      </div>

      <div className={styles.chipsContainer}>
        <button
          type="button"
          className={`${styles.chipBtn} ${styles.chipPrimary}`}
          onClick={() => openCrewCopilot("What is my next job and address?")}
        >
          <span>📍</span> Next Stop &amp; Directions
        </button>
        <button
          type="button"
          className={styles.chipBtn}
          onClick={() => openCrewCopilot("Do we have gate or lockbox codes for my jobs today?")}
        >
          <span>🔑</span> Gate &amp; Lockbox Codes
        </button>
        <button
          type="button"
          className={styles.chipBtn}
          onClick={() => openCrewCopilot("Am I currently clocked in, and what are my hours this period?")}
        >
          <span>⏱️</span> My Hours &amp; Clock Status
        </button>
        <button
          type="button"
          className={styles.chipBtn}
          onClick={() => openCrewCopilot()}
        >
          <span>💬</span> Chat with {companion.name}...
        </button>
      </div>
    </div>
  );
}

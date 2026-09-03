'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { LeadViewItem } from '@/app/dashboard/leads/LeadsWorkspace';
import type { MapPin } from '@/components/pin-map';
import {
  clearAdvisorState,
  generateLeadAdvisorRecommendation,
  getAdvisorState,
  setAdvisorDismissed,
  setAdvisorSnoozed,
  type AdvisorState,
} from '@/lib/ai-lead-advisor';
import styles from './AiLeadAdvisor.module.css';

export interface AiLeadAdvisorProps {
  lead: LeadViewItem;
  mapPins?: MapPin[];
  base?: string;
  onOpenTextModal?: (prefilledMessage: string) => void;
}

export default function AiLeadAdvisor({ lead, mapPins = [], base = '/dashboard', onOpenTextModal }: AiLeadAdvisorProps) {
  const [advisorState, setAdvisorState] = useState<AdvisorState>('visible');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const initial = getAdvisorState(lead.id);
    setAdvisorState(initial.state);
  }, [lead.id]);

  const rec = useMemo(
    () => generateLeadAdvisorRecommendation(lead, mapPins, base),
    [lead, mapPins, base],
  );

  const handleDismiss = () => {
    setAdvisorDismissed(lead.id);
    setAdvisorState('dismissed');
  };

  const handleSnooze = () => {
    setAdvisorSnoozed(lead.id, 24);
    setAdvisorState('snoozed');
  };

  const handleRestore = () => {
    clearAdvisorState(lead.id);
    setAdvisorState('visible');
  };

  if (!mounted) return null;

  if (advisorState === 'dismissed') {
    return (
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <button
          type="button"
          className={styles.restorePill}
          onClick={handleRestore}
          title="Click to restore AI Advisor recommendation"
        >
          ⚡ AI Advisor (dismissed) · <u>Restore</u>
        </button>
      </div>
    );
  }

  if (advisorState === 'snoozed') {
    return (
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <button
          type="button"
          className={styles.restorePill}
          onClick={handleRestore}
          title="Click to un-snooze and view recommendations"
        >
          ⚡ AI Advisor (snoozed 24h) · <u>Restore</u>
        </button>
      </div>
    );
  }

  return (
    <section className={styles.advisorCard} aria-label="AI Lead Advisor Recommendation">
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={styles.advisorBadge}>⚡ AI Advisor</span>
          <h4 className={styles.headline}>{rec.headline}</h4>
        </div>
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.controlBtn}
            onClick={handleSnooze}
            title="Snooze recommendations for 24 hours"
          >
            ⏰ Snooze 24h
          </button>
          <button
            type="button"
            className={styles.dismissBtn}
            onClick={handleDismiss}
            aria-label="Dismiss recommendation"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>

      <p className={styles.summary}>{rec.summary}</p>

      {rec.metrics.length > 0 && (
        <div className={styles.metricsRow}>
          {rec.metrics.map((m, idx) => (
            <span key={idx} className={styles.metricChip} data-tone={m.tone}>
              <span>{m.icon}</span>
              <span>{m.label}</span>
            </span>
          ))}
        </div>
      )}

      <div className={styles.actionFooter}>
        {rec.action.type === 'sms' && onOpenTextModal ? (
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => onOpenTextModal(rec.action.suggestedBody || '')}
          >
            {rec.action.label} →
          </button>
        ) : rec.action.href.startsWith('http') || rec.action.href.startsWith('/') ? (
          <Link href={rec.action.href} className={styles.actionBtn}>
            {rec.action.label} →
          </Link>
        ) : (
          <a href={rec.action.href} className={styles.actionBtn}>
            {rec.action.label} →
          </a>
        )}

        {rec.action.suggestedBody && (
          <span className={styles.previewQuote} title={rec.action.suggestedBody}>
            &ldquo;{rec.action.suggestedBody}&rdquo;
          </span>
        )}
      </div>
    </section>
  );
}

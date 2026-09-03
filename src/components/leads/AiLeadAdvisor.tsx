'use client';

import { useEffect, useMemo, useState, useId } from 'react';
import type { LeadViewItem } from '@/app/dashboard/leads/LeadsWorkspace';
import type { MapPin } from '@/components/pin-map';
import type { LogisticalPreset, StageFilter } from '@/lib/lead-queue';
import {
  clearOverallAdvisorState,
  generateOverallLeadsAdvisorRecommendation,
  getOverallAdvisorState,
  setOverallAdvisorDismissed,
  setOverallAdvisorSnoozed,
  type AdvisorState,
} from '@/lib/ai-lead-advisor';
import styles from './AiLeadAdvisor.module.css';

export interface AiLeadAdvisorProps {
  leads: LeadViewItem[];
  mapPins?: MapPin[];
  base?: string;
  onFilterStage?: (stage: StageFilter) => void;
  onFilterLogistical?: (preset: LogisticalPreset) => void;
  onSwitchPane?: (pane: 'leads' | 'map') => void;
}

export default function AiLeadAdvisor({
  leads,
  mapPins = [],
  base = '/dashboard',
  onFilterStage,
  onFilterLogistical,
  onSwitchPane,
}: AiLeadAdvisorProps) {
  const panelId = useId();
  const [advisorState, setAdvisorState] = useState<AdvisorState>('visible');
  const [isExpanded, setIsExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const initial = getOverallAdvisorState();
    setAdvisorState(initial.state);
  }, []);

  const rec = useMemo(
    () => generateOverallLeadsAdvisorRecommendation(leads, mapPins, base),
    [leads, mapPins, base],
  );

  const handleDismiss = () => {
    setOverallAdvisorDismissed();
    setAdvisorState('dismissed');
  };

  const handleSnooze = () => {
    setOverallAdvisorSnoozed(24);
    setAdvisorState('snoozed');
  };

  const handleRestore = () => {
    clearOverallAdvisorState();
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
          title="Click to restore AI Pipeline Advisor"
        >
          ⚡ AI Pipeline Advisor · dismissed · <u>Restore</u>
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
          ⚡ AI Pipeline Advisor · snoozed 24h · <u>Restore</u>
        </button>
      </div>
    );
  }

  const executeAction = () => {
    if (rec.action?.targetLogisticalPreset && onFilterLogistical) {
      onFilterLogistical(rec.action.targetLogisticalPreset);
    }
    if (rec.action?.targetStage && onFilterStage) {
      onFilterStage(rec.action.targetStage);
    }
    if (rec.action?.targetPane && onSwitchPane) {
      onSwitchPane(rec.action.targetPane);
    }
  };

  // 1-Line Compact View (Default)
  if (!isExpanded) {
    return (
      <section className={styles.advisorCompact} aria-label="AI Pipeline Advisor Summary">
        <div className={styles.compactLeft}>
          <span className={styles.advisorBadge}>⚡ AI Pipeline Advisor</span>
          <h4 className={styles.compactHeadline} title={rec.headline}>
            {rec.headline}
          </h4>
        </div>
        <div className={styles.compactRight}>
          {rec.action && (
            <button
              type="button"
              className={styles.compactActionBtn}
              onClick={executeAction}
            >
              {rec.action.label} →
            </button>
          )}
          <button
            type="button"
            className={styles.expandBtn}
            onClick={() => setIsExpanded(true)}
            title="Expand full pipeline details and metrics"
            aria-expanded="false"
            aria-controls={panelId}
          >
            Expand ▾
          </button>
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
      </section>
    );
  }

  // Full Expanded View
  return (
    <section id={panelId} className={styles.advisorCard} aria-label="AI Pipeline Advisor Details">
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={styles.advisorBadge}>⚡ AI Pipeline Advisor</span>
          <h4 className={styles.headline}>{rec.headline}</h4>
        </div>
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.expandBtn}
            onClick={() => setIsExpanded(false)}
            title="Collapse to compact 1-line view"
            aria-expanded="true"
            aria-controls={panelId}
          >
            Collapse ▴
          </button>
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

      {rec.action && (
        <div className={styles.actionFooter}>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={executeAction}
          >
            {rec.action.label} →
          </button>
        </div>
      )}
    </section>
  );
}

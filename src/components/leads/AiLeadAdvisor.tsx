'use client';

import { useEffect, useMemo, useState, useId } from 'react';
import type { LeadViewItem } from '@/app/dashboard/leads/LeadsWorkspace';
import type { MapPin } from '@/components/pin-map';
import type { LogisticalPreset, StageFilter } from '@/lib/lead-queue';
import { useAssistant } from '@/components/ai-assistant/AssistantProvider';
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

  let assistant: ReturnType<typeof useAssistant> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    assistant = useAssistant();
  } catch {
    // Fallback if rendered outside AssistantProvider
  }

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

  const handleOpenInCopilot = () => {
    if (assistant?.openAssistant) {
      assistant.openAssistant(
        `Brief me on our leads pipeline and route logistics today: ${rec.headline}. What urgent leads need follow-up, which ones are en-route or near active jobsites, and what are our top opportunities?`
      );
    } else {
      setIsExpanded((prev) => !prev);
    }
  };

  // 1-Line Compact View (Default)
  if (!isExpanded) {
    return (
      <section className={styles.advisorCompact} aria-label="AI Pipeline Advisor Summary">
        <div
          className={styles.compactLeft}
          onClick={handleOpenInCopilot}
          role="button"
          tabIndex={0}
          title="Click to open full leads intelligence briefing in AI Copilot"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleOpenInCopilot();
            }
          }}
        >
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
            className={styles.copilotBtn}
            onClick={handleOpenInCopilot}
            title="Open pipeline intelligence and suggestions in AI Copilot"
            aria-label="Open in AI Copilot"
          >
            <span>💬</span>
            <span>Ask Copilot</span>
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
            className={styles.copilotBtn}
            onClick={handleOpenInCopilot}
            title="Open interactive assistance in AI Copilot"
          >
            💬 Ask Copilot
          </button>
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

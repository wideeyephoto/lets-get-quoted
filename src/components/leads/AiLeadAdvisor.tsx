'use client';

import { useEffect, useMemo, useState, useId, useRef } from 'react';
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
  align?: 'left' | 'right';
}

export default function AiLeadAdvisor({
  leads,
  mapPins = [],
  base = '/dashboard',
  onFilterStage,
  onFilterLogistical,
  onSwitchPane,
  align = 'left',
}: AiLeadAdvisorProps) {
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [advisorState, setAdvisorState] = useState<AdvisorState>('visible');
  const [isOpen, setIsOpen] = useState(false);
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

  // Close popover when clicking outside or pressing Escape
  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(e: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

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
    setIsOpen(false);
  };

  const handleOpenInCopilot = () => {
    setIsOpen(false);
    if (assistant?.openAssistant) {
      assistant.openAssistant(
        `Brief me on our leads pipeline and route logistics today: ${rec.headline}. What urgent leads need follow-up, which ones are en-route or near active jobsites, and what are our top opportunities?`
      );
    }
  };

  if (!mounted) return null;

  // Compute status badge for the compact button
  let badgeNode: React.ReactNode = null;
  if (advisorState === 'dismissed') {
    badgeNode = <span className={styles.badgeMuted}>Dismissed</span>;
  } else if (advisorState === 'snoozed') {
    badgeNode = <span className={styles.badgeMuted}>Snoozed</span>;
  } else if (rec.stats.urgentCount > 0) {
    badgeNode = <span className={styles.badgeUrgent}>{rec.stats.urgentCount} urgent</span>;
  } else if (rec.stats.clusteredLeadCount > 0) {
    badgeNode = <span className={styles.badgeInfo}>{rec.stats.clusteredLeadCount} near jobs</span>;
  } else if (rec.stats.quotedCount > 0) {
    badgeNode = <span className={styles.badgeInfo}>{rec.stats.quotedCount} quotes</span>;
  } else if (rec.type === 'pipeline_healthy') {
    badgeNode = <span className={styles.badgeGood}>Healthy</span>;
  }

  const isInactive = advisorState !== 'visible';

  return (
    <div ref={containerRef} className={styles.advisorContainer}>
      <button
        type="button"
        className={`${styles.compactAiBtn} ${isInactive ? styles.inactiveBtn : ''} ${isOpen ? styles.btnActive : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-haspopup="dialog"
        title={isInactive ? `AI Pipeline Advisor (${advisorState}) — Click to view` : `${rec.headline} — Click for AI briefing`}
      >
        <span className={styles.btnIcon} aria-hidden="true">⚡</span>
        <span className={styles.btnLabel}>AI Advisor</span>
        {badgeNode}
        <span className={`${styles.caret} ${isOpen ? styles.caretOpen : ''}`} aria-hidden="true">▾</span>
      </button>

      {isOpen && (
        <section
          id={panelId}
          className={`${styles.popoverCard}${align === 'right' ? ` ${styles.popoverCardRight}` : ''}`}
          aria-label="AI Pipeline Advisor Details"
          role="dialog"
        >
          <div className={styles.header}>
            <div className={styles.titleGroup}>
              <span className={styles.advisorBadge}>⚡ AI Pipeline Advisor</span>
              {isInactive && (
                <span className={styles.stateTag}>
                  {advisorState === 'snoozed' ? 'Snoozed 24h' : 'Dismissed'}
                </span>
              )}
            </div>
            <div className={styles.controls}>
              {isInactive ? (
                <button
                  type="button"
                  className={styles.restoreBtn}
                  onClick={handleRestore}
                  title="Restore active AI Pipeline Advisor recommendations"
                >
                  Restore
                </button>
              ) : (
                <>
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
                </>
              )}
            </div>
          </div>

          <h4 className={styles.headline}>{rec.headline}</h4>
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
            {rec.action && !isInactive ? (
              <button
                type="button"
                className={styles.actionBtn}
                onClick={executeAction}
              >
                {rec.action.label} →
              </button>
            ) : <div />}

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
          </div>
        </section>
      )}
    </div>
  );
}

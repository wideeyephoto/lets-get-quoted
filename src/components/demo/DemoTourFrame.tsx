'use client';

import type { ReactNode } from 'react';
import type { DemoTourState } from '@/lib/demo-tour-state';
import type { TourStepMetadata } from '@/lib/demo-tour-data';
import { useDemoTourState } from '@/components/demo/DemoTourStateProvider';
import DemoTourBar from '@/components/demo/DemoTourBar';
import styles from './demo-tour-frame.module.css';

type DemoTourFrameProps = {
  currentStep: TourStepMetadata;
  children: ReactNode;
};

const ACTIVITY_ITEMS = [
  { label: 'Request received', detail: 'Taylor Brooks · Royal Oak' },
  { label: 'AI qualified', detail: 'Scope, budget, timing' },
  { label: 'Lead scored 94', detail: 'HOT · 2.1 mi route fit' },
  { label: 'Quote sent', detail: 'Itemized + optional upgrade' },
  { label: 'Deposit & booking', detail: 'Thursday · 8–10 AM' },
] as const;

function isActivityComplete(index: number, step: number, state: DemoTourState) {
  if (index === 0) return step > 1;
  if (index === 1) return state.intakeAnalyzed || step > 2;
  if (index === 2) return step > 3;
  if (index === 3) return state.quoteSent || step > 4;
  return state.depositSimulated;
}

export default function DemoTourFrame({ currentStep, children }: DemoTourFrameProps) {
  const { state } = useDemoTourState();
  const toneClass =
    currentStep.perspective === 'homeowner'
      ? styles.homeowner
      : currentStep.perspective === 'contractor'
        ? styles.contractor
        : styles.summary;

  return (
    <div className={`${styles.frame} ${toneClass}`}>
      <DemoTourBar currentStep={currentStep} />

      <section className={styles.intro} aria-labelledby={`tour-step-${currentStep.step}-title`}>
        <div className={styles.introGlow} aria-hidden="true" />
        <div className={styles.introInner}>
          <div className={styles.eyebrowRow}>
            <span className={styles.phasePill}>Phase {currentStep.step} · {currentStep.phase}</span>
            <span className={styles.rolePill}>{currentStep.perspectiveLabel}</span>
          </div>

          {currentStep.perspectiveShift ? (
            <p className={styles.perspectiveShift}>
              <span aria-hidden="true">↻</span> {currentStep.perspectiveShift}
            </p>
          ) : null}

          <div className={styles.introGrid}>
            <div>
              <h1 id={`tour-step-${currentStep.step}-title`} className={styles.headline}>
                {currentStep.outcomeHeadline}
              </h1>
              <p className={styles.summaryText}>{currentStep.summary}</p>
            </div>

            <aside className={styles.nextCard} aria-label="What comes next">
              <span className={styles.nextLabel}>Up next</span>
              <strong>{currentStep.nextPreview}</strong>
              <span className={styles.nextPhase}>
                {currentStep.nextHref ? `${currentStep.nextActionLabel} →` : 'Choose your next move →'}
              </span>
            </aside>
          </div>

          <div className={styles.flowStrip} aria-label={`${currentStep.phase} transformation`}>
            {currentStep.flow.map((item, index) => (
              <div className={styles.flowItem} key={item}>
                <span className={styles.flowNumber}>{index + 1}</span>
                <span>{item}</span>
                {index < currentStep.flow.length - 1 ? <span className={styles.flowArrow} aria-hidden="true">→</span> : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.activitySection} aria-label="Live job activity">
        <div className={styles.activityHeader}>
          <div>
            <span className={styles.liveDot} aria-hidden="true" />
            <strong>Live job activity</strong>
          </div>
          <span>{currentStep.phase} in progress</span>
        </div>
        <div className={styles.activityRail}>
          {ACTIVITY_ITEMS.map((item, index) => {
            const complete = isActivityComplete(index, currentStep.step, state);
            const active = !complete && index === Math.min(currentStep.step - 1, ACTIVITY_ITEMS.length - 1);
            return (
              <div
                className={`${styles.activityItem} ${complete ? styles.activityComplete : ''} ${active ? styles.activityActive : ''}`}
                key={item.label}
              >
                <span className={styles.activityIcon} aria-hidden="true">{complete ? '✓' : index + 1}</span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <div className={styles.experience}>{children}</div>
    </div>
  );
}

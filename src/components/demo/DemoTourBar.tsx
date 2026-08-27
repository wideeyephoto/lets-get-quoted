'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { TOUR_STEPS, type TourStepMetadata } from '@/lib/demo-tour-data';
import { useDemoTourState } from '@/components/demo/DemoTourStateProvider';
import { trackDemoEvent } from '@/lib/demo-analytics';
import styles from './demo-tour-bar.module.css';

export default function DemoTourBar({ currentStep }: { currentStep: TourStepMetadata }) {
  const { state } = useDemoTourState();

  useEffect(() => {
    trackDemoEvent('step_viewed', {
      step: currentStep.step,
      stepSlug: currentStep.slug,
      perspective: currentStep.perspective,
    });
  }, [currentStep]);

  const isStepExperienced = (() => {
    switch (currentStep.step) {
      case 2:
        return state.intakeAnalyzed;
      case 4:
        return state.quoteSent;
      case 5:
        return state.depositSimulated || state.signed;
      default:
        return true;
    }
  })();

  const handleNextClick = () => {
    trackDemoEvent(isStepExperienced ? 'step_completed' : 'step_skipped', {
      step: currentStep.step,
      stepSlug: currentStep.slug,
      perspective: currentStep.perspective,
    });
  };

  const nextStep = currentStep.nextHref ? TOUR_STEPS[currentStep.step] : null;

  return (
    <nav className={styles.bar} aria-label="Demo evaluation tour navigation">
      <div className={styles.utilityRow}>
        <Link className={styles.brand} href="/demo" aria-label="Let’s Get Quoted demo home">
          <span className={styles.brandMark}>LGQ</span>
          <span>
            <strong>Live job lifecycle</strong>
            <small>One customer · one connected story</small>
          </span>
        </Link>

        <span className={styles.simulationDisclosureDesktop} role="status">
          Interactive sample · No real texts, signatures, bookings, or payments
        </span>
        <span className={styles.simulationDisclosureMobile} role="status">
          Interactive sample
        </span>

        <div className={styles.actionsGroup}>
          {currentStep.prevHref ? (
            <Link href={currentStep.prevHref} className={styles.prevBtn} aria-label="Previous tour step">
              ← Prev
            </Link>
          ) : null}

          {currentStep.nextHref ? (
            <Link
              href={currentStep.nextHref}
              onClick={handleNextClick}
              className={`${isStepExperienced ? styles.nextBtnPrimary : styles.nextBtnSecondary} ${
                currentStep.step === 4 ? styles.hideOnMobileDock : ''
              }`}
              aria-label={isStepExperienced ? currentStep.nextActionLabel : `Preview next: ${nextStep?.phase}`}
            >
              {isStepExperienced ? `${currentStep.nextActionLabel} →` : `Preview next: ${nextStep?.phase} →`}
            </Link>
          ) : null}

          <Link
            href="/demo"
            className={styles.exitBtn}
            onClick={() => trackDemoEvent('explore_freely', { source: 'tour_bar_exit' })}
          >
            Explore freely
          </Link>
        </div>
      </div>

      <div className={styles.phaseRail} aria-label="Tour phases">
        {TOUR_STEPS.map((step) => {
          const isActive = step.step === currentStep.step;
          const isComplete = step.step < currentStep.step;
          return (
            <Link
              key={step.slug}
              href={step.href}
              className={`${styles.phaseLink} ${isActive ? styles.phaseActive : ''} ${isComplete ? styles.phaseComplete : ''}`}
              aria-label={`Step ${step.step}: ${step.phase} — ${step.shortTitle}`}
              aria-current={isActive ? 'step' : undefined}
            >
              <span className={styles.phaseNumber}>{isComplete ? '✓' : step.step}</span>
              <span>
                <strong>{step.phase}</strong>
                <small>{step.shortTitle}</small>
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

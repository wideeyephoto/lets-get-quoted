'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { TOUR_STEPS, TourStepMetadata } from '@/lib/demo-tour-data';
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

  // Determine if user has experienced the simulated core action of this step
  const isStepExperienced = (() => {
    switch (currentStep.step) {
      case 1:
        return true;
      case 2:
        return state.intakeAnalyzed;
      case 3:
        return true;
      case 4:
        return state.quoteSent;
      case 5:
        return state.depositSimulated || state.signed;
      case 6:
        return true;
      default:
        return true;
    }
  })();

  const perspectiveClass =
    currentStep.perspective === 'homeowner'
      ? styles.perspectiveHomeowner
      : currentStep.perspective === 'contractor'
      ? styles.perspectiveContractor
      : styles.perspectiveSummary;

  const perspectiveIcon =
    currentStep.perspective === 'homeowner'
      ? '👤'
      : currentStep.perspective === 'contractor'
      ? '🛠️'
      : '✨';

  const handleNextClick = () => {
    if (isStepExperienced) {
      trackDemoEvent('step_completed', {
        step: currentStep.step,
        stepSlug: currentStep.slug,
        perspective: currentStep.perspective,
      });
    } else {
      trackDemoEvent('step_skipped', {
        step: currentStep.step,
        stepSlug: currentStep.slug,
        perspective: currentStep.perspective,
      });
    }
  };

  return (
    <nav className={styles.bar} aria-label="Demo Evaluation Tour Navigation">
      <div className={styles.inner}>
        <div className={styles.leftGroup}>
          <span className={`${styles.perspectiveBadge} ${perspectiveClass}`}>
            <span aria-hidden="true">{perspectiveIcon}</span>
            <span>{currentStep.perspectiveLabel}</span>
          </span>

          <span className={styles.simulationDisclosureDesktop} role="status">
            Sample workflow &middot; No texts, signatures, bookings, or payments are real.
          </span>
          <span className={styles.simulationDisclosureMobile} role="status">
            Demo only &middot; No real texts or payments
          </span>

          <div className={styles.stepIndicator}>
            <div className={styles.stepDots} aria-label="Tour step progression">
              {TOUR_STEPS.map((s) => {
                const isActive = s.step === currentStep.step;
                const isCompleted = s.step < currentStep.step;
                return (
                  <Link
                    key={s.slug}
                    href={s.href}
                    className={`${styles.stepDot} ${
                      isActive
                        ? styles.stepDotActive
                        : isCompleted
                        ? styles.stepDotCompleted
                        : ''
                    }`}
                    aria-label={`Step ${s.step}: ${s.shortTitle}`}
                    title={`Step ${s.step}: ${s.shortTitle}`}
                    aria-current={isActive ? 'step' : undefined}
                  >
                    <span>{s.step}</span>
                  </Link>
                );
              })}
            </div>
            <span className={styles.stepLabel}>
              <strong>Step {currentStep.step} of 6:</strong> {currentStep.title}
            </span>
          </div>
        </div>

        <div className={styles.actionsGroup}>
          {currentStep.prevHref ? (
            <Link
              href={currentStep.prevHref}
              className={styles.prevBtn}
              aria-label="Previous tour step"
            >
              &larr; Prev
            </Link>
          ) : null}

          {currentStep.nextHref ? (
            <Link
              href={currentStep.nextHref}
              onClick={handleNextClick}
              className={isStepExperienced ? styles.nextBtnPrimary : styles.nextBtnSecondary}
              aria-label={isStepExperienced ? 'Continue to next step' : 'Skip this step and proceed'}
            >
              {isStepExperienced ? 'Continue →' : 'Skip step →'}
            </Link>
          ) : null}

          <Link
            href="/demo"
            className={styles.exitBtn}
            onClick={() => trackDemoEvent('explore_freely', { source: 'tour_bar_exit' })}
            aria-label="Exit tour and explore demo dashboard"
          >
            Explore freely &rarr;
          </Link>
        </div>
      </div>
    </nav>
  );
}

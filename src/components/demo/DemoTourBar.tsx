'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { TOUR_STEPS, TourStepMetadata } from '@/lib/demo-tour-data';
import { trackDemoEvent } from '@/lib/demo-analytics';
import styles from './demo-tour-bar.module.css';

export default function DemoTourBar({ currentStep }: { currentStep: TourStepMetadata }) {
  useEffect(() => {
    trackDemoEvent('step_viewed', {
      step: currentStep.step,
      stepSlug: currentStep.slug,
      perspective: currentStep.perspective,
    });
  }, [currentStep]);

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

  return (
    <nav className={styles.bar} aria-label="Demo Evaluation Tour Navigation">
      <div className={styles.inner}>
        <div className={styles.leftGroup}>
          <span className={`${styles.perspectiveBadge} ${perspectiveClass}`}>
            <span aria-hidden="true">{perspectiveIcon}</span>
            <span>{currentStep.perspectiveLabel}</span>
          </span>

          <span className={styles.simulationDisclosure} role="status">
            Sample workflow &middot; No texts, signatures, bookings, or payments are real.
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
              &larr; Previous
            </Link>
          ) : null}

          {currentStep.nextHref ? (
            <Link
              href={currentStep.nextHref}
              className={styles.nextBtn}
              aria-label="Next tour step"
            >
              Next Step &rarr;
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

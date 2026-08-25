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

          <div className={styles.stepIndicator}>
            <div className={styles.stepDots} aria-label={`Step ${currentStep.step} of 6`}>
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
                    title={`Step ${s.step}: ${s.shortTitle}`}
                    aria-current={isActive ? 'step' : undefined}
                  >
                    {s.step}
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
            <Link href={currentStep.prevHref} className={styles.prevBtn}>
              &larr; Previous
            </Link>
          ) : null}

          {currentStep.nextHref ? (
            <Link href={currentStep.nextHref} className={styles.nextBtn}>
              Next Step &rarr;
            </Link>
          ) : null}

          <Link
            href="/demo"
            className={styles.exitBtn}
            onClick={() => trackDemoEvent('explore_freely', { source: 'tour_bar_exit' })}
          >
            Explore freely &rarr;
          </Link>
        </div>
      </div>
    </nav>
  );
}

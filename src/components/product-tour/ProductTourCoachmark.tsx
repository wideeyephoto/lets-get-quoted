'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { CoachmarkPlacement, TourStep } from '@/lib/product-tour/types';
import styles from './product-tour.module.css';

type ProductTourCoachmarkProps = {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  targetRect: DOMRect | null;
  isFallback?: boolean;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  onSkip: () => void;
};

export default function ProductTourCoachmark({
  step,
  stepIndex,
  totalSteps,
  targetRect,
  isFallback = false,
  onNext,
  onPrev,
  onClose,
  onSkip,
}: ProductTourCoachmarkProps) {
  const [mounted, setMounted] = useState(false);
  const [cardHeight, setCardHeight] = useState(240);
  const cardRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    return () => {
      if (previouslyFocusedRef.current && typeof previouslyFocusedRef.current.focus === 'function') {
        previouslyFocusedRef.current.focus({ preventScroll: true });
      }
    };
  }, []);

  // Measure card height when mounted or content changes to ensure flip math is accurate
  useEffect(() => {
    if (cardRef.current) {
      const measured = cardRef.current.offsetHeight;
      if (measured > 0 && Math.abs(measured - cardHeight) > 4) {
        setCardHeight(measured);
      }
    }
  }, [step.id, step.body, step.title, cardHeight]);

  // Trap focus inside coachmark card and listen for Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        const card = cardRef.current;
        if (!card) return;

        const focusable = card.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Set initial focus without causing browser scroll jumps
  useEffect(() => {
    const timer = setTimeout(() => {
      const card = cardRef.current;
      if (!card) return;
      const primary = card.querySelector<HTMLElement>('button.' + styles.primaryBtn);
      if (primary) {
        primary.focus({ preventScroll: true });
      } else {
        card.focus({ preventScroll: true });
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [step.id]);

  if (!mounted) return null;

  const isLastStep = stepIndex === totalSteps - 1;
  const isFirstStep = stepIndex === 0;
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  // Calculate placement style with boundary flip detection
  let cardStyle: CSSProperties = {};
  let isBottomSheet = isMobile;

  if (targetRect && !isFallback && !isMobile) {
    const margin = 12;
    const cardWidth = Math.min(380, window.innerWidth - 32);
    const placement: CoachmarkPlacement = step.placement ?? 'auto';

    const spaceBelow = window.innerHeight - targetRect.bottom - margin;
    const spaceAbove = targetRect.top - margin;
    const spaceRight = window.innerWidth - targetRect.right - margin;
    const spaceLeft = targetRect.left - margin;

    let top = 0;
    let left = 0;

    if (placement === 'right') {
      if (spaceRight >= cardWidth || spaceRight >= spaceLeft) {
        left = targetRect.right + margin;
        top = targetRect.top;
      } else {
        left = targetRect.left - cardWidth - margin;
        top = targetRect.top;
      }
    } else if (placement === 'left') {
      if (spaceLeft >= cardWidth || spaceLeft >= spaceRight) {
        left = targetRect.left - cardWidth - margin;
        top = targetRect.top;
      } else {
        left = targetRect.right + margin;
        top = targetRect.top;
      }
    } else {
      // Top, bottom, or auto
      let useTop = false;
      if (placement === 'top') {
        useTop = spaceAbove >= cardHeight || spaceAbove >= spaceBelow;
      } else if (placement === 'bottom') {
        useTop = spaceBelow < cardHeight && spaceAbove > spaceBelow;
      } else {
        useTop = spaceBelow < cardHeight && spaceAbove > spaceBelow;
      }

      if (useTop) {
        top = targetRect.top - cardHeight - margin;
      } else {
        top = targetRect.bottom + margin;
      }

      // Horizontally align with target: if target is wider than card, align left; if narrow, center card on target
      if (targetRect.width >= cardWidth) {
        left = targetRect.left;
      } else {
        left = targetRect.left + (targetRect.width - cardWidth) / 2;
      }
    }

    // Horizontal and vertical bounds clamp
    left = Math.max(16, Math.min(left, window.innerWidth - cardWidth - 16));
    top = Math.max(16, Math.min(top, window.innerHeight - cardHeight - 16));

    cardStyle = {
      position: 'fixed',
      top: `${Math.round(top)}px`,
      left: `${Math.round(left)}px`,
    };
  } else if (!targetRect || isFallback) {
    // Unanchored fallback centered in viewport
    cardStyle = {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    };
    isBottomSheet = false;
  }

  return createPortal(
    <div className={styles.portalRoot} data-tour-portal="true">
      {/* Live Region for Screen Readers */}
      <div className={styles.srOnly} role="status" aria-live="polite">
        Step {stepIndex + 1} of {totalSteps}: {step.title}. {step.body}
      </div>

      {/* Spotlight Backdrop Masks */}
      {targetRect && !isFallback ? (
        <>
          {/* Top Mask */}
          <div
            className={styles.maskOverlay}
            data-tour-overlay="true"
            style={{
              top: 0,
              left: 0,
              right: 0,
              height: `${Math.max(0, targetRect.top - 4)}px`,
            }}
          />
          {/* Bottom Mask */}
          <div
            className={styles.maskOverlay}
            data-tour-overlay="true"
            style={{
              top: `${targetRect.bottom + 4}px`,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          />
          {/* Left Mask */}
          <div
            className={styles.maskOverlay}
            data-tour-overlay="true"
            style={{
              top: `${Math.max(0, targetRect.top - 4)}px`,
              left: 0,
              width: `${Math.max(0, targetRect.left - 4)}px`,
              height: `${targetRect.height + 8}px`,
            }}
          />
          {/* Right Mask */}
          <div
            className={styles.maskOverlay}
            data-tour-overlay="true"
            style={{
              top: `${Math.max(0, targetRect.top - 4)}px`,
              left: `${targetRect.right + 4}px`,
              right: 0,
              height: `${targetRect.height + 8}px`,
            }}
          />
          {/* Target Glowing Ring */}
          <div
            className={styles.spotlightRing}
            data-tour-spotlight="true"
            style={{
              top: `${targetRect.top - 4}px`,
              left: `${targetRect.left - 4}px`,
              width: `${targetRect.width + 8}px`,
              height: `${targetRect.height + 8}px`,
            }}
          />
        </>
      ) : (
        <div className={styles.fullBackdrop} data-tour-overlay="true" onClick={onClose} />
      )}

      {/* Coachmark Dialog */}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-label="Product Tour"
        aria-labelledby="tour-step-title"
        aria-describedby="tour-step-body"
        data-tour-coachmark="true"
        className={`${styles.coachmarkCard} ${isBottomSheet ? styles.bottomSheet : ''}`}
        style={cardStyle}
        tabIndex={-1}
      >
        <div className={styles.header}>
          <span className={styles.stepBadge}>
            Step {stepIndex + 1} of {totalSteps}
          </span>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Exit product tour"
            title="Exit tour (Esc)"
          >
            &times;
          </button>
        </div>

        <h2 id="tour-step-title" className={styles.title}>
          {step.title}
        </h2>

        <p id="tour-step-body" className={styles.body}>
          {step.body}
        </p>

        {isFallback && (
          <p className={styles.warningNote}>
            ℹ️ This workspace area is not visible on your current screen size or plan. You can skip ahead!
          </p>
        )}

        <div className={styles.footer}>
          <div className={styles.progressDots} aria-hidden="true">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <span
                key={i}
                className={`${styles.dot} ${i === stepIndex ? styles.dotActive : ''}`}
              />
            ))}
          </div>

          <div className={styles.buttonGroup}>
            {!isFirstStep && (
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={onPrev}
              >
                Back
              </button>
            )}

            {isFallback ? (
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={onSkip}
              >
                Skip
              </button>
            ) : (
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={onSkip}
              >
                Exit
              </button>
            )}

            <button
              type="button"
              className={styles.primaryBtn}
              onClick={onNext}
            >
              {isLastStep ? 'Finish Tour' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

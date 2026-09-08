'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { DASHBOARD_ORIENTATION_TOUR } from '@/lib/product-tour/catalog';
import type { TourProgressRecord, TourStep } from '@/lib/product-tour/types';
import { useAppShell } from '@/components/app-shell-provider';
import {
  advanceTourAction,
  completeTourAction,
  dismissTourAction,
  restartTourAction,
  startTourAction,
} from '@/app/dashboard/tour-actions';
import ProductTourCoachmark from './ProductTourCoachmark';

type TourPhase =
  | 'idle'
  | 'navigating'
  | 'locating-target'
  | 'showing-step'
  | 'paused-by-modal'
  | 'target-unavailable';

type ProductTourRootProps = {
  role: 'owner' | 'office';
  initialProgress: TourProgressRecord | null;
  allowedStepIds: string[];
  enabled: boolean;
};

export default function ProductTourRoot({
  role,
  initialProgress,
  allowedStepIds,
  enabled,
}: ProductTourRootProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { openNav, closeNav } = useAppShell();

  // Filter tour steps to allowed steps for this user (memoized to avoid infinite effect cycles)
  const tourSteps: TourStep[] = useMemo(
    () => DASHBOARD_ORIENTATION_TOUR.steps.filter((s) => allowedStepIds.includes(s.id)),
    [allowedStepIds],
  );

  const [phase, setPhase] = useState<TourPhase>('idle');
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const targetElementRef = useRef<HTMLElement | null>(null);
  const hasInitializedRef = useRef(false);

  // Resume or start from initial progress if active on mount
  useEffect(() => {
    if (!enabled || tourSteps.length === 0 || hasInitializedRef.current) return;

    if (initialProgress && initialProgress.status === 'active') {
      const idx = tourSteps.findIndex((s) => s.id === initialProgress.current_step_id);
      if (idx >= 0) {
        hasInitializedRef.current = true;
        setCurrentStepIndex(idx);
        setPhase('navigating');
      }
    }
  }, [enabled, initialProgress, tourSteps]);

  const currentStep = tourSteps[currentStepIndex] ?? null;

  // Measure target bounding rect
  const updateTargetRect = useCallback(() => {
    if (!targetElementRef.current) return;
    const rect = targetElementRef.current.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setTargetRect(rect);
    }
  }, []);

  // Update rect on scroll and resize when step is visible
  useEffect(() => {
    if (phase !== 'showing-step') return;
    window.addEventListener('resize', updateTargetRect);
    window.addEventListener('scroll', updateTargetRect, true);
    return () => {
      window.removeEventListener('resize', updateTargetRect);
      window.removeEventListener('scroll', updateTargetRect, true);
    };
  }, [phase, updateTargetRect]);

  // Phase 1: Route synchronization
  useEffect(() => {
    if (!enabled || !currentStep || phase === 'idle' || phase === 'paused-by-modal') return;

    if (phase === 'navigating') {
      if (pathname !== currentStep.route) {
        router.push(currentStep.route);
      } else {
        setPhase('locating-target');
      }
    } else if (phase === 'locating-target') {
      if (pathname !== currentStep.route) {
        setPhase('navigating');
        router.push(currentStep.route);
      }
    }
  }, [enabled, currentStep, pathname, phase, router]);

  // Phase 2: Target location & viewport stabilization
  useEffect(() => {
    if (!enabled || !currentStep || phase !== 'locating-target') return;

    if (currentStep.openNavigation && typeof openNav === 'function') {
      openNav();
    }

    if (!currentStep.targetId) {
      targetElementRef.current = null;
      setTargetRect(null);
      setPhase('showing-step');
      return;
    }

    let cancelled = false;
    let scrollTimer: ReturnType<typeof setTimeout> | null = null;
    let scrollEndHandler: (() => void) | null = null;
    const startTime = Date.now();
    const TIMEOUT_MS = 3500;

    function onTargetLocated(el: HTMLElement) {
      if (cancelled) return;
      targetElementRef.current = el;

      // Check if target is comfortably within viewport
      const r = el.getBoundingClientRect();
      const isComfortablyInView =
        r.top >= 60 &&
        r.bottom <= window.innerHeight - 60 &&
        r.left >= 0 &&
        r.right <= window.innerWidth;

      if (isComfortablyInView) {
        setTargetRect(r);
        setPhase('showing-step');
      } else {
        // Scroll target into view centered vertically
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });

        const onScrollDone = () => {
          if (cancelled) return;
          if (scrollTimer) clearTimeout(scrollTimer);
          if (scrollEndHandler) {
            window.removeEventListener('scrollend', scrollEndHandler);
            scrollEndHandler = null;
          }
          const finalRect = el.getBoundingClientRect();
          setTargetRect(finalRect);
          setPhase('showing-step');
        };

        if ('onscrollend' in window) {
          scrollEndHandler = onScrollDone;
          window.addEventListener('scrollend', onScrollDone, { once: true });
          scrollTimer = setTimeout(onScrollDone, 500);
        } else {
          scrollTimer = setTimeout(onScrollDone, 400);
        }
      }
    }

    function findTarget() {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(`[data-tour-id="${currentStep.targetId}"]`);
      if (el && (el.offsetParent !== null || el.getBoundingClientRect().width > 0)) {
        onTargetLocated(el);
        return;
      }

      if (Date.now() - startTime < TIMEOUT_MS) {
        requestAnimationFrame(findTarget);
      } else {
        // Target missing fallback
        targetElementRef.current = null;
        setTargetRect(null);
        setPhase('target-unavailable');

        // Report missing target telemetry
        fetch('/api/demo-tour/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_event_id: `cl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            tour_key: DASHBOARD_ORIENTATION_TOUR.key,
            tour_version: DASHBOARD_ORIENTATION_TOUR.version,
            event_type: 'step_target_missing',
            step_id: currentStep.id,
            pathname,
            metadata: {
              targetId: currentStep.targetId,
              role,
            },
          }),
        }).catch(() => {});
      }
    }

    const timer = setTimeout(findTarget, 60);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (scrollTimer) clearTimeout(scrollTimer);
      if (scrollEndHandler) {
        window.removeEventListener('scrollend', scrollEndHandler);
      }
    };
  }, [enabled, currentStep, phase, pathname, openNav, role]);

  // Pause tour when external modal dialogs open, resume when closed
  useEffect(() => {
    if (!enabled || phase === 'idle' || phase === 'navigating' || phase === 'locating-target') return;

    const checkModal = () => {
      const modalOpen = Boolean(
        document.querySelector(
          '.modal-overlay:not([data-tour-overlay]), [role="dialog"]:not([data-tour-coachmark]):not([aria-label="Product Tour"])',
        ),
      );

      if (modalOpen && phase === 'showing-step') {
        setPhase('paused-by-modal');
      } else if (!modalOpen && phase === 'paused-by-modal') {
        setPhase('showing-step');
        updateTargetRect();
      }
    };

    const observer = new MutationObserver(checkModal);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [enabled, phase, updateTargetRect]);

  // Step transition handlers
  const handleNext = useCallback(async () => {
    if (!currentStep) return;

    if (currentStep.openNavigation && typeof closeNav === 'function') {
      closeNav();
    }

    const isLast = currentStepIndex >= tourSteps.length - 1;
    if (isLast) {
      setPhase('idle');
      targetElementRef.current = null;
      setTargetRect(null);
      await completeTourAction(DASHBOARD_ORIENTATION_TOUR.key, DASHBOARD_ORIENTATION_TOUR.version);
    } else {
      const nextIndex = currentStepIndex + 1;
      const nextStep = tourSteps[nextIndex];
      setCurrentStepIndex(nextIndex);
      targetElementRef.current = null;
      setTargetRect(null);
      setPhase('navigating');
      await advanceTourAction(
        DASHBOARD_ORIENTATION_TOUR.key,
        DASHBOARD_ORIENTATION_TOUR.version,
        nextStep.id,
      );
    }
  }, [currentStep, currentStepIndex, tourSteps, closeNav]);

  const handlePrev = useCallback(() => {
    if (currentStepIndex <= 0) return;
    const prevIndex = currentStepIndex - 1;
    setCurrentStepIndex(prevIndex);
    targetElementRef.current = null;
    setTargetRect(null);
    setPhase('navigating');
  }, [currentStepIndex]);

  const handleClose = useCallback(async () => {
    setPhase('idle');
    targetElementRef.current = null;
    setTargetRect(null);
    if (currentStep?.openNavigation && typeof closeNav === 'function') {
      closeNav();
    }
    await dismissTourAction(DASHBOARD_ORIENTATION_TOUR.key, DASHBOARD_ORIENTATION_TOUR.version);
  }, [currentStep, closeNav]);

  const handleSkip = useCallback(() => {
    handleNext();
  }, [handleNext]);

  const handleStartTour = useCallback(async () => {
    hasInitializedRef.current = true;
    setCurrentStepIndex(0);
    targetElementRef.current = null;
    setTargetRect(null);
    setPhase('navigating');
    await startTourAction(DASHBOARD_ORIENTATION_TOUR.key, DASHBOARD_ORIENTATION_TOUR.version);
  }, []);

  const handleRestartTour = useCallback(async () => {
    hasInitializedRef.current = true;
    setCurrentStepIndex(0);
    targetElementRef.current = null;
    setTargetRect(null);
    setPhase('navigating');
    await restartTourAction(DASHBOARD_ORIENTATION_TOUR.key, DASHBOARD_ORIENTATION_TOUR.version);
  }, []);

  // Listen for global custom events to start or restart the tour
  useEffect(() => {
    function onStart() {
      handleStartTour();
    }
    function onRestart() {
      handleRestartTour();
    }

    window.addEventListener('lgq:start_tour', onStart);
    window.addEventListener('lgq:restart_tour', onRestart);

    return () => {
      window.removeEventListener('lgq:start_tour', onStart);
      window.removeEventListener('lgq:restart_tour', onRestart);
    };
  }, [handleStartTour, handleRestartTour]);

  if (!enabled || !currentStep || phase === 'idle' || phase === 'paused-by-modal') {
    return null;
  }

  return (
    <ProductTourCoachmark
      step={currentStep}
      stepIndex={currentStepIndex}
      totalSteps={tourSteps.length}
      targetRect={targetRect}
      isFallback={phase === 'target-unavailable'}
      onNext={handleNext}
      onPrev={handlePrev}
      onClose={handleClose}
      onSkip={phase === 'target-unavailable' ? handleSkip : handleClose}
    />
  );
}

'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
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

  // Filter tour steps to allowed steps for this user
  const tourSteps: TourStep[] = DASHBOARD_ORIENTATION_TOUR.steps.filter((s) =>
    allowedStepIds.includes(s.id),
  );

  const [phase, setPhase] = useState<TourPhase>('idle');
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const targetElementRef = useRef<HTMLElement | null>(null);

  // Resume or start from initial progress if active
  useEffect(() => {
    if (!enabled || tourSteps.length === 0) return;

    if (initialProgress && initialProgress.status === 'active') {
      const idx = tourSteps.findIndex((s) => s.id === initialProgress.current_step_id);
      if (idx >= 0) {
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

  // Update rect on scroll and resize
  useEffect(() => {
    if (phase !== 'showing-step') return;
    window.addEventListener('resize', updateTargetRect);
    window.addEventListener('scroll', updateTargetRect, true);
    return () => {
      window.removeEventListener('resize', updateTargetRect);
      window.removeEventListener('scroll', updateTargetRect, true);
    };
  }, [phase, updateTargetRect]);

  // Handle route navigation and target location
  useEffect(() => {
    if (!enabled || !currentStep || phase === 'idle') return;

    // Check if modal dialog is currently open
    const modalOpen = Boolean(document.querySelector('.modal-overlay, [role="dialog"]:not([aria-label="Product Tour"])'));
    if (modalOpen) {
      setPhase('paused-by-modal');
      return;
    }

    if (pathname !== currentStep.route) {
      setPhase('navigating');
      router.push(currentStep.route);
      return;
    }

    // Now on correct route: locate target element
    setPhase('locating-target');
    let cancelled = false;

    if (currentStep.openNavigation && typeof openNav === 'function') {
      openNav();
    }

    const startTime = Date.now();
    const TIMEOUT_MS = 3000;

    function findTarget() {
      if (cancelled) return;
      if (!currentStep?.targetId) {
        setTargetRect(null);
        setPhase('showing-step');
        return;
      }

      const el = document.querySelector<HTMLElement>(`[data-tour-id="${currentStep.targetId}"]`);
      if (el && el.offsetParent !== null) {
        targetElementRef.current = el;
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        const rect = el.getBoundingClientRect();
        setTargetRect(rect);
        setPhase('showing-step');
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

    const timer = setTimeout(findTarget, 100);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, currentStep, pathname, phase, router, openNav, role]);

  // Step transition handlers
  const handleNext = useCallback(async () => {
    if (!currentStep) return;

    if (currentStep.openNavigation && typeof closeNav === 'function') {
      closeNav();
    }

    const isLast = currentStepIndex >= tourSteps.length - 1;
    if (isLast) {
      setPhase('idle');
      await completeTourAction(DASHBOARD_ORIENTATION_TOUR.key, DASHBOARD_ORIENTATION_TOUR.version);
    } else {
      const nextIndex = currentStepIndex + 1;
      const nextStep = tourSteps[nextIndex];
      setCurrentStepIndex(nextIndex);
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
    setPhase('navigating');
  }, [currentStepIndex]);

  const handleClose = useCallback(async () => {
    setPhase('idle');
    if (currentStep?.openNavigation && typeof closeNav === 'function') {
      closeNav();
    }
    await dismissTourAction(DASHBOARD_ORIENTATION_TOUR.key, DASHBOARD_ORIENTATION_TOUR.version);
  }, [currentStep, closeNav]);

  const handleSkip = useCallback(() => {
    handleNext();
  }, [handleNext]);

  const handleStartTour = useCallback(async () => {
    setCurrentStepIndex(0);
    setPhase('navigating');
    await startTourAction(DASHBOARD_ORIENTATION_TOUR.key, DASHBOARD_ORIENTATION_TOUR.version);
  }, []);

  const handleRestartTour = useCallback(async () => {
    setCurrentStepIndex(0);
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

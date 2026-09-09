'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
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
  recordTourEventAction,
} from '@/app/dashboard/tour-actions';
import ProductTourCoachmark from './ProductTourCoachmark';
import styles from './product-tour.module.css';

type TourPhase =
  | 'idle'
  | 'passive-resume'
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
  offer?: boolean;
};

function getScrollingAncestor(element: HTMLElement | null): HTMLElement | Window {
  if (!element || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return window;
  let parent = element.parentElement;
  while (parent && parent !== document.body && parent !== document.documentElement) {
    try {
      const style = window.getComputedStyle(parent);
      if (style) {
        const overflow = `${style.overflow || ''} ${style.overflowY || ''} ${style.overflowX || ''}`;
        if (
          /(auto|scroll|overlay)/.test(overflow) &&
          (parent.scrollHeight > parent.clientHeight || parent.scrollWidth > parent.clientWidth)
        ) {
          return parent;
        }
      }
    } catch {
      // Ignore style resolution error
    }
    parent = parent.parentElement;
  }
  return window;
}

export default function ProductTourRoot({
  role,
  initialProgress,
  allowedStepIds,
  enabled,
  offer: _offer,
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

  // Monotonic generation counter to ensure late measurements cannot paint over step N+1
  const generationRef = useRef(0);

  // Time-to-anchor telemetry measurement
  const anchorStartTimeRef = useRef<number>(Date.now());
  const settlePathRef = useRef<'immediate' | 'scrolled' | 'fallback'>('immediate');

  // Resume or start from initial progress if active on mount
  useEffect(() => {
    if (!enabled || tourSteps.length === 0 || hasInitializedRef.current) return;

    if (initialProgress && initialProgress.status === 'active') {
      hasInitializedRef.current = true;
      let targetIndex = tourSteps.findIndex((s) => s.id === initialProgress.current_step_id);

      // Phase 1.2: Degraded resume when stored step is not in allowed steps
      if (targetIndex < 0) {
        const storedCatalogIdx = DASHBOARD_ORIENTATION_TOUR.steps.findIndex(
          (s) => s.id === initialProgress.current_step_id,
        );
        let fallbackStep = tourSteps[0];
        if (storedCatalogIdx > 0) {
          for (const s of tourSteps) {
            const cIdx = DASHBOARD_ORIENTATION_TOUR.steps.findIndex((step) => step.id === s.id);
            if (cIdx <= storedCatalogIdx) {
              fallbackStep = s;
            } else {
              break;
            }
          }
        }
        targetIndex = tourSteps.indexOf(fallbackStep);
        if (targetIndex < 0) targetIndex = 0;

        recordTourEventAction({
          client_event_id: `cl_deg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          tour_key: DASHBOARD_ORIENTATION_TOUR.key,
          tour_version: DASHBOARD_ORIENTATION_TOUR.version,
          event_type: 'step_skipped',
          step_id: initialProgress.current_step_id,
          pathname,
          metadata: {
            reason: 'step_not_allowed',
            storedStepId: initialProgress.current_step_id,
            fallbackStepId: tourSteps[targetIndex].id,
          },
        }).catch(() => {});
      }

      setCurrentStepIndex(targetIndex);
      const step = tourSteps[targetIndex];

      // Phase 1.1: Passive resume to prevent navigation hijack
      if (pathname === step.route) {
        // Auto-proceed only if already on the step's route
        setPhase('locating-target');
        anchorStartTimeRef.current = Date.now();
      } else {
        // Passive resume pill
        setPhase('passive-resume');
      }
    }
  }, [enabled, initialProgress, tourSteps, pathname]);

  const currentStep = tourSteps[currentStepIndex] ?? null;

  // Measure target bounding rect
  const updateTargetRect = useCallback(() => {
    if (!targetElementRef.current) return;
    const rect = targetElementRef.current.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setTargetRect(rect);
    }
  }, []);

  // Live rect observation (Phase 2.5): ResizeObserver + MutationObserver on target element
  useEffect(() => {
    if (phase !== 'showing-step' || !targetElementRef.current) return;

    let rafId: number | null = null;
    const scheduleUpdate = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        updateTargetRect();
        rafId = null;
      });
    };

    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('scroll', scheduleUpdate, true);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => scheduleUpdate());
      resizeObserver.observe(targetElementRef.current);
    }

    let mutationObserver: MutationObserver | null = null;
    if (typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver(() => scheduleUpdate());
      mutationObserver.observe(targetElementRef.current, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
      });
    }

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('scroll', scheduleUpdate, true);
      if (resizeObserver) resizeObserver.disconnect();
      if (mutationObserver) mutationObserver.disconnect();
    };
  }, [phase, updateTargetRect]);

  // Route synchronization
  useEffect(() => {
    if (!enabled || !currentStep || phase === 'idle' || phase === 'paused-by-modal' || phase === 'passive-resume') return;

    if (phase === 'navigating') {
      if (pathname !== currentStep.route) {
        router.push(currentStep.route);
      } else {
        setPhase('locating-target');
        anchorStartTimeRef.current = Date.now();
      }
    } else if (phase === 'locating-target') {
      if (pathname !== currentStep.route) {
        setPhase('navigating');
        router.push(currentStep.route);
      }
    }
  }, [enabled, currentStep, pathname, phase, router]);

  // Prefetch next route (Phase 3.1) and record anchor telemetry (Phase 4.2)
  useEffect(() => {
    if (phase !== 'showing-step' || !currentStep) return;

    // Prefetch next step route
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < tourSteps.length) {
      const nextStep = tourSteps[nextIndex];
      if (nextStep && nextStep.route && nextStep.route !== pathname) {
        router.prefetch(nextStep.route);
      }
    }

    // Record time-to-anchor telemetry
    const anchorMs = Math.max(0, Date.now() - anchorStartTimeRef.current);
    recordTourEventAction({
      client_event_id: `cl_vw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      tour_key: DASHBOARD_ORIENTATION_TOUR.key,
      tour_version: DASHBOARD_ORIENTATION_TOUR.version,
      event_type: 'step_viewed',
      step_id: currentStep.id,
      pathname,
      metadata: {
        anchor_ms: anchorMs,
        settle_path: settlePathRef.current,
        targetId: currentStep.targetId ?? 'unanchored',
      },
    }).catch(() => {});
  }, [phase, currentStep, currentStepIndex, tourSteps, pathname, router]);

  // Target location & viewport stabilization (Phase 2.3 & 2.4)
  useEffect(() => {
    if (!enabled || !currentStep || phase !== 'locating-target') return;

    const currentGen = ++generationRef.current;
    anchorStartTimeRef.current = Date.now();

    if (currentStep.openNavigation && typeof openNav === 'function') {
      openNav();
    }

    if (!currentStep.targetId) {
      targetElementRef.current = null;
      setTargetRect(null);
      settlePathRef.current = 'immediate';
      setPhase('showing-step');
      return;
    }

    let cancelled = false;
    let activeSettleCleanup: (() => void) | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let observer: MutationObserver | null = null;

    function onTargetLocated(el: HTMLElement) {
      if (cancelled || generationRef.current !== currentGen) return;
      targetElementRef.current = el;

      const r = el.getBoundingClientRect();
      const isComfortablyInView =
        r.top >= 60 &&
        r.bottom <= window.innerHeight - 60 &&
        r.left >= 0 &&
        r.right <= window.innerWidth;

      if (isComfortablyInView) {
        settlePathRef.current = 'immediate';
        setTargetRect(r);
        setPhase('showing-step');
      } else {
        settlePathRef.current = 'scrolled';
        const scrollAncestor = getScrollingAncestor(el);
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });

        let settled = false;
        let consecutiveStableFrames = 0;
        let hasMoved = false;
        const initialTop = r.top;
        const initialLeft = r.left;
        let lastTop = -999999;
        let lastLeft = -999999;
        const scrollStartTime = Date.now();

        let settleRaf: number | null = null;
        let hardCapTimer: ReturnType<typeof setTimeout> | null = null;
        let intersectionObserver: IntersectionObserver | null = null;

        const cleanupSettle = () => {
          if (settleRaf !== null) {
            cancelAnimationFrame(settleRaf);
            settleRaf = null;
          }
          if (hardCapTimer) {
            clearTimeout(hardCapTimer);
            hardCapTimer = null;
          }
          if (intersectionObserver) {
            intersectionObserver.disconnect();
            intersectionObserver = null;
          }
          scrollAncestor.removeEventListener('scrollend', onScrollEnd);
          if (scrollAncestor !== window) {
            window.removeEventListener('scrollend', onScrollEnd);
          }
        };

        const finishSettle = () => {
          if (settled || cancelled || generationRef.current !== currentGen) return;
          settled = true;
          cleanupSettle();
          const finalRect = el.getBoundingClientRect();
          setTargetRect(finalRect);
          setPhase('showing-step');
        };

        const onScrollEnd = () => {
          hasMoved = true;
          consecutiveStableFrames = 0;
        };

        scrollAncestor.addEventListener('scrollend', onScrollEnd, { once: true });
        if (scrollAncestor !== window) {
          window.addEventListener('scrollend', onScrollEnd, { once: true });
        }

        // IntersectionObserver settlement tracking
        if (typeof IntersectionObserver !== 'undefined') {
          try {
            intersectionObserver = new IntersectionObserver(
              (entries) => {
                if (settled || cancelled || generationRef.current !== currentGen) return;
                for (const entry of entries) {
                  if (entry.isIntersecting) {
                    hasMoved = true;
                  }
                }
              },
              {
                root: scrollAncestor === window ? null : (scrollAncestor as Element),
                threshold: [0, 0.25, 0.5, 0.75, 1],
              },
            );
            intersectionObserver.observe(el);
          } catch {
            // Ignore IntersectionObserver initialization failure
          }
        }

        const checkStability = () => {
          if (settled || cancelled || generationRef.current !== currentGen) return;

          const currentRect = el.getBoundingClientRect();
          const movedFromInitial =
            Math.abs(currentRect.top - initialTop) > 1 ||
            Math.abs(currentRect.left - initialLeft) > 1;

          if (movedFromInitial) {
            hasMoved = true;
          }

          const isPositionStable =
            Math.abs(currentRect.top - lastTop) < 0.5 &&
            Math.abs(currentRect.left - lastLeft) < 0.5;

          if (isPositionStable) {
            consecutiveStableFrames += 1;
          } else {
            consecutiveStableFrames = 0;
          }

          lastTop = currentRect.top;
          lastLeft = currentRect.left;

          const elapsed = Date.now() - scrollStartTime;
          // Target is settled when:
          // 1. Coordinates moved during scroll and remained stable for 2 consecutive animation frames
          // 2. Or elapsed time >= 150ms with 2 consecutive stable frames (instant scroll or already centered)
          if (consecutiveStableFrames >= 2 && (hasMoved || elapsed >= 150)) {
            finishSettle();
            return;
          }

          settleRaf = requestAnimationFrame(checkStability);
        };

        settleRaf = requestAnimationFrame(checkStability);
        // Hard cap fallback: 2500ms max so a never-settling page cannot hang
        hardCapTimer = setTimeout(finishSettle, 2500);

        activeSettleCleanup = cleanupSettle;
      }
    }

    // Step 1: Immediate check
    const immediateEl = document.querySelector<HTMLElement>(`[data-tour-id="${currentStep.targetId}"]`);
    if (immediateEl && (immediateEl.offsetParent !== null || immediateEl.getBoundingClientRect().width > 0)) {
      onTargetLocated(immediateEl);
      return;
    }

    // Step 2: MutationObserver instead of polling
    const containerNode = document.querySelector('main') || document.body;
    if (typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(() => {
        if (cancelled || generationRef.current !== currentGen) return;
        const el = document.querySelector<HTMLElement>(`[data-tour-id="${currentStep.targetId}"]`);
        if (el && (el.offsetParent !== null || el.getBoundingClientRect().width > 0)) {
          if (observer) observer.disconnect();
          onTargetLocated(el);
        }
      });
      observer.observe(containerNode, { childList: true, subtree: true });
    }

    // Step 3: Hard cap timeout 3500ms
    timeoutTimer = setTimeout(() => {
      if (cancelled || generationRef.current !== currentGen) return;
      if (observer) observer.disconnect();

      targetElementRef.current = null;
      setTargetRect(null);
      settlePathRef.current = 'fallback';
      setPhase('target-unavailable');

      recordTourEventAction({
        client_event_id: `cl_mis_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        tour_key: DASHBOARD_ORIENTATION_TOUR.key,
        tour_version: DASHBOARD_ORIENTATION_TOUR.version,
        event_type: 'step_target_missing',
        step_id: currentStep.id,
        pathname,
        metadata: {
          targetId: currentStep.targetId,
          role,
        },
      }).catch(() => {});
    }, 3500);

    return () => {
      cancelled = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (activeSettleCleanup) activeSettleCleanup();
      if (observer) observer.disconnect();
    };
  }, [enabled, currentStep, phase, pathname, openNav, role]);

  // Modal detection (Phase 2.6) - armed for all non-idle phases, debounced, and scoped to modal containers/direct body children
  useEffect(() => {
    if (!enabled || phase === 'idle' || phase === 'passive-resume' || typeof MutationObserver === 'undefined') return;

    let rafId: number | null = null;
    const isModalActive = (): boolean => {
      // 1. Check direct children of document.body (portaled modals, backdrops, drawers)
      for (const child of Array.from(document.body.children)) {
        if (
          child.hasAttribute('data-tour-coachmark') ||
          child.hasAttribute('data-tour-overlay') ||
          child.getAttribute('aria-label') === 'Product Tour'
        ) {
          continue;
        }
        if (
          child.classList.contains('modal-overlay') ||
          child.classList.contains('app-modal-backdrop') ||
          child.classList.contains('qs-modal-overlay') ||
          child.getAttribute('role') === 'dialog' ||
          Boolean(
            child.querySelector(
              '.modal-overlay:not([data-tour-overlay]), [role="dialog"]:not([data-tour-coachmark]):not([aria-label="Product Tour"]), .app-modal-backdrop',
            ),
          )
        ) {
          return true;
        }
      }

      // 2. Open native <dialog> elements
      if (typeof document.querySelector === 'function') {
        const openDialog = document.querySelector(
          'dialog[open]:not([data-tour-coachmark]):not([aria-label="Product Tour"])',
        );
        if (openDialog) return true;
      }

      return false;
    };

    const checkModal = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const modalOpen = isModalActive();

        if (modalOpen && (phase === 'showing-step' || phase === 'locating-target')) {
          setPhase('paused-by-modal');
        } else if (!modalOpen && phase === 'paused-by-modal') {
          setPhase('showing-step');
          updateTargetRect();
        }
      });
    };

    // Scoped observation: observe direct children of document.body only (where React portals mount backdrops and dialogs)
    // without subtree: true so mutations deep within live streaming dashboard content do not trigger checks.
    const observer = new MutationObserver(checkModal);
    observer.observe(document.body, { childList: true });

    const modalRoot = document.getElementById('modal-root');
    if (modalRoot) {
      observer.observe(modalRoot, { childList: true });
    }

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      observer.disconnect();
    };
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
      const result = await completeTourAction(DASHBOARD_ORIENTATION_TOUR.key, DASHBOARD_ORIENTATION_TOUR.version);
      if (!result.success) {
        recordTourEventAction({
          client_event_id: `cl_err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          tour_key: DASHBOARD_ORIENTATION_TOUR.key,
          tour_version: DASHBOARD_ORIENTATION_TOUR.version,
          event_type: 'tour_exited',
          step_id: currentStep.id,
          metadata: { action: 'completeTour', error: result.error ?? 'Unknown error' },
        }).catch(() => {});
      }
    } else {
      const nextIndex = currentStepIndex + 1;
      const nextStep = tourSteps[nextIndex];
      setCurrentStepIndex(nextIndex);
      targetElementRef.current = null;
      setTargetRect(null);
      setPhase(pathname === nextStep?.route ? 'locating-target' : 'navigating');
      anchorStartTimeRef.current = Date.now();
      const result = await advanceTourAction(
        DASHBOARD_ORIENTATION_TOUR.key,
        DASHBOARD_ORIENTATION_TOUR.version,
        nextStep.id,
      );
      if (!result.success) {
        recordTourEventAction({
          client_event_id: `cl_err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          tour_key: DASHBOARD_ORIENTATION_TOUR.key,
          tour_version: DASHBOARD_ORIENTATION_TOUR.version,
          event_type: 'tour_exited',
          step_id: nextStep.id,
          metadata: { action: 'advanceTour', error: result.error ?? 'Unknown error' },
        }).catch(() => {});
      }
    }
  }, [currentStep, currentStepIndex, tourSteps, closeNav, pathname]);

  const handlePrev = useCallback(async () => {
    if (currentStepIndex <= 0) return;
    const prevIndex = currentStepIndex - 1;
    const prevStep = tourSteps[prevIndex];
    setCurrentStepIndex(prevIndex);
    targetElementRef.current = null;
    setTargetRect(null);
    setPhase(pathname === prevStep?.route ? 'locating-target' : 'navigating');
    anchorStartTimeRef.current = Date.now();

    const result = await advanceTourAction(
      DASHBOARD_ORIENTATION_TOUR.key,
      DASHBOARD_ORIENTATION_TOUR.version,
      prevStep.id,
    );
    if (!result.success) {
      recordTourEventAction({
        client_event_id: `cl_err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        tour_key: DASHBOARD_ORIENTATION_TOUR.key,
        tour_version: DASHBOARD_ORIENTATION_TOUR.version,
        event_type: 'tour_exited',
        step_id: prevStep.id,
        metadata: { action: 'handlePrev', error: result.error ?? 'Unknown error' },
      }).catch(() => {});
    }
  }, [currentStepIndex, tourSteps, pathname]);

  const handleClose = useCallback(async () => {
    setPhase('idle');
    targetElementRef.current = null;
    setTargetRect(null);
    if (currentStep?.openNavigation && typeof closeNav === 'function') {
      closeNav();
    }
    const result = await dismissTourAction(DASHBOARD_ORIENTATION_TOUR.key, DASHBOARD_ORIENTATION_TOUR.version);
    if (!result.success) {
      recordTourEventAction({
        client_event_id: `cl_err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        tour_key: DASHBOARD_ORIENTATION_TOUR.key,
        tour_version: DASHBOARD_ORIENTATION_TOUR.version,
        event_type: 'tour_exited',
        metadata: { action: 'dismissTour', error: result.error ?? 'Unknown error' },
      }).catch(() => {});
    }
  }, [currentStep, closeNav]);

  const handleSkip = useCallback(() => {
    handleNext();
  }, [handleNext]);

  const handleStartTour = useCallback(async () => {
    hasInitializedRef.current = true;
    setCurrentStepIndex(0);
    targetElementRef.current = null;
    setTargetRect(null);
    const firstStep = tourSteps[0];
    setPhase(pathname === firstStep?.route ? 'locating-target' : 'navigating');
    anchorStartTimeRef.current = Date.now();
    const result = await startTourAction(DASHBOARD_ORIENTATION_TOUR.key, DASHBOARD_ORIENTATION_TOUR.version);
    if (!result.success) {
      recordTourEventAction({
        client_event_id: `cl_err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        tour_key: DASHBOARD_ORIENTATION_TOUR.key,
        tour_version: DASHBOARD_ORIENTATION_TOUR.version,
        event_type: 'tour_exited',
        metadata: { action: 'startTour', error: result.error ?? 'Unknown error' },
      }).catch(() => {});
    }
  }, [tourSteps, pathname]);

  const handleRestartTour = useCallback(async () => {
    hasInitializedRef.current = true;
    setCurrentStepIndex(0);
    targetElementRef.current = null;
    setTargetRect(null);
    const firstStep = tourSteps[0];
    setPhase(pathname === firstStep?.route ? 'locating-target' : 'navigating');
    anchorStartTimeRef.current = Date.now();
    const result = await restartTourAction(DASHBOARD_ORIENTATION_TOUR.key, DASHBOARD_ORIENTATION_TOUR.version);
    if (!result.success) {
      recordTourEventAction({
        client_event_id: `cl_err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        tour_key: DASHBOARD_ORIENTATION_TOUR.key,
        tour_version: DASHBOARD_ORIENTATION_TOUR.version,
        event_type: 'tour_exited',
        metadata: { action: 'restartTour', error: result.error ?? 'Unknown error' },
      }).catch(() => {});
    }
  }, [tourSteps, pathname]);

  const handleResumeClick = useCallback(() => {
    if (!currentStep) return;
    setPhase('navigating');
    anchorStartTimeRef.current = Date.now();
    if (pathname !== currentStep.route) {
      router.push(currentStep.route);
    } else {
      setPhase('locating-target');
    }
  }, [currentStep, pathname, router]);

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

  if (!enabled || !currentStep || phase === 'idle') {
    return null;
  }

  // Phase 1.1: Passive resume floating pill
  if (phase === 'passive-resume') {
    return (
      <div className={styles.resumePill} role="region" aria-label="Resume Product Tour">
        <span>Resume tour (step {currentStepIndex + 1} of {tourSteps.length})</span>
        <button type="button" onClick={handleResumeClick} className={styles.resumePillActionBtn}>
          Resume &rarr;
        </button>
        <button type="button" onClick={handleClose} className={styles.resumePillCloseBtn} aria-label="Dismiss">
          &times;
        </button>
      </div>
    );
  }

  // Phase 2.1: Settling chip during navigation & target location
  if (phase === 'navigating' || phase === 'locating-target') {
    return (
      <div className={styles.settlingChip} role="status" aria-live="polite">
        <span className={styles.settlingSpinner} />
        <span>Loading {currentStep.title}...</span>
      </div>
    );
  }

  // Phase 2.7: Paused by modal dialog chip
  if (phase === 'paused-by-modal') {
    return (
      <div className={styles.pausedChip} role="status" aria-live="polite">
        <span>🧭 Tour paused — close dialog to continue</span>
        <button type="button" onClick={handleClose} className={styles.chipCloseBtn} aria-label="Exit tour">
          &times;
        </button>
      </div>
    );
  }

  // Showing step or fallback
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


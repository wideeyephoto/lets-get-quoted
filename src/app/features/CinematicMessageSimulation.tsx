'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  HERO_EVENTS,
  HERO_RUNTIME,
  HERO_SMS,
  HERO_STATUS,
  HERO_SUMMARY,
  HERO_THREAD_AREA,
  HERO_THREAD_CLIENT,
  HERO_THREAD_JOB,
  HERO_THREAD_TRADE,
  WORKFLOW_STAGES,
} from './hero-thread';
import styles from './cinematic-message-simulation.module.css';

/**
 * The /features hero: One Job Record moving from website lead to paid job.
 *
 * Visualizes the unified 5-stage contractor workflow:
 * Request received → Qualified → Quote approved → Tue 9–11 booked → $2,125 deposit paid
 */

type Frame = {
  completedStages: number;
  statusIndex: number;
  eventId: number; // 1-based index in HERO_EVENTS; 0 for none
  eventLeaving: boolean;
  smsIndex: number;
};

const REST: Frame = {
  completedStages: 2,
  statusIndex: 0,
  eventId: 0,
  eventLeaving: false,
  smsIndex: 0,
};

const FINAL: Frame = {
  completedStages: 5,
  statusIndex: HERO_STATUS.length - 1,
  eventId: 0,
  eventLeaving: false,
  smsIndex: HERO_SMS.length - 1,
};

const EVENT_EXIT = 360;

const STEPS: { at: number; frame: Frame }[] = (() => {
  const marks: { at: number; apply: (f: Frame) => Frame }[] = [];

  HERO_EVENTS.forEach((event, index) => {
    marks.push({
      at: event.at,
      apply: (f) => ({ ...f, eventId: index + 1, eventLeaving: false }),
    });
    marks.push({
      at: event.until,
      apply: (f) => ({ ...f, eventId: index + 1, eventLeaving: true }),
    });
    marks.push({
      at: event.until + EVENT_EXIT,
      apply: (f) => ({
        ...f,
        eventId: 0,
        eventLeaving: false,
        completedStages: Math.max(f.completedStages, index + 3),
      }),
    });
  });

  HERO_STATUS.forEach((statusStep, index) => {
    if (index === 0) return;
    marks.push({
      at: statusStep.at,
      apply: (f) => ({
        ...f,
        statusIndex: index,
        completedStages: Math.max(f.completedStages, statusStep.completedStages),
      }),
    });
  });

  HERO_SMS.forEach((sms, index) => {
    if (index === 0) return;
    marks.push({
      at: sms.at,
      apply: (f) => ({ ...f, smsIndex: index }),
    });
  });

  marks.sort((a, b) => a.at - b.at);

  let current = REST;
  return marks.map((mark) => {
    current = mark.apply(current);
    return { at: mark.at, frame: current };
  });
})();

function Body({ body, link }: { body: string; link: string }) {
  if (!link || !body.includes(link)) return <>{body}</>;
  const [before, ...rest] = body.split(link);
  return (
    <>
      {before}
      <span className={styles.smsLink}>{link}</span>
      {rest.join(link)}
    </>
  );
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export default function CinematicMessageSimulation() {
  const [frame, setFrame] = useState<Frame>(FINAL);
  const [armed, setArmed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [stilled, setStilled] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const nextRef = useRef(0);
  const elapsedRef = useRef(0);
  const sinceRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const runningRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useIsomorphicLayoutEffect(() => {
    setArmed(true);
    // On mobile screens or prefers-reduced-motion, show the complete state immediately
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (isMobile || isReduced) {
      setStilled(true);
      setFrame(FINAL);
      return;
    }
    setFrame(REST);
  }, []);

  const run = useCallback(() => {
    clearTimer();
    const index = nextRef.current;
    if (index >= STEPS.length) return;
    sinceRef.current = performance.now();
    timerRef.current = window.setTimeout(
      () => {
        elapsedRef.current = STEPS[index].at;
        setFrame(STEPS[index].frame);
        nextRef.current = index + 1;
        if (index + 1 >= STEPS.length) {
          timerRef.current = window.setTimeout(() => {
            runningRef.current = false;
            setPlaying(false);
            setFinished(true);
          }, Math.max(0, HERO_RUNTIME - STEPS[index].at));
          return;
        }
        run();
      },
      Math.max(0, STEPS[index].at - elapsedRef.current),
    );
  }, []);

  const hold = useCallback(() => {
    if (timerRef.current === null) return;
    elapsedRef.current += performance.now() - sinceRef.current;
    clearTimer();
  }, []);

  const start = useCallback(() => {
    nextRef.current = 0;
    elapsedRef.current = 0;
    runningRef.current = true;
    setFinished(false);
    setPlaying(true);
    setFrame(REST);
    run();
  }, [run]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const decide = () => {
      if (query.matches) {
        runningRef.current = false;
        clearTimer();
        setPlaying(false);
        setFinished(false);
        setStilled(true);
        setFrame(FINAL);
      } else {
        setStilled(false);
      }
    };
    decide();
    query.addEventListener('change', decide);
    return () => query.removeEventListener('change', decide);
  }, []);

  useEffect(() => {
    if (stilled) return;
    const node = rootRef.current;
    if (!node) return;

    if (!('IntersectionObserver' in window)) {
      setFrame(FINAL);
      setFinished(true);
      return;
    }

    let begun = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const seen = entry.intersectionRatio >= 0.5;
        const anyOf = entry.intersectionRatio > 0;
        if (seen && !begun) {
          begun = true;
          start();
          return;
        }
        if (!runningRef.current) return;
        if (anyOf && !document.hidden) run();
        else hold();
      },
      { threshold: [0, 0.5] },
    );
    observer.observe(node);

    const onVisibility = () => {
      if (!runningRef.current) return;
      if (document.hidden) hold();
      else run();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimer();
    };
  }, [hold, run, start, stilled]);

  useEffect(() => () => clearTimer(), []);

  const currentStatus = HERO_STATUS[frame.statusIndex];
  const activeEvent = frame.eventId ? HERO_EVENTS[frame.eventId - 1] : null;
  const currentSms = HERO_SMS[frame.smsIndex];

  return (
    <div className={`hero-thread hero-thread-sim ${styles.sim}`} ref={rootRef}>
      <p className="sr-only">{HERO_SUMMARY}</p>

      <div
        className={styles.stage}
        aria-hidden="true"
        data-armed={armed ? 'true' : 'false'}
        data-still={stilled ? 'true' : 'false'}
        data-paused={armed && !playing && !finished && !stilled ? 'true' : 'false'}
      >
        <span className={styles.glow} />

        <div className={styles.jobCard}>
          {/* Header with business name, job identifier, and current live status */}
          <div className={styles.cardHeader}>
            <div className={styles.jobMeta}>
              <div className={styles.metaTop}>
                <span className={styles.jobId}>{HERO_THREAD_JOB}</span>
                <span className={styles.jobDivider}>·</span>
                <span className={styles.jobClient}>{HERO_THREAD_CLIENT}</span>
                <span className={styles.jobDivider}>·</span>
                <span className={styles.jobArea}>{HERO_THREAD_AREA}</span>
              </div>
              <strong className={styles.tradeTitle}>{HERO_THREAD_TRADE}</strong>
            </div>
            <span className={styles.statusBadge} data-tone={currentStatus.tone}>
              <span className={styles.statusDot} />
              {currentStatus.label}
            </span>
          </div>

          {/* 5-Step Unified Workflow Stepper */}
          <div className={styles.stepperWrap}>
            <ol className={styles.stepper}>
              {WORKFLOW_STAGES.map((stage, idx) => {
                const stepNum = idx + 1;
                const isCompleted = frame.completedStages >= stepNum;
                const isCurrent = frame.completedStages + 1 === stepNum;

                return (
                  <li
                    key={stage.id}
                    className={styles.stepItem}
                    data-state={isCompleted ? 'completed' : isCurrent ? 'active' : 'pending'}
                  >
                    <span className={styles.node}>
                      {isCompleted ? (
                        <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3.5 8.5 6.5 11.5 12.5 4.5" />
                        </svg>
                      ) : (
                        <span className={styles.nodeDot} />
                      )}
                    </span>
                    <div className={styles.stepContent}>
                      <div className={styles.stepLabelRow}>
                        <span className={styles.stepLabel}>{stage.label}</span>
                        <span className={styles.stepSource}>{stage.source}</span>
                      </div>
                      <span className={styles.stepDetail}>{stage.detail}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Active Event Banner (Dashboard action or Payment Confirmation) */}
          <div className={styles.eventSlot}>
            {activeEvent ? (
              <div className={styles.eventBanner} data-leaving={frame.eventLeaving ? 'true' : 'false'}>
                <div className={styles.eventSurface}>
                  <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
                    <line x1="1.5" y1="6" x2="14.5" y2="6" />
                  </svg>
                  <span>{activeEvent.surface}</span>
                </div>
                <div className={styles.eventBody}>
                  <strong>{activeEvent.headline}</strong>
                  <small>{activeEvent.detail}</small>
                </div>
              </div>
            ) : null}
          </div>

          {/* Supporting Evidence: Automated Customer SMS preview */}
          <div className={styles.smsFooter}>
            <div className={styles.smsHeader}>
              <span className={styles.smsBadge}>AUTOMATED CUSTOMER UPDATE</span>
              <span className={styles.smsDelivered}>✓ Sent to {HERO_THREAD_CLIENT}</span>
            </div>
            <div className={styles.smsBubble}>
              <p>
                <Body body={currentSms.body} link={currentSms.link} />
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

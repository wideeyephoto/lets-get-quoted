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
  TRADE_WORKFLOW_PRESETS,
  TradePresetId,
  WORKFLOW_STAGES,
} from './hero-thread';
import styles from './cinematic-message-simulation.module.css';

/**
 * The /features hero: One Job Record moving from website lead to paid job.
 *
 * Visualizes the unified 5-stage contractor workflow across 5 trades:
 * Request received → Qualified → Quote approved → Scheduled → Deposit paid
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

const STAGE_PRESETS: Frame[] = [
  // Stage 1: Request received
  {
    completedStages: 1,
    statusIndex: 0,
    eventId: 0,
    eventLeaving: false,
    smsIndex: 0,
  },
  // Stage 2: Qualified
  {
    completedStages: 2,
    statusIndex: 0,
    eventId: 0,
    eventLeaving: false,
    smsIndex: 0,
  },
  // Stage 3: Quote approved
  {
    completedStages: 3,
    statusIndex: 1,
    eventId: 1,
    eventLeaving: false,
    smsIndex: 0,
  },
  // Stage 4: Scheduled
  {
    completedStages: 4,
    statusIndex: 2,
    eventId: 2,
    eventLeaving: false,
    smsIndex: 1,
  },
  // Stage 5: Deposit paid
  {
    completedStages: 5,
    statusIndex: 3,
    eventId: 3,
    eventLeaving: false,
    smsIndex: 1,
  },
];

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

function Body({ body, link }: { body: string; link?: string }) {
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

const TRADES: Array<{ id: TradePresetId; label: string; icon: string }> = [
  { id: 'electrical', label: 'Electrical', icon: '⚡' },
  { id: 'plumbing', label: 'Plumbing', icon: '🚰' },
  { id: 'hvac', label: 'HVAC', icon: '❄️' },
  { id: 'roofing', label: 'Roofing', icon: '🔨' },
  { id: 'remodeling', label: 'Remodeling', icon: '🏡' },
];

export default function CinematicMessageSimulation() {
  const [frame, setFrame] = useState<Frame>(FINAL);
  const [armed, setArmed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [stilled, setStilled] = useState(false);
  const [activeTradeId, setActiveTradeId] = useState<TradePresetId>('electrical');

  const rootRef = useRef<HTMLDivElement | null>(null);
  const nextRef = useRef(0);
  const elapsedRef = useRef(0);
  const sinceRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const runningRef = useRef(false);

  const activeTrade = TRADE_WORKFLOW_PRESETS[activeTradeId] || TRADE_WORKFLOW_PRESETS.electrical;

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useIsomorphicLayoutEffect(() => {
    setArmed(true);
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
    runningRef.current = false;
    setPlaying(false);
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

  const selectStage = (stageIndex: number) => {
    hold();
    setFinished(false);
    if (stageIndex >= 0 && stageIndex < STAGE_PRESETS.length) {
      setFrame(STAGE_PRESETS[stageIndex]);
    }
  };

  const handleTradeChange = (tId: TradePresetId) => {
    setActiveTradeId(tId);
    start();
  };

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

  const currentStatus = HERO_STATUS[Math.min(frame.statusIndex, HERO_STATUS.length - 1)];
  const activeEvent = frame.eventId ? HERO_EVENTS[frame.eventId - 1] : null;

  // Render current SMS text, adapted to active trade
  const isDefaultTrade = activeTradeId === 'electrical';
  const defaultSms = HERO_SMS[Math.min(frame.smsIndex, HERO_SMS.length - 1)];
  const smsBody = isDefaultTrade
    ? defaultSms.body
    : frame.smsIndex === 0
    ? activeTrade.smsText.quote
    : activeTrade.smsText.booked;
  const smsLink = isDefaultTrade ? defaultSms.link : undefined;

  const jobRef = isDefaultTrade ? HERO_THREAD_JOB : activeTrade.jobRef;
  const clientName = isDefaultTrade ? HERO_THREAD_CLIENT : activeTrade.client;
  const areaName = isDefaultTrade ? HERO_THREAD_AREA : activeTrade.area;
  const tradeTitle = isDefaultTrade ? HERO_THREAD_TRADE : activeTrade.trade;
  const currentStages = isDefaultTrade ? WORKFLOW_STAGES : activeTrade.stages;

  const statusLabel = isDefaultTrade
    ? currentStatus.label
    : frame.statusIndex === 0
    ? 'Quote sent'
    : frame.statusIndex === 1
    ? 'Quote approved'
    : frame.statusIndex === 2
    ? (currentStages[3]?.label || 'Scheduled')
    : 'Booked & Paid';

  return (
    <div className={`hero-thread hero-thread-sim ${styles.sim}`} ref={rootRef}>
      <p className="sr-only">{HERO_SUMMARY}</p>

      {/* Trade Selector Switcher */}
      <div className={styles.tradeBar} role="tablist" aria-label="Select contractor trade">
        {TRADES.map((t) => {
          const isActive = activeTradeId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`${styles.tradeTab} ${isActive ? styles.tradeTabActive : ''}`}
              onClick={() => handleTradeChange(t.id)}
            >
              <span className={styles.tradeTabIcon} aria-hidden="true">
                {t.icon}
              </span>
              <span className={styles.tradeTabLabel}>{t.label}</span>
              {isActive && <span className={styles.tradeActiveGlow} aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      <div
        className={styles.stage}
        aria-hidden="true"
        data-armed={armed ? 'true' : 'false'}
        data-still={stilled ? 'true' : 'false'}
        data-paused={armed && !playing && !finished && !stilled ? 'true' : 'false'}
      >
        {/* Dynamic Multi-Spectrum Ambient Glow */}
        <span className={styles.glow} />
        <span className={styles.glowSecondary} />

        {/* Floating 3D Micro-Badges */}
        <div className={`${styles.floatingPill} ${styles.floatingPillTop}`} data-tone={activeTrade.floatingPillTop.tone}>
          <span className={styles.floatingPillIcon}>{activeTrade.floatingPillTop.icon}</span>
          <div className={styles.floatingPillContent}>
            <strong>{activeTrade.floatingPillTop.title}</strong>
            <small>{activeTrade.floatingPillTop.subtitle}</small>
          </div>
        </div>

        <div className={`${styles.floatingPill} ${styles.floatingPillBottom}`} data-tone={activeTrade.floatingPillBottom.tone}>
          <span className={styles.floatingPillIcon}>{activeTrade.floatingPillBottom.icon}</span>
          <div className={styles.floatingPillContent}>
            <strong>{activeTrade.floatingPillBottom.title}</strong>
            <small>{activeTrade.floatingPillBottom.subtitle}</small>
          </div>
        </div>

        <div className={styles.jobCard}>
          {/* Header with business name, job identifier, and current live status */}
          <div className={styles.cardHeader}>
            <div className={styles.jobMeta}>
              <div className={styles.metaTop}>
                <span className={styles.jobId}>{jobRef}</span>
                <span className={styles.jobDivider}>·</span>
                <span className={styles.jobClient}>{clientName}</span>
                <span className={styles.jobDivider}>·</span>
                <span className={styles.jobArea}>{areaName}</span>
              </div>
              <strong className={styles.tradeTitle}>{tradeTitle}</strong>
            </div>
            <div className={styles.headerControls}>
              <span className={styles.statusBadge} data-tone={currentStatus.tone}>
                <span className={styles.statusDot} />
                {statusLabel}
              </span>
              <button
                type="button"
                className={styles.playPauseToggle}
                onClick={playing ? hold : start}
                title={playing ? 'Pause workflow simulation' : 'Replay workflow simulation'}
                aria-label={playing ? 'Pause workflow' : 'Replay workflow'}
              >
                {playing ? '⏸' : '▶'}
              </button>
            </div>
          </div>

          {/* Interactive 5-Step Unified Workflow Stepper */}
          <div className={styles.stepperWrap}>
            <ol className={styles.stepper}>
              {currentStages.map((stage, idx) => {
                const stepNum = idx + 1;
                const isCompleted = frame.completedStages >= stepNum;
                const isCurrent = frame.completedStages + 1 === stepNum;

                return (
                  <li
                    key={stage.id}
                    className={`${styles.stepItem} ${styles.interactiveStep}`}
                    data-state={isCompleted ? 'completed' : isCurrent ? 'active' : 'pending'}
                    onClick={() => selectStage(idx)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        selectStage(idx);
                      }
                    }}
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
                      <div className={styles.stepMetaRow}>
                        <span className={styles.stepDetail}>{stage.detail}</span>
                        {/* Tactile Micro-Badges per Stage */}
                        {isCompleted && idx === 0 && (
                          <span className={styles.microTagMint}>📸 AI Scanned</span>
                        )}
                        {isCompleted && idx === 1 && (
                          <span className={styles.microTagCyan}>✦ Scope OK</span>
                        )}
                        {isCompleted && idx === 2 && (
                          <span className={styles.microTagMint}>✓ Signed</span>
                        )}
                        {isCompleted && idx === 3 && (
                          <span className={styles.microTagYellow}>📍 Dispatched</span>
                        )}
                        {isCompleted && idx === 4 && (
                          <span className={styles.microTagMint}>💳 Paid ✓</span>
                        )}
                      </div>
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
                  <strong>
                    {isDefaultTrade
                      ? activeEvent.headline
                      : activeEvent.id === 'paid'
                      ? `Deposit received · $${activeTrade.deposit.toLocaleString('en-US')}`
                      : activeEvent.id === 'accepted'
                      ? `${activeTrade.client} approved $${activeTrade.totalQuote.toLocaleString('en-US')} quote`
                      : activeEvent.headline}
                  </strong>
                  <small>{activeEvent.detail}</small>
                </div>
              </div>
            ) : null}
          </div>

          {/* Supporting Evidence: Automated Customer SMS preview */}
          <div className={styles.smsFooter}>
            <div className={styles.smsHeader}>
              <span className={styles.smsBadge}>AUTOMATED CUSTOMER UPDATE</span>
              <span className={styles.smsDelivered}>✓ Sent to {clientName}</span>
            </div>
            <div className={styles.smsBubble}>
              <p>
                <Body body={smsBody} link={smsLink} />
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

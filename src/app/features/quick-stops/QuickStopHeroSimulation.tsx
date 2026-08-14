'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  AUTO_STAGES,
  CHOICE_RESULT,
  CONTRACTOR_TEXT,
  FEE_FORM,
  GATE_STAGE,
  HOMEOWNER_OFFER,
  HOMEOWNER_REQUEST,
  JOB_PANEL,
  PROGRESS_STEPS,
  QUICK_STOP_HERO,
  STAGE_ANNOUNCEMENT,
  START_RATIO,
  OFFER_DELAY,
  stageIndex,
  type HomeownerChoice,
  type QuickStopStage,
} from './quick-stop-hero-script';
import { PREFILLED_FEE_CENTS, formatPriorityFee, readPriorityFee } from './quick-stop-fee';
import styles from './quick-stop-hero-simulation.module.css';

/**
 * The /features/quick-stops hero: one Quick Stop, played out, with the one step
 * that is the contractor's left for them to take.
 *
 * WHAT IT REPLACED. A static card of an offer already sent, parked at "awaiting
 * payment". That is the last frame of the mechanism shown to somebody who has
 * not been told what the mechanism is — and the fee sitting alone on it was the
 * page's oldest problem, because a single number on a page is read as the price
 * of the thing on the page.
 *
 * WHY IT IS NOT THE /features PANEL. That one is aria-hidden and described in a
 * sentence, which is right for a picture that plays by itself. This has a form
 * in it. Everything here is real content a keyboard reaches and a screen reader
 * reads, so the accessibility work is the opposite: nothing is hidden, the
 * automatic arrivals are announced politely, and focus is never moved out from
 * under somebody by a timer.
 *
 * IT TOUCHES NOTHING. No model call, no SMS, no offer, no payment, no schedule.
 * Every string comes from quick-stop-hero-script.ts and the only state that
 * leaves this component is what it draws.
 */

/** useLayoutEffect on the client, useEffect on the server. */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const START_AMOUNT = String(PREFILLED_FEE_CENTS / 100);

export default function QuickStopHeroSimulation() {
  /**
   * THE SERVER RENDERS THE PANEL AS FAR AS THE FORM, and that is also exactly
   * the reduced-motion state.
   *
   * Two problems, one answer. Without JavaScript the panel would otherwise be
   * an empty box, and somebody who has asked for less motion is owed the
   * content rather than the animation. The stage the sequence PAUSES on is the
   * most complete thing that is true before anybody has typed anything, so it
   * serves as both. The layout effect below empties it again before paint when
   * motion is allowed — nothing flashes, because nothing has been drawn yet.
   */
  const [stage, setStage] = useState<QuickStopStage>(GATE_STAGE);
  const [feeCents, setFeeCents] = useState<number | null>(null);
  const [choice, setChoice] = useState<HomeownerChoice | null>(null);
  const [amount, setAmount] = useState(START_AMOUNT);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState('');

  /** True once the client has taken over; gates every entrance animation. */
  const [armed, setArmed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [stilled, setStilled] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const threadRef = useRef<HTMLOListElement | null>(null);
  /** Index of the next automatic stage to fire. */
  const nextRef = useRef(0);
  /** Sequence time already consumed, in ms. Survives a pause. */
  const elapsedRef = useRef(0);
  /** performance.now() at the moment the current wait started. */
  const sinceRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  /** The one-shot wait between the reply and the homeowner's copy of it. Its
   *  own ref, so cleanup cannot miss it while the sequence timer is idle. */
  const offerTimerRef = useRef<number | null>(null);
  /** Whether the automatic run is live, read inside listeners that must not
   *  re-subscribe every time it changes. */
  const runningRef = useRef(false);

  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;

  const at = stageIndex(stage);
  const reached = useCallback((mark: QuickStopStage) => at >= stageIndex(mark), [at]);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  /* Arm before the first paint. Reduced motion is read synchronously rather
     than waiting for the effect below, because "empty the panel" and "leave it
     at the form" have to be decided in the same frame. */
  useIsomorphicLayoutEffect(() => {
    setArmed(true);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setStage('rest');
  }, []);

  /**
   * The automatic run, and it ends at the gate.
   *
   * Absolute times minus time already spent, so pausing and resuming lands on
   * the same clock rather than restarting the current wait.
   */
  const run = useCallback(() => {
    clearTimer();
    const index = nextRef.current;
    if (index >= AUTO_STAGES.length) return;
    sinceRef.current = performance.now();
    timerRef.current = window.setTimeout(
      () => {
        elapsedRef.current = AUTO_STAGES[index].at;
        setStage(AUTO_STAGES[index].stage);
        nextRef.current = index + 1;
        if (index + 1 >= AUTO_STAGES.length) {
          /* THE PAUSE. The number is the contractor's, so the panel stops here
             and waits rather than inventing one and carrying on. */
          runningRef.current = false;
          setPlaying(false);
          return;
        }
        run();
      },
      Math.max(0, AUTO_STAGES[index].at - elapsedRef.current),
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
    setPlaying(true);
    setStage('rest');
    run();
  }, [run]);

  /**
   * Motion is the visitor's call, and it can change while they are here.
   *
   * Turning it on mid-sequence must not rewind somebody who has already
   * submitted, so this only ever moves the panel FORWARD to the gate.
   */
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const decide = () => {
      if (query.matches) {
        runningRef.current = false;
        clearTimer();
        setPlaying(false);
        setStilled(true);
        setStage((current) => (stageIndex(current) < stageIndex(GATE_STAGE) ? GATE_STAGE : current));
      } else {
        setStilled(false);
      }
    };
    decide();
    query.addEventListener('change', decide);
    return () => query.removeEventListener('change', decide);
  }, []);

  /**
   * Start once, when about a third of it is on screen — and pause whenever it
   * is not, or the tab is in the background. Two thresholds on one observer: 0
   * answers "is any of it visible", START_RATIO answers "has somebody arrived".
   *
   * A third rather than the half the /features panel uses: this hero is taller,
   * and half of it is most of a laptop viewport.
   */
  useEffect(() => {
    if (stilled) return;
    const node = rootRef.current;
    if (!node) return;

    if (!('IntersectionObserver' in window)) {
      setStage((current) => (stageIndex(current) < stageIndex(GATE_STAGE) ? GATE_STAGE : current));
      return;
    }

    let begun = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const arrived = entry.intersectionRatio >= START_RATIO;
        const anyOf = entry.intersectionRatio > 0;
        if (arrived && !begun) {
          begun = true;
          start();
          return;
        }
        // Never restarts: `begun` latches, and the gate clears runningRef.
        if (!runningRef.current) return;
        if (anyOf && !document.hidden) run();
        else hold();
      },
      { threshold: [0, START_RATIO] },
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

  /** Every timer this component owns, on the way out. */
  useEffect(
    () => () => {
      clearTimer();
      if (offerTimerRef.current !== null) window.clearTimeout(offerTimerRef.current);
    },
    [],
  );

  /**
   * What gets said out loud, and only for changes worth interrupting.
   *
   * The first run is skipped on purpose: with reduced motion — or with no
   * JavaScript at all — the form is already on the page at mount, and
   * announcing content that was there when the reader arrived is noise.
   */
  const announced = useRef(false);
  useEffect(() => {
    if (!announced.current) {
      announced.current = true;
      return;
    }
    if (stage === 'decided' && choice && feeCents !== null) {
      const result = CHOICE_RESULT[choice];
      setLive(`${result.title}. ${result.body(formatPriorityFee(feeCents))}`);
      return;
    }
    if (stage === 'reply' && feeCents !== null) {
      setLive(`Reply sent: ${formatPriorityFee(feeCents)}.`);
      return;
    }
    const text = STAGE_ANNOUNCEMENT[stage];
    if (text) setLive(text);
  }, [stage, choice, feeCents]);

  /**
   * The one thing the visitor does.
   *
   * Guarded on feeCents rather than on the form being mounted: a second submit
   * can still arrive from a keyboard repeat in the same tick that the first one
   * is being rendered away.
   */
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (feeCents !== null) return;

    const reading = readPriorityFee(amount);
    if (!reading.ok) {
      setError(reading.error);
      return;
    }

    setError(null);
    setFeeCents(reading.cents);
    setStage('reply');

    /* THE FORM IS ABOUT TO UNMOUNT WITH FOCUS INSIDE IT, and focus would land
       on <body> — sending the next Tab back to the top of the document. So it
       moves to the thread the reply appears in: a container, not a control, so
       nothing is activated by accident, and programmatic focus on tabIndex=-1
       does not draw a focus ring. This is the visitor's own action, not one of
       the automatic stages, which are the ones that must never move focus. */
    threadRef.current?.focus();

    offerTimerRef.current = window.setTimeout(() => setStage('offer'), OFFER_DELAY);
  };

  const onChoose = (next: HomeownerChoice) => {
    if (choice) return;
    setChoice(next);
    setStage('decided');
  };

  const feeText = feeCents === null ? '' : formatPriorityFee(feeCents);
  const result = choice ? CHOICE_RESULT[choice] : null;

  return (
    <div
      className={styles.sim}
      ref={rootRef}
      data-armed={armed ? 'true' : 'false'}
      data-still={stilled ? 'true' : 'false'}
      data-paused={armed && !playing && !stilled && at < stageIndex(GATE_STAGE) ? 'true' : 'false'}
    >
      <div className={styles.panel}>
        <div className={styles.head}>
          <span className={styles.avatar} aria-hidden="true">
            LGQ
          </span>
          <span className={styles.who}>
            <b>{QUICK_STOP_HERO.business}</b>
            <small>{QUICK_STOP_HERO.assistantRole}</small>
          </span>
          {/* Chrome. It says the assistant is connected, which is a property of
              the mock rather than information about the product. */}
          <span className={styles.online} aria-hidden="true">
            <i />
            Live
          </span>
        </div>

        <ol className={styles.progress}>
          {PROGRESS_STEPS.map((step) => {
            const done = at >= stageIndex(step.doneAt);
            const active = !done && at >= stageIndex(step.activeAt);
            return (
              <li key={step.label} className={styles.step} data-state={done ? 'done' : active ? 'active' : 'idle'}>
                <span className={styles.stepDot} aria-hidden="true" />
                {step.label}
              </li>
            );
          })}
        </ol>

        {/* Focusable only as a landing place for focus when the form it holds
            is replaced. Not in the tab order. */}
        <ol className={styles.thread} ref={threadRef} tabIndex={-1}>
          {reached('request') ? (
            <li className={styles.row} data-side="in">
              <span className={styles.meta}>
                {QUICK_STOP_HERO.homeowner} · {QUICK_STOP_HERO.area}
              </span>
              <p className={styles.bubbleIn}>{HOMEOWNER_REQUEST}</p>
            </li>
          ) : null}

          {reached('job') ? (
            <li className={styles.row} data-side="full">
              <div className={styles.job}>
                <p className={styles.jobTitle}>{JOB_PANEL.title}</p>
                <p className={styles.jobSub}>{JOB_PANEL.subtitle}</p>
                <ul className={styles.jobFacts}>
                  {JOB_PANEL.facts.map((fact) => (
                    <li key={fact}>{fact}</li>
                  ))}
                </ul>
              </div>
            </li>
          ) : null}

          {reached('text') ? (
            <li className={styles.row} data-side="sys">
              <span className={styles.meta}>To you · text message</span>
              <div className={styles.bubbleSys}>
                {CONTRACTOR_TEXT.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </li>
          ) : null}

          {reached('form') && feeCents === null ? (
            <li className={styles.row} data-side="form">
              <form className={styles.form} onSubmit={onSubmit} noValidate>
                <label className={styles.formLabel} htmlFor={fieldId}>
                  {FEE_FORM.label}
                </label>
                <div className={styles.field}>
                  <span className={styles.prefix} aria-hidden="true">
                    $
                  </span>
                  <input
                    id={fieldId}
                    className={styles.input}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={amount}
                    onChange={(event) => {
                      setAmount(event.target.value);
                      if (error) setError(null);
                    }}
                    aria-invalid={error ? 'true' : undefined}
                    aria-describedby={error ? `${errorId} ${hintId}` : hintId}
                  />
                  <button type="submit" className={styles.send}>
                    {FEE_FORM.submit}
                  </button>
                </div>
                {error ? (
                  <p className={styles.error} id={errorId} role="alert">
                    {error}
                  </p>
                ) : null}
                <p className={styles.hint} id={hintId}>
                  {FEE_FORM.hint}
                </p>
              </form>
            </li>
          ) : null}

          {feeCents !== null ? (
            <li className={styles.row} data-side="out">
              <span className={styles.meta}>You</span>
              <p className={styles.bubbleOut}>{feeText}</p>
            </li>
          ) : null}

          {reached('offer') ? (
            <li className={styles.row} data-side="full">
              <div className={styles.offer}>
                <p className={styles.offerFrom}>{HOMEOWNER_OFFER.from}</p>
                <p className={styles.offerTitle}>{HOMEOWNER_OFFER.title}</p>
                <dl className={styles.offerRows}>
                  <div>
                    <dt>{HOMEOWNER_OFFER.soonestLabel}</dt>
                    <dd>{HOMEOWNER_OFFER.soonest}</dd>
                  </div>
                  <div>
                    <dt>{HOMEOWNER_OFFER.feeLabel}</dt>
                    <dd className={styles.offerFee}>{feeText}</dd>
                  </div>
                </dl>
                <p className={styles.offerSupport}>{HOMEOWNER_OFFER.support}</p>
                <div className={styles.choices}>
                  <button
                    type="button"
                    className={styles.choice}
                    data-tone="accept"
                    disabled={choice !== null}
                    onClick={() => onChoose('priority')}
                  >
                    {HOMEOWNER_OFFER.accept}
                  </button>
                  <button
                    type="button"
                    className={styles.choice}
                    data-tone="regular"
                    disabled={choice !== null}
                    onClick={() => onChoose('regular')}
                  >
                    {HOMEOWNER_OFFER.decline}
                  </button>
                </div>
                {result ? (
                  <div className={styles.result} data-choice={choice ?? undefined}>
                    <p className={styles.resultTitle}>{result.title}</p>
                    <p className={styles.resultBody}>{result.body(feeText)}</p>
                  </div>
                ) : null}
              </div>
            </li>
          ) : null}
        </ol>
      </div>

      {/* Visually hidden, on purpose: the panel has no status row, and the
          things worth saying are said here instead of drawn. */}
      <p className="sr-only" aria-live="polite">
        {live}
      </p>
    </div>
  );
}

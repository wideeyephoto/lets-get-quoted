'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  HERO_CONTEXT,
  HERO_DASHBOARD_EVENTS,
  HERO_RUNTIME,
  HERO_SMS,
  HERO_STATUS,
  HERO_SUMMARY,
  HERO_THREAD_AREA,
  HERO_THREAD_BUSINESS,
  HERO_THREAD_JOB,
} from './hero-thread';
import styles from './cinematic-message-simulation.module.css';

/**
 * The /features hero: one job moving, on a phone-shaped panel.
 *
 * WHY A COMPONENT AND NOT MARKUP. Everything hard here is behavioral. It must
 * start once when somebody can actually see it, stop when they scroll away or
 * switch tabs, resume where it left off rather than jumping, show the finished
 * state immediately to anyone who has asked for less motion, and never leave a
 * dashboard event sitting in the message list after its card has gone. That is
 * a small state machine, and it wants to be in one file with its reasons.
 *
 * THE ONE CLAIM THIS PANEL MAKES, AND THE ONE IT MUST NOT. Blue bubbles are
 * text messages — the real ones, built by lib/sms-templates, opt-out line and
 * all. The mint cards that float over them are things the homeowner did in
 * their own dashboard: accepting the quote, choosing the slot, paying the
 * deposit. Those are not texts and never were. Drawing them as bubbles is the
 * single most misleading thing this hero could do, so they are drawn outside
 * the transcript, labeled with the surface they happened on, and removed
 * again — what they leave behind is the status in the header, which is the
 * actual product behavior being sold.
 *
 * That claim is carried by the CARD's own label ("Customer dashboard", on every
 * one of them) and by the fact that it never enters the message list. It used
 * to be restated in a caption under the panel as well; the caption and the two
 * controls beside it are gone, so the label is the only thing saying it and has
 * to stay on every card.
 *
 * NOT LOOPED, and no longer replayable. It plays once, when somebody scrolls to
 * it. A ten-second sequence restarting forever beside a headline is a thing to
 * look away from, and the Replay button that used to sit under the panel went
 * with the rest of that footer.
 */

/** What is on screen at a given moment. Each step sets the whole thing, so a
 *  missed timer cannot leave the panel in a state no step describes. */
type Frame = {
  /** How many messages have arrived. */
  shown: number;
  /** 1-based index into HERO_DASHBOARD_EVENTS; 0 for none. */
  card: number;
  /** The card is on its way out. */
  leaving: boolean;
  /** Index into HERO_STATUS. */
  status: number;
};

const REST: Frame = { shown: 0, card: 0, leaving: false, status: 0 };
const FINAL: Frame = { shown: HERO_SMS.length, card: 0, leaving: false, status: HERO_STATUS.length - 1 };

/** How long a card takes to fade upward, and the beat after it before the next
 *  message. Long enough to read as leaving, short enough not to be a pause. */
const CARD_EXIT = 380;

/**
 * The sequence, built from the data rather than typed twice.
 *
 * Every entry is an absolute time and the COMPLETE frame at that time. Built by
 * folding the messages, the dashboard cards and the status changes into one
 * sorted list, so the three schedules in hero-thread.ts cannot drift out of
 * order with each other.
 */
const STEPS: { at: number; frame: Frame }[] = (() => {
  const marks: { at: number; apply: (f: Frame) => Frame }[] = [];

  HERO_SMS.forEach((_, index) => {
    marks.push({ at: HERO_SMS[index].at, apply: (f) => ({ ...f, shown: index + 1 }) });
  });

  HERO_DASHBOARD_EVENTS.forEach((event, index) => {
    marks.push({ at: event.at, apply: (f) => ({ ...f, card: index + 1, leaving: false }) });
    marks.push({ at: event.until, apply: (f) => ({ ...f, card: index + 1, leaving: true }) });
    marks.push({ at: event.until + CARD_EXIT, apply: (f) => ({ ...f, card: 0, leaving: false }) });
  });

  HERO_STATUS.forEach((step, index) => {
    if (index === 0) return;
    marks.push({ at: step.at, apply: (f) => ({ ...f, status: index }) });
  });

  marks.sort((a, b) => a.at - b.at);

  let frame = REST;
  return marks.map((mark) => {
    frame = mark.apply(frame);
    return { at: mark.at, frame };
  });
})();

/** Draws the one link in a message as a link without making it one. */
function Body({ body, link }: { body: string; link: string }) {
  if (!link || !body.includes(link)) return <>{body}</>;
  const [before, ...rest] = body.split(link);
  return (
    <>
      {before}
      {/* A span, deliberately. lgq.co/j/1048 is an illustration of a short
          link; an anchor pointing at it would be a dead click in a hero. */}
      <span className={styles.link}>{link}</span>
      {rest.join(link)}
    </>
  );
}

/** useLayoutEffect on the client, useEffect on the server, so arming the panel
 *  happens before paint without warning during SSR. */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export default function CinematicMessageSimulation() {
  /**
   * THE SERVER RENDERS THE FINISHED PANEL, and the client empties it before the
   * first paint.
   *
   * Starting at REST would mean anybody without JavaScript — or anybody looking
   * during the moment before hydration — gets a phone with no messages in it,
   * which is not a worse animation, it is a broken picture. So the markup that
   * ships is the end state, and the layout effect below resets it to REST
   * before the browser paints. Nothing flashes because nothing has been drawn
   * yet, and a reader with no JS keeps the whole story.
   */
  const [frame, setFrame] = useState<Frame>(FINAL);
  /** True once the client has taken over. */
  const [armed, setArmed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [stilled, setStilled] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  /** Index of the next step to fire. */
  const nextRef = useRef(0);
  /** Sequence time already consumed, in ms. Survives a pause. */
  const elapsedRef = useRef(0);
  /** performance.now() at the moment the current wait started. */
  const sinceRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  /** Whether the sequence is meant to be running, read inside listeners that
   *  must not re-subscribe every time it changes. */
  const runningRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  /** Arm before the first paint. Reduced motion is read synchronously here
   *  rather than waiting for the effect below, because "clear the panel" and
   *  "leave it finished" have to be decided in the same frame. */
  useIsomorphicLayoutEffect(() => {
    setArmed(true);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
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
          // The last message is still animating in; the control appears when
          // the sequence is genuinely over rather than when its last timer fires.
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

  /**
   * Motion is the visitor's call, and three separate ways of saying no all
   * count. Answered on the client only, so the first render is the same on both
   * sides and hydration has nothing to disagree about.
   */
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

  /**
   * Start once, when half of it is actually on screen — and pause whenever it
   * is not, or the tab is in the background. Two thresholds on one observer:
   * 0 answers "is any of it visible", 0.5 answers "has somebody arrived at it".
   */
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

  const status = HERO_STATUS[frame.status];
  const card = frame.card ? HERO_DASHBOARD_EVENTS[frame.card - 1] : null;

  return (
    <div className={`hero-thread hero-thread-sim ${styles.sim}`} ref={rootRef}>
      {/* The one thing said out loud. The panel itself is a scripted demo of an
          invented job; narrating it row by row as it animates would announce
          the same half-finished conversation three times. */}
      <p className="sr-only">{HERO_SUMMARY}</p>

      <div
        className={styles.stage}
        aria-hidden="true"
        data-armed={armed ? 'true' : 'false'}
        data-still={stilled ? 'true' : 'false'}
        data-paused={armed && !playing && !finished && !stilled ? 'true' : 'false'}
      >
        <span className={styles.glow} />

        <div className={styles.phone}>
          <div className={styles.head}>
            <span className={styles.headWho}>
              <b>{HERO_THREAD_BUSINESS}</b>
              <small>
                Job {HERO_THREAD_JOB} · {HERO_THREAD_AREA}
              </small>
            </span>
            {/* Permanent, and it only moves forward. What each card leaves
                behind is this. */}
            <span className={styles.status} data-tone={status.tone}>
              {status.label}
            </span>
          </div>

          <div className={styles.context}>
            <span className={styles.contextLabel}>Job context</span>
            <ul>
              {HERO_CONTEXT.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>

          {/* THE THREAD AREA, which is what a card is allowed to cover.
              It is its own positioned box rather than the whole phone: an
              overlay stretched across the shell would sit as happily over the
              header and the composer as over the messages, and the header is
              the one thing that must stay legible while a card is up — it is
              what the card is about to change.

              Bottom-anchored, and only the messages that have arrived are in
              the DOM. A message that exists but is invisible still takes its
              row, which put the first text at the top of an empty panel with
              two blank slots under it. The min-height here is what stops the
              phone growing as the other two land. */}
          <div className={styles.thread}>
            <div className={styles.transcript} data-dim={card ? 'true' : 'false'}>
              <ol className={styles.rows}>
                {HERO_SMS.slice(0, frame.shown).map((message) => (
                  <li key={message.id} className={styles.row}>
                    <p className={styles.bubble}>
                      <Body body={message.body} link={message.link} />
                    </p>
                    <span className={styles.sent}>Delivered</span>
                  </li>
                ))}
              </ol>
            </div>

            {card ? (
              <div className={styles.cardWrap}>
                <div className={styles.card} data-state={frame.leaving ? 'out' : 'in'}>
                  <span className={styles.cardLabel}>
                    <svg viewBox="0 0 16 16" width="11" height="11" focusable="false">
                      <rect x="1" y="2.5" width="14" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M1 6h14" stroke="currentColor" strokeWidth="1.4" />
                    </svg>
                    Customer dashboard
                  </span>
                  <strong>
                    <span className={styles.tick} aria-hidden="true">
                      ✓
                    </span>
                    {card.headline}
                  </strong>
                  <small>{card.detail}</small>
                </div>
              </div>
            ) : null}
          </div>

          {/* Drawn, not usable: nothing in this panel is a control. */}
          <div className={styles.composer}>
            <span className={styles.composerBox}>Message</span>
            <span className={styles.composerSend} aria-hidden="true">
              ↑
            </span>
          </div>
          <span className={styles.homeBar} />
        </div>
      </div>

    </div>
  );
}

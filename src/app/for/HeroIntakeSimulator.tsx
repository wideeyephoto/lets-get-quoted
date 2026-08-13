'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  INTAKE_ESTIMATE,
  INTAKE_QUESTIONS,
  INTAKE_SUMMARY,
  LOOP_AT,
  RESULT_AT,
  frameAt,
  type IntakeFrame,
} from '@/lib/intake-simulator';
import styles from './intake-simulator.module.css';

/**
 * THE HERO, SHOWING THE PRODUCT WORKING RATHER THAN A PHOTOGRAPH OF IT.
 *
 * What was here was a cut-out of a laptop and a phone with the quote builder on
 * their screens — a picture of software, which is the one thing every software
 * marketing page has and the one thing none of them can be checked on. This
 * plays the actual first minute of the product instead: a homeowner types what
 * they want, the estimator asks three questions, and a range comes back. That
 * is the whole promise of the page, performed in eighteen seconds.
 *
 * IT IS A DEMONSTRATION AND IT SAYS SO. Nothing is submitted, no endpoint is
 * called, and there is no pricing model behind the number — the transcript is
 * fixed and lives in lib/intake-simulator. The card carries a "Demo" mark for
 * the same reason: a hero that could be mistaken for a live form is a hero that
 * collects a homeowner's lawn size and drops it on the floor.
 *
 * WHY IT IS REACT AND NOT THE SUPPLIED WEB COMPONENT. The framework-free custom
 * element was the fallback for a codebase that could not take one natively.
 * This one can, and going native buys three things the wrapper could not: the
 * transcript becomes testable data rather than a string inside a template
 * literal, the photograph goes through next/image (so the hero's LCP is a
 * resized, format-negotiated WebP rather than a full-size fetch), and the page
 * ships no second copy of a rendering engine.
 *
 * THE FOUR RULES IT KEEPS, all of them the same ones HeroParallax keeps:
 *   - one rAF in flight, and a frame that draws nothing does not re-render
 *   - nothing runs while the panel is off screen or the tab is in the background
 *   - prefers-reduced-motion never starts it; the finished estimate is the frame
 *   - it works with JS off, because the server already renders that same frame
 */

/**
 * THE SERVER FRAME IS THE LAST ONE, NOT THE FIRST.
 *
 * Rendering `frameAt(0)` on the server would be correct and useless: an empty
 * field and no conversation, which is what a reader with a slow connection, a
 * blocked bundle or a reduced-motion setting would be left looking at — and it
 * is the page's LCP element. The finished estimate is a complete picture of
 * what the product does, so that is what gets painted first and what stays if
 * nothing ever animates. Hydration matches because the client starts here too
 * and only rewinds once it has decided motion is wanted.
 */
const RESTING = frameAt(RESULT_AT);

export default function HeroIntakeSimulator() {
  const [frame, setFrame] = useState<IntakeFrame>(RESTING);
  const [playing, setPlaying] = useState(false);
  /** On screen and in a foreground tab. Both, or the loop is burning frames. */
  const [awake, setAwake] = useState(true);
  const elapsed = useRef(RESULT_AT);
  const rootRef = useRef<HTMLDivElement>(null);

  /**
   * WHY THERE IS A COUNTER HERE AND NOT JUST A REF.
   *
   * Replay used to write `elapsed.current = 0` and call `setPlaying(true)`,
   * which is correct and did nothing whatsoever while the demo was already
   * playing: `true` is not a change, the loop effect below does not re-run, and
   * its `base` and `startedAt` are still the ones it captured however long ago
   * — so the very next frame recomputed the clock from those and put the demo
   * straight back where it was. Measured with the page open: pressing Replay
   * four seconds in moved nothing at all.
   *
   * The counter always changes, so the loop always tears down and starts again
   * from the mark the button asked for. That mark travels in a ref rather than
   * in `elapsed` directly because a frame already queued from the OLD loop can
   * still fire between the click and React committing, and it would overwrite
   * anything the handler wrote. The effect applies the seek after the cancel,
   * which is the only point at which nothing else is running.
   */
  const [run, setRun] = useState(0);
  const seek = useRef<number | null>(null);

  /**
   * Rewind and play — unless the reader has asked for less motion, in which
   * case the resting frame above is already the right answer and this does
   * nothing at all. Replay still works afterwards: motion somebody presses a
   * button for is not the motion the setting is about.
   */
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    seek.current = 0;
    setFrame(frameAt(0));
    setPlaying(true);
    setRun((value) => value + 1);
  }, []);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;

    let visible = !document.hidden;
    let intersecting = true;
    const sync = () => setAwake(visible && intersecting);

    const observer = new IntersectionObserver(
      ([entry]) => {
        intersecting = entry.isIntersecting;
        sync();
      },
      { threshold: 0 },
    );
    observer.observe(node);

    const onVisibility = () => {
      visible = !document.hidden;
      sync();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    // After the old loop's frame has been cancelled and before the new one's
    // first tick — the one moment nothing else is writing to the clock.
    if (seek.current !== null) {
      elapsed.current = seek.current;
      seek.current = null;
    }
    if (!playing || !awake) return;

    let raf = 0;
    // Read once. Resuming after a pause, a hidden tab or a scroll away picks up
    // from wherever the clock was left rather than from the top.
    const base = elapsed.current;
    const startedAt = performance.now();

    const tick = () => {
      elapsed.current = (base + performance.now() - startedAt) % LOOP_AT;
      const next = frameAt(elapsed.current);
      // Most frames draw nothing new — the typing advances one character every
      // 52ms, so at 60fps two frames in three are identical to the last.
      setFrame((current) => (current.signature === next.signature ? current : next));
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, awake, run]);

  const replay = useCallback(() => {
    seek.current = 0;
    setFrame(frameAt(0));
    setPlaying(true);
    setRun((value) => value + 1);
  }, []);

  const toggle = useCallback(() => setPlaying((value) => !value), []);

  const showEstimate = useCallback(() => {
    seek.current = RESULT_AT;
    setFrame(RESTING);
    setPlaying(false);
    setRun((value) => value + 1);
  }, []);

  return (
    <div className={styles.panel} ref={rootRef}>
      {/* THE PHOTOGRAPH, AND WHY IT IS ANCHORED RIGHT. The homeowner stands in
          the right third of the frame and the left two thirds are a dark
          kitchen wall — the shot was composed for exactly this. `object-position:
          right` means every crop the panel asks for is taken off that empty
          wall, so she is never cut in half no matter how narrow it gets. */}
      <Image
        className={styles.photo}
        src="/for/homeowner-estimate.webp"
        alt="A homeowner in her kitchen, asking for an estimate on her phone."
        fill
        priority
        sizes="(max-width: 980px) 92vw, 56vw"
      />
      {/* Dark on the left, clear on the right: the card has to be legible and
          she has to still be lit. One gradient does both. */}
      <div className={styles.veil} aria-hidden="true" />

      <section className={styles.card} aria-label="A demonstration of the AI estimator answering a homeowner">
        <header className={styles.head}>
          <div className={styles.headText}>
            <h2 className={styles.title}>Instant estimate</h2>
            <p className={styles.stage}>
              {frame.done ? 'Your estimate is ready' : `Question ${frame.question} of ${INTAKE_QUESTIONS}`}
            </p>
          </div>
          {/* Decorative twin of the line above — the stage is already said in
              words, and three unlabelled bars announced one at a time is noise. */}
          <span className={styles.steps} aria-hidden="true">
            {Array.from({ length: INTAKE_QUESTIONS }, (_, index) => (
              <i key={index} className={index < frame.question ? styles.stepOn : undefined} />
            ))}
          </span>
        </header>

        {frame.done ? (
          <div className={styles.result}>
            <p className={styles.ready}>
              <span className={styles.tick} aria-hidden="true">
                ✓
              </span>
              Estimate ready
            </p>
            <p className={styles.kicker}>Estimated range</p>
            <p className={styles.price}>{INTAKE_ESTIMATE}</p>
            <p className={styles.summary}>{INTAKE_SUMMARY}</p>
            <ol className={styles.next}>
              <li>
                <b>Lead captured</b>
                <span>The request lands in the contractor&rsquo;s dashboard.</span>
              </li>
              <li>
                <b>Quote sent</b>
                <span>Line items, priced from their own rates.</span>
              </li>
              <li>
                <b>Job booked</b>
                <span>Approved, scheduled, and paid through Stripe.</span>
              </li>
            </ol>
          </div>
        ) : (
          <div className={styles.intake}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>
                <span>What do you need?</span>
                <span>{frame.projectPct}%</span>
              </span>
              <p className={styles.fieldValue}>
                {frame.project}
                {frame.projectTyping ? <i className={styles.caret} aria-hidden="true" /> : null}
              </p>
            </div>

            {/**
             * THE CONVERSATION, ANNOUNCED ONCE EACH.
             *
             * A live region containing text that is being typed a character at
             * a time would announce "M", "Mo", "Mow" — a polite region firing
             * twenty times for one sentence. So a bubble that is still typing
             * is hidden from the region entirely; the attribute drops when the
             * line is finished, which exposes the complete sentence in one
             * mutation and gets it read once, the way a person would say it.
             */}
            <div className={styles.thread} aria-live="polite">
              {frame.bubbles.map((bubble) => (
                <p
                  key={bubble.turn}
                  className={`${styles.bubble} ${bubble.role === 'ai' ? styles.fromAi : styles.fromHomeowner}`}
                >
                  <b className={styles.who}>{bubble.role === 'ai' ? 'AI estimator' : 'Homeowner'}</b>
                  <span className={styles.said} aria-hidden={bubble.typing ? 'true' : undefined}>
                    {bubble.text}
                    {bubble.typing ? <i className={styles.caret} /> : null}
                  </span>
                </p>
              ))}
            </div>

            {/* Outside the live region on purpose: "AI is thinking" four times a
                loop is the definition of a chatty announcement, and the answer
                that follows it says everything the dots were standing in for. */}
            <p className={`${styles.thinking} ${frame.thinking ? styles.thinkingOn : ''}`} aria-hidden="true">
              Thinking
              <i />
              <i />
              <i />
            </p>
          </div>
        )}

        <footer className={styles.controls}>
          <p className={styles.disclaimer}>Demo &mdash; nothing is submitted</p>
          <span className={styles.buttons}>
            <button type="button" className={styles.control} onClick={replay}>
              Replay
            </button>
            <button type="button" className={styles.control} onClick={toggle}>
              {playing ? 'Pause' : 'Resume'}
            </button>
            <button type="button" className={`${styles.control} ${styles.controlPrimary}`} onClick={showEstimate}>
              Show estimate
            </button>
          </span>
        </footer>
      </section>
    </div>
  );
}

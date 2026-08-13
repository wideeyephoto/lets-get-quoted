import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HOLD_MS,
  INTAKE_BEATS,
  INTAKE_ESTIMATE,
  INTAKE_PROJECT,
  INTAKE_QUESTIONS,
  INTAKE_SUMMARY,
  INTAKE_TURNS,
  LOOP_AT,
  PROJECT_FROM,
  PROJECT_TO,
  RESULT_AT,
  frameAt,
} from '@/lib/intake-simulator';

/**
 * The /for hero's instant-estimate demonstration.
 *
 * WHAT THIS FILE IS FOR. The panel is eighteen seconds of animation in a hero,
 * which is the hardest kind of thing to check by looking at it — a frame that
 * is wrong for four hundred milliseconds is invisible to a person and obvious
 * to a clock. Because the transcript and its timing are a pure function of
 * elapsed milliseconds, every one of those moments can simply be asked for.
 *
 * The rest is the two promises the page makes about it: that it is a
 * demonstration and submits nothing, and that a reader who asked for less
 * motion is given the finished estimate rather than an empty form.
 */

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

/* This repo writes long WHY comments that quote the code they explain, so a
   bare toContain would happily match the comment instead. */
const stripJs = (source: string) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const COMPONENT = stripJs(read('src', 'app', 'for', 'HeroIntakeSimulator.tsx'));
const MODULE = stripJs(read('src', 'lib', 'intake-simulator.ts'));
const CSS = read('src', 'app', 'for', 'intake-simulator.module.css').replace(/\/\*[\s\S]*?\*\//g, '');

/* ===========================================================================
   1. The transcript is the one that was asked for
   ======================================================================== */
describe('the script', () => {
  it('opens on the project the homeowner typed', () => {
    expect(INTAKE_PROJECT).toBe('Lawn care');
  });

  it('runs the three questions and the three answers, in order', () => {
    expect(INTAKE_TURNS.map((turn) => turn.text)).toEqual([
      'Absolutely. What would you like done — mowing, edging, cleanup, or something else?',
      'Mowing and edging.',
      'About how large is the lawn?',
      'About an acre.',
      'How often would you like the service?',
      'Every two weeks.',
    ]);
    expect(INTAKE_TURNS.map((turn) => turn.role)).toEqual([
      'ai',
      'homeowner',
      'ai',
      'homeowner',
      'ai',
      'homeowner',
    ]);
  });

  it('lands on the range, with an en dash rather than a hyphen', () => {
    expect(INTAKE_ESTIMATE).toBe('$100–$180');
    // A hyphen between two dollar figures reads as a minus at 46px.
    expect(INTAKE_ESTIMATE).not.toContain('-');
  });

  /* Three questions asked, three bars drawn. Counted rather than typed, so a
     fourth question cannot leave the progress bar claiming there are three. */
  it('counts the bars off the questions', () => {
    expect(INTAKE_QUESTIONS).toBe(3);
    expect(MODULE).toContain("INTAKE_TURNS.filter((turn) => turn.role === 'ai').length");
  });
});

/* ===========================================================================
   2. The clock
   ======================================================================== */
describe('the timing', () => {
  /* Every "at 5000ms" in a hand-authored timeline is a number that stops
     matching its line the moment the copy changes, and an answer two words
     longer starts being cut off by the question after it. */
  it('derives every mark from the text rather than carrying typed offsets', () => {
    // A homeowner's line takes longer to type than a shorter one, always.
    const typed = INTAKE_BEATS.filter((beat) => beat.role === 'homeowner');
    const byLength = [...typed].sort((a, b) => a.text.length - b.text.length);
    const byDuration = [...typed].sort((a, b) => a.to - a.from - (b.to - b.from));
    expect(byDuration.map((beat) => beat.text)).toEqual(byLength.map((beat) => beat.text));
  });

  it('never lets one beat start before the last one finished', () => {
    let previous = PROJECT_TO;
    for (const beat of INTAKE_BEATS) {
      expect(beat.from, beat.text).toBeGreaterThan(previous);
      expect(beat.to).toBeGreaterThanOrEqual(beat.from);
      previous = beat.to;
    }
    expect(RESULT_AT).toBeGreaterThan(previous);
  });

  it('holds the estimate before looping, and loops after it', () => {
    expect(LOOP_AT - RESULT_AT).toBe(HOLD_MS);
    expect(HOLD_MS).toBeGreaterThanOrEqual(4000);
    // Long enough to read six messages and a price, short enough to see twice.
    expect(LOOP_AT).toBeGreaterThan(12_000);
    expect(LOOP_AT).toBeLessThan(30_000);
  });

  /* The AI does not type, it thinks and then arrives. The homeowner types. */
  it('gives the AI dots and the homeowner a keyboard', () => {
    for (const beat of INTAKE_BEATS) {
      if (beat.role === 'ai') {
        expect(beat.to, beat.text).toBe(beat.from);
        expect(beat.thinkingFrom, beat.text).toBeLessThan(beat.from);
      } else {
        expect(beat.to, beat.text).toBeGreaterThan(beat.from);
        expect(beat.thinkingFrom, beat.text).toBeNull();
      }
    }
  });
});

/* ===========================================================================
   3. Any single frame of it
   ======================================================================== */
describe('frameAt', () => {
  it('starts on an empty field with nothing said', () => {
    const frame = frameAt(0);
    expect(frame.project).toBe('');
    expect(frame.projectPct).toBe(0);
    expect(frame.bubbles).toEqual([]);
    expect(frame.done).toBe(false);
    expect(frame.question).toBe(1);
  });

  it('types the project in, and only counts what is on screen', () => {
    const half = frameAt((PROJECT_FROM + PROJECT_TO) / 2);
    expect(half.project.length).toBeGreaterThan(0);
    expect(half.project.length).toBeLessThan(INTAKE_PROJECT.length);
    expect(INTAKE_PROJECT.startsWith(half.project)).toBe(true);
    expect(half.projectPct).toBeGreaterThan(0);
    expect(half.projectPct).toBeLessThan(100);
    expect(half.projectTyping).toBe(true);

    const settled = frameAt(PROJECT_TO + 1);
    expect(settled.project).toBe(INTAKE_PROJECT);
    expect(settled.projectPct).toBe(100);
    expect(settled.projectTyping).toBe(false);
  });

  /**
   * NOTHING IS EVER HALF-SAID BY THE AI.
   *
   * The homeowner's lines are typed a character at a time and the AI's are not.
   * A partially rendered question would read as the estimator stammering, and
   * would also be announced by the live region as a fragment.
   */
  it('never shows a partial question', () => {
    for (let at = 0; at < RESULT_AT; at += 40) {
      for (const bubble of frameAt(at).bubbles) {
        if (bubble.role !== 'ai') continue;
        expect(bubble.text, `at ${at}ms`).toBe(INTAKE_TURNS[bubble.turn].text);
        expect(bubble.typing, `at ${at}ms`).toBe(false);
      }
    }
  });

  /* Every prefix is a real prefix, and it only ever grows. */
  it('types the answers forward and never backward', () => {
    for (const beat of INTAKE_BEATS) {
      if (beat.role !== 'homeowner') continue;
      let last = 0;
      for (let at = beat.from; at <= beat.to + 40; at += 25) {
        const bubble = frameAt(at).bubbles.find((one) => one.turn === beat.turn);
        expect(bubble, `${beat.text} missing at ${at}ms`).toBeDefined();
        expect(beat.text.startsWith(bubble!.text)).toBe(true);
        expect(bubble!.text.length).toBeGreaterThanOrEqual(last);
        last = bubble!.text.length;
      }
      expect(last).toBe(beat.text.length);
    }
  });

  /**
   * THE BAR ADVANCES WHEN A QUESTION LANDS, not when one is answered — while
   * the homeowner is typing a reply, the question they are replying to is still
   * the current one, and a bar that moved on the answer would be a step ahead
   * of the conversation for the whole of every typed line.
   */
  it('counts the question being worked on, and never overruns three', () => {
    const questions = INTAKE_BEATS.filter((beat) => beat.role === 'ai');
    expect(frameAt(questions[0].from - 1).question).toBe(1);
    expect(frameAt(questions[0].from + 1).question).toBe(1);
    expect(frameAt(questions[1].from + 1).question).toBe(2);
    expect(frameAt(questions[2].from + 1).question).toBe(3);
    expect(frameAt(RESULT_AT - 1).question).toBe(3);
  });

  it('shows the dots before each answer and never alongside the estimate', () => {
    for (const beat of INTAKE_BEATS) {
      if (beat.thinkingFrom === null) continue;
      expect(frameAt(beat.thinkingFrom + 10).thinking, beat.text).toBe(true);
      expect(frameAt(beat.from + 10).thinking, beat.text).toBe(false);
    }
    // And the long one, while the price is being worked out.
    expect(frameAt(RESULT_AT - 100).thinking).toBe(true);
    expect(frameAt(RESULT_AT).thinking).toBe(false);
  });

  /**
   * THE QUESTIONS AND THE PRICE ARE NEVER ON SCREEN TOGETHER.
   *
   * Not a styling preference — a card showing a finished estimate above a
   * conversation that is still going is showing a price for a question nobody
   * has answered yet.
   */
  it('clears the conversation the instant the estimate lands', () => {
    expect(frameAt(RESULT_AT - 1).done).toBe(false);
    expect(frameAt(RESULT_AT - 1).bubbles.length).toBe(INTAKE_TURNS.length);
    expect(frameAt(RESULT_AT).done).toBe(true);
    expect(frameAt(RESULT_AT).bubbles).toEqual([]);
    expect(frameAt(LOOP_AT - 1).done).toBe(true);
  });

  /* The whole point of the signature: identical frames must compare equal, or
     the rAF loop re-renders sixty times a second for nothing. */
  it('signs identical frames identically and changed ones differently', () => {
    expect(frameAt(RESULT_AT + 10).signature).toBe(frameAt(RESULT_AT + 900).signature);
    expect(frameAt(0).signature).not.toBe(frameAt(RESULT_AT).signature);

    let changes = 0;
    let previous = '';
    for (let at = 0; at <= LOOP_AT; at += 16) {
      const { signature } = frameAt(at);
      if (signature !== previous) changes += 1;
      previous = signature;
    }
    // ~1,100 frames in a loop. Anything near that number means the signature is
    // not collapsing anything and the guard is doing no work.
    expect(changes).toBeGreaterThan(30);
    expect(changes).toBeLessThan(400);
  });

  it('is clamped rather than undefined before zero', () => {
    expect(frameAt(-5000)).toEqual(frameAt(0));
  });
});

/* ===========================================================================
   4. It is a demonstration, and it says so
   ======================================================================== */
describe('the panel makes no claim it cannot keep', () => {
  it('submits nothing and calls nothing', () => {
    for (const forbidden of ['fetch(', 'action=', '<form', 'XMLHttpRequest', 'navigator.sendBeacon']) {
      expect(COMPONENT, forbidden).not.toContain(forbidden);
    }
    // No inputs either — a hero that looks like a live form is a hero that
    // collects a homeowner's lawn size and drops it on the floor.
    expect(COMPONENT).not.toContain('<input');
    expect(COMPONENT).not.toContain('<textarea');
  });

  it('marks itself a demo on the card', () => {
    expect(COMPONENT).toContain('Demo &mdash; nothing is submitted');
  });

  it('calls the number a range and says who confirms the real one', () => {
    expect(INTAKE_SUMMARY).toContain('estimated range');
    expect(INTAKE_SUMMARY).toContain('the contractor confirms the final price');
    expect(COMPONENT).toContain('Estimated range');
  });
});

/* ===========================================================================
   5. Motion, and the people who asked for less of it
   ======================================================================== */
describe('the loop', () => {
  /**
   * The server frame is the LAST one, not the first. `frameAt(0)` would be an
   * empty field and no conversation — correct, and the page's LCP element. The
   * finished estimate is a complete picture of what the product does, so that
   * is what gets painted first and what stays if nothing ever animates.
   */
  it('renders the finished estimate on the server', () => {
    expect(COMPONENT).toContain('const RESTING = frameAt(RESULT_AT)');
    expect(COMPONENT).toContain('useState<IntakeFrame>(RESTING)');
    expect(COMPONENT).toContain('useState(false)');
  });

  it('never starts for anybody who asked for less motion', () => {
    expect(COMPONENT).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
    const guard = COMPONENT.slice(COMPONENT.indexOf("matchMedia('(prefers-reduced-motion"));
    // Returns BEFORE it rewinds and plays — the estimate stays up.
    expect(guard.slice(0, guard.indexOf('\n'))).toContain('return');
  });

  it('stops while the panel is off screen or the tab is in the background', () => {
    expect(COMPONENT).toContain('new IntersectionObserver');
    expect(COMPONENT).toContain('intersecting = entry.isIntersecting');
    expect(COMPONENT).toContain("document.addEventListener('visibilitychange'");
    expect(COMPONENT).toContain('if (!playing || !awake) return;');
  });

  it('tears the frame and both listeners back down', () => {
    expect(COMPONENT).toContain('cancelAnimationFrame(raf)');
    expect(COMPONENT).toContain('observer.disconnect()');
    expect(COMPONENT).toContain("document.removeEventListener('visibilitychange'");
  });

  /**
   * REPLAY HAS TO RESTART A RUNNING LOOP.
   *
   * `setPlaying(true)` while already playing is not a state change, so the
   * effect does not re-run, so its captured `base` and `startedAt` are still
   * the old ones and the next frame puts the demo straight back where it was.
   * Measured before the fix: pressing Replay four seconds in moved nothing.
   */
  it('restarts through a counter rather than through a boolean that is already true', () => {
    expect(COMPONENT).toContain('setRun((value) => value + 1)');
    expect(COMPONENT).toContain('}, [playing, awake, run]);');
    // And the mark travels in a ref the effect applies after the cancel, so a
    // frame queued from the old loop cannot overwrite it.
    expect(COMPONENT).toContain('seek.current = 0;');
    expect(COMPONENT).toContain('seek.current = RESULT_AT;');
    expect(COMPONENT).toContain('elapsed.current = seek.current;');
  });

  it('draws only when something changed', () => {
    expect(COMPONENT).toContain('current.signature === next.signature ? current : next');
  });

  it('carries all three controls, and they are real buttons', () => {
    for (const label of ['Replay', 'Show estimate']) {
      expect(COMPONENT, label).toContain(`>\n              ${label}\n            </button>`);
    }
    expect(COMPONENT).toContain("{playing ? 'Pause' : 'Resume'}");
    expect(COMPONENT).not.toContain('<div onClick');
  });
});

/* ===========================================================================
   6. The surface
   ======================================================================== */
describe('the card', () => {
  const rule = (selector: string) => {
    const at = CSS.indexOf(`\n${selector} {`);
    expect(at, `no rule for ${selector}`).toBeGreaterThan(-1);
    return CSS.slice(at, CSS.indexOf('}', at));
  };

  /* The brief pins these four values. They are the panel's whole identity
     against the page's orange, and a hand-tweak to any of them is a change to
     the design rather than to the code. */
  it('draws the blue-violet edge and its three glows exactly as specified', () => {
    const card = rule('.card');
    expect(card).toContain('border: 1px solid rgba(124, 90, 224, 0.72)');
    expect(card).toContain('0 0 16px rgba(124, 90, 224, 0.38)');
    expect(card).toContain('0 0 46px rgba(91, 111, 238, 0.26)');
    expect(card).toContain('0 0 82px rgba(58, 160, 255, 0.12)');
  });

  /**
   * IT DECLARES ITS OWN PALETTE.
   *
   * Every token here is also on .page in for.module.css and would be inherited
   * from there — which is exactly the trap this project has been bitten by four
   * times: `var(--x)` with no definition in scope is not a fallback to
   * something reasonable, it is an invalid substitution, and the whole
   * declaration computes to `unset`. A border silently disappears.
   */
  it('defines every custom property it reads', () => {
    const declared = new Set([...CSS.matchAll(/(--[a-z0-9-]+):/g)].map((match) => match[1]));
    const used = new Set([...CSS.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]));
    for (const token of used) {
      // --font-display is the one deliberate exception and carries a fallback.
      if (token === '--font-display') continue;
      expect(declared.has(token), `${token} is read but never declared`).toBe(true);
    }
  });

  /* Navy on the orange, never white. #071521 on #ff5a12 is 5.9:1 and white on
     the same orange is 3.1:1 — the same reading the page's primary button uses. */
  it('puts navy on every orange fill', () => {
    expect(rule('.fromHomeowner .said')).toContain('color: #071521');
    expect(rule('.controlPrimary')).toContain('color: #071521');
  });

  it('keeps the 44px target floor the rest of the page keeps', () => {
    expect(rule('.control')).toContain('min-height: 44px');
    expect(CSS).toContain('.control:focus-visible');
    expect(CSS).toContain('outline: 2px solid var(--flare)');
  });

  /**
   * THE THREAD LOSES ITS OLDEST LINE, NEVER ITS NEWEST.
   *
   * `justify-content: flex-end` with the overflow hidden means a conversation
   * taller than its box goes off the TOP, the way a chat window does. Capping
   * the height and letting it clip downwards would cut the sentence that just
   * arrived in half — the one message anybody is actually reading.
   */
  it('drops old messages off the top rather than cutting new ones off the bottom', () => {
    const thread = rule('.thread');
    expect(thread).toContain('justify-content: flex-end');
    expect(thread).toContain('overflow: hidden');
    expect(thread).toContain('min-height: 0');
    // Sizes to its content and gives space back under pressure; `flex: 1` made
    // it claim the whole card while it was still empty.
    expect(thread).toContain('flex: 0 1 auto');
  });

  /* Safari has never shipped the unprefixed property, and there the whole
     declaration is dropped — the fade silently is not there. */
  it('prefixes the mask for Safari', () => {
    expect(rule('.thread')).toContain('-webkit-mask-image:');
    expect(rule('.thread')).toContain('\n  mask-image:');
  });

  /**
   * `relative`, and NEVER `static`. The photograph and the veil are both
   * absolutely positioned, and positioned elements paint above the backgrounds
   * AND the inline content of every non-positioned box beside them — so a
   * static card went under the picture entirely, and the only things left on
   * screen were the bubbles, which carry a transform from their entrance
   * animation and were lifted into the same paint step as the photo.
   */
  it('keeps the mobile card in the same paint step as the photograph', () => {
    const narrow = CSS.slice(CSS.indexOf('@media (max-width: 640px)'));
    const card = narrow.slice(narrow.indexOf('.card {'), narrow.indexOf('}', narrow.indexOf('.card {')));
    expect(card).toContain('position: relative');
    expect(card).not.toContain('position: static');
    // The desktop rule pins all four sides; relative would apply them as offsets.
    expect(card).toContain('inset: auto');
    /* And a FIXED height. Left to its content the card was 495px with three
       messages, 598 with six and 416 under the estimate, so the panel grew and
       shrank twice a loop and took the page below it along for the ride. */
    expect(card).toMatch(/height: \d+px/);
  });
});

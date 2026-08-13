/**
 * The /for hero's instant-estimate demonstration, as data.
 *
 * WHY THIS IS A MODULE AND NOT JUST A COMPONENT. What plays in the hero is a
 * scripted conversation on a clock, and a clock is the one thing you cannot see
 * by looking at a rendered frame. Pulled out here it is an ordinary pure
 * function — `frameAt(ms)` — so every moment of the eighteen seconds can be
 * asserted directly, including the ones a human would have to catch by eye:
 * that nothing is announced before it is typed, that the estimate is never on
 * screen while the questions still are, that the loop returns to a clean slate.
 *
 * NOTHING HERE IS AN ESTIMATOR. There is no pricing model behind the number
 * below and there is not meant to be. This is a demonstration of the intake
 * flow, playing one fixed transcript, and it submits nothing and calls nothing.
 * The real thing lives at /features/ai-intake.
 *
 * THE TIMINGS ARE DERIVED, NOT TYPED. Every "at 5000ms" in a hand-authored
 * timeline is a number that silently stops matching its line the moment the
 * copy changes — an answer that got two words longer starts being cut off by
 * the question after it. So the schedule is built from the text itself: typing
 * costs per character, and each beat starts when the one before it finished.
 * Editing a line re-times the whole sequence for free.
 */

export type IntakeRole = 'homeowner' | 'ai';

export type IntakeTurn = { readonly role: IntakeRole; readonly text: string };

/** What the homeowner types into the first field, before any question. */
export const INTAKE_PROJECT = 'Lawn care';

/**
 * The range the demo lands on.
 *
 * An en dash, not a hyphen: this is a span of values, which is what the en dash
 * is for, and at this size a hyphen between two dollar figures reads as a minus.
 */
export const INTAKE_ESTIMATE = '$100–$180';

/**
 * What the number is based on, said in the demo itself.
 *
 * A price with no basis under it is the thing homeowners distrust about
 * contractor quotes in the first place, and a marketing hero that reproduces
 * that is selling the wrong feeling. It also says "estimated range" out loud,
 * because that is what this is and the page should not imply a booked price.
 */
export const INTAKE_SUMMARY =
  'Mowing and edging, about an acre, every two weeks. An estimated range — the contractor confirms the final price.';

/** The transcript, in order. Question, answer, question, answer, question, answer. */
export const INTAKE_TURNS: readonly IntakeTurn[] = [
  { role: 'ai', text: 'Absolutely. What would you like done — mowing, edging, cleanup, or something else?' },
  { role: 'homeowner', text: 'Mowing and edging.' },
  { role: 'ai', text: 'About how large is the lawn?' },
  { role: 'homeowner', text: 'About an acre.' },
  { role: 'ai', text: 'How often would you like the service?' },
  { role: 'homeowner', text: 'Every two weeks.' },
];

/** How many questions the progress bars count. Three, and the transcript asks three. */
export const INTAKE_QUESTIONS = INTAKE_TURNS.filter((turn) => turn.role === 'ai').length;

/* -------------------------------------------------------------------------
   The clock
   ---------------------------------------------------------------------- */

/** A beat of quiet before the first character, so the field is seen empty first. */
const FIELD_AT = 320;

/**
 * Typing speed. ~19 characters a second — brisk, and deliberately not the
 * 8-or-so a real thumb manages: this plays on a loop in a hero, and a
 * transcript typed at true speed would take the better part of a minute.
 */
const MS_PER_CHAR = 52;

/** How long the dots run before an answer arrives. */
const AI_THINKING_MS = 900;

/** After a question appears, before the homeowner starts typing back. Reading time. */
const READ_MS = 850;

/** After the homeowner stops typing, before the AI starts thinking. */
const SETTLE_MS = 480;

/**
 * The last pause, which is longer than the other three on purpose: it is the
 * only one where something is actually being worked out rather than read.
 */
const ESTIMATE_MS = 1500;

/** How long the estimate stays up before the loop starts over. */
export const HOLD_MS = 5200;

export type IntakeBeat = {
  /** Index into INTAKE_TURNS. */
  readonly turn: number;
  readonly role: IntakeRole;
  readonly text: string;
  /** When the bubble first exists. */
  readonly from: number;
  /** When it is complete. Equal to `from` for the AI, which does not type. */
  readonly to: number;
  /** When the dots start ahead of it. Null for the homeowner, who has none. */
  readonly thinkingFrom: number | null;
};

function buildSchedule() {
  const beats: IntakeBeat[] = [];
  // The project field types first, and everything else queues behind it.
  let cursor = FIELD_AT + INTAKE_PROJECT.length * MS_PER_CHAR + SETTLE_MS;

  for (const [turn, { role, text }] of INTAKE_TURNS.entries()) {
    if (role === 'ai') {
      const from = cursor + AI_THINKING_MS;
      beats.push({ turn, role, text, from, to: from, thinkingFrom: cursor });
      cursor = from + READ_MS;
    } else {
      const to = cursor + text.length * MS_PER_CHAR;
      beats.push({ turn, role, text, from: cursor, to, thinkingFrom: null });
      cursor = to + SETTLE_MS;
    }
  }

  return { beats, estimateThinkingFrom: cursor, resultAt: cursor + ESTIMATE_MS };
}

const SCHEDULE = buildSchedule();

export const INTAKE_BEATS: readonly IntakeBeat[] = SCHEDULE.beats;

/** When the project field starts and finishes typing. */
export const PROJECT_FROM = FIELD_AT;
export const PROJECT_TO = FIELD_AT + INTAKE_PROJECT.length * MS_PER_CHAR;

/** When the questions give way to the estimate. */
export const RESULT_AT = SCHEDULE.resultAt;

/** When the whole thing starts again. */
export const LOOP_AT = RESULT_AT + HOLD_MS;

/* -------------------------------------------------------------------------
   A single frame
   ---------------------------------------------------------------------- */

export type IntakeBubble = {
  readonly turn: number;
  readonly role: IntakeRole;
  /** What is on screen right now — a prefix, while the homeowner is still typing. */
  readonly text: string;
  /** Still being typed, so it is not yet safe to announce. */
  readonly typing: boolean;
};

export type IntakeFrame = {
  /** The estimate is up and the questions are gone. */
  readonly done: boolean;
  readonly project: string;
  readonly projectTyping: boolean;
  /** 0–100, for the little counter over the field. */
  readonly projectPct: number;
  /** Which of the three questions is being worked on, 1-based. */
  readonly question: number;
  readonly bubbles: readonly IntakeBubble[];
  readonly thinking: boolean;
  /**
   * Everything above, flattened.
   *
   * The component runs a requestAnimationFrame loop and most frames change
   * nothing that is drawn — the typing advances a character every 52ms, so at
   * 60fps roughly two frames in three are identical to the last. Comparing this
   * one string is what turns ~1,080 React renders per loop into ~120.
   */
  readonly signature: string;
};

/** The visible prefix of `text` at `elapsed`, typed evenly between two marks. */
function typedSlice(text: string, elapsed: number, from: number, to: number): string {
  if (elapsed <= from) return '';
  if (elapsed >= to || to <= from) return text;
  return text.slice(0, Math.ceil((text.length * (elapsed - from)) / (to - from)));
}

export function frameAt(elapsed: number): IntakeFrame {
  const at = Math.max(0, elapsed);
  const done = at >= RESULT_AT;

  const project = typedSlice(INTAKE_PROJECT, at, PROJECT_FROM, PROJECT_TO);
  const projectPct = Math.round((project.length / INTAKE_PROJECT.length) * 100);

  // Nothing from the intake is built once the estimate is up. It is not merely
  // hidden — the questions and the answer must never be on screen together, or
  // the demo is showing a price for a conversation that is still happening.
  const bubbles: IntakeBubble[] = done
    ? []
    : INTAKE_BEATS.filter((beat) => at >= beat.from).map((beat) => ({
        turn: beat.turn,
        role: beat.role,
        text: typedSlice(beat.text, at, beat.from, beat.to),
        typing: at < beat.to,
      }));

  /**
   * Which question we are on.
   *
   * Counted from the questions that have LANDED, not from the ones answered:
   * while the homeowner is typing a reply, the question they are replying to is
   * still the current one. So the bar advances when a new question appears,
   * which is also the only moment a viewer would expect it to.
   */
  const asked = INTAKE_BEATS.filter((beat) => beat.role === 'ai' && at >= beat.from).length;
  const question = Math.min(INTAKE_QUESTIONS, Math.max(1, asked));

  const thinking =
    !done &&
    (INTAKE_BEATS.some((beat) => beat.thinkingFrom !== null && at >= beat.thinkingFrom && at < beat.from) ||
      at >= SCHEDULE.estimateThinkingFrom);

  const signature = [
    done ? 'result' : 'intake',
    project,
    projectPct,
    question,
    thinking ? 'dots' : '',
    ...bubbles.map((bubble) => `${bubble.turn}${bubble.typing ? '~' : '='}${bubble.text}`),
  ].join('|');

  return {
    done,
    project,
    projectTyping: at < PROJECT_TO,
    projectPct,
    question,
    bubbles,
    thinking,
    signature,
  };
}

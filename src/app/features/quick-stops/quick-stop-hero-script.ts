/**
 * The script the /features/quick-stops hero plays: one Quick Stop, from a
 * homeowner's text to the offer they answer.
 *
 * FIXED DEMO DATA, AND NOTHING ELSE. This panel calls no model, sends no SMS,
 * creates no offer, takes no payment and touches no schedule. Every string
 * below is written here and read straight out — which is why the file is a
 * plain module with no imports from the product's send paths. If a future
 * change makes it want one, that is the signal it has stopped being a hero.
 *
 * WHY IT IS A SEQUENCE AND NOT A PICTURE. The page replaced a static card of an
 * offer already sent, sitting at "awaiting payment". That card showed the END of
 * the mechanism to somebody who had not yet been told what the mechanism is.
 * The thing being sold is the exchange — a request arrives, you name a number,
 * the homeowner chooses — and an exchange has to happen in order to read as one.
 *
 * WHERE IT STOPS. At the fee form, and it waits there. The pause is the point:
 * the number is the contractor's, so the panel does not fill it in and move on.
 * Nothing loops.
 */

/**
 * Every position the panel can be in, in order.
 *
 * A single ordered list rather than a set of booleans, so "has the job panel
 * arrived yet" is one comparison and no combination of flags can describe a
 * state the sequence never reaches.
 */
export const QUICK_STOP_STAGES = [
  'rest',
  'request',
  'job',
  'text',
  'form',
  'reply',
  'offer',
  'decided',
] as const;

export type QuickStopStage = (typeof QUICK_STOP_STAGES)[number];

/** Position in the sequence, for `>=` comparisons. */
export function stageIndex(stage: QuickStopStage): number {
  return QUICK_STOP_STAGES.indexOf(stage);
}

/**
 * The stages that arrive on their own, and when.
 *
 * Absolute milliseconds from the moment the panel starts, not gaps, so a missed
 * or resumed timer lands on the same clock the others are on. The last of them
 * is `form`, and the sequence stops there until somebody submits.
 */
export const AUTO_STAGES: readonly { stage: QuickStopStage; at: number }[] = [
  { stage: 'request', at: 380 },
  { stage: 'job', at: 1350 },
  { stage: 'text', at: 2450 },
  { stage: 'form', at: 3300 },
];

/** The stage the panel waits on. Named rather than indexed off the end of
 *  AUTO_STAGES, because "where it pauses" is a decision and not a coincidence. */
export const GATE_STAGE: QuickStopStage = 'form';

/**
 * The beat between the contractor's reply and the homeowner seeing it.
 *
 * Long enough to read as a consequence of pressing the button rather than part
 * of the same paint, short enough that nobody wonders whether it worked.
 */
export const OFFER_DELAY = 700;

/** Roughly a third of the hero on screen. Lower than the /features panel's
 *  half: this hero is taller, and half of it is most of a laptop viewport. */
export const START_RATIO = 0.34;

/* ---- who is in it -------------------------------------------------------- */

export const QUICK_STOP_HERO = {
  /** The assistant's side of the thread is ours, so it is named as ours. */
  business: 'Let’s Get Quoted',
  assistantRole: 'Quick Stops assistant',
  homeowner: 'Jamie R.',
  homeownerFirst: 'Jamie',
  area: 'Royal Oak',
  job: 'Leaking kitchen tap',
  window: 'Tomorrow, 9–11 AM',
  /* Written out rather than produced with toLowerCase(), which also lowercased
     the meridiem and printed "tomorrow, 9–11 am" mid-sentence. */
  windowMidSentence: 'tomorrow, 9–11 AM',
} as const;

/* ---- 1. what the homeowner sent ------------------------------------------ */

export const HOMEOWNER_REQUEST =
  'Kitchen tap is leaking under the sink. I’m home today and tomorrow morning.';

/* ---- 2. what intake made of it ------------------------------------------- */

export const JOB_PANEL = {
  title: 'AI Intake turned this into a Quick Stop',
  subtitle: `${QUICK_STOP_HERO.job} · ${QUICK_STOP_HERO.homeowner} · ${QUICK_STOP_HERO.area}`,
  facts: [
    '2.1 mi off tomorrow’s route',
    'Available today or tomorrow morning',
    'Soonest opening: tomorrow, 9–11 AM',
  ],
} as const;

/* ---- 3. the text that reaches the contractor ------------------------------ */

/**
 * Two paragraphs, and the break is load-bearing: the first is the situation and
 * the second is the question. Run together they read as one long sentence a
 * contractor skims to the end of without noticing they have been asked
 * something.
 */
export const CONTRACTOR_TEXT: readonly string[] = [
  'Quick Stop: Jamie in Royal Oak has a leaking kitchen tap, 2.1 miles off tomorrow’s route. You can be there tomorrow, 9–11 AM.',
  'What priority fee would make the stop worth it? Reply with a dollar amount.',
];

/* ---- 4. the form -------------------------------------------------------- */

/**
 * TWO STRINGS, AND THERE WAS A THIRD.
 *
 * A hint sat under the field reading "In dollars. A dollar reply is a yes —
 * there is no separate confirmation to send." Both halves were explaining the
 * composer to somebody already looking at it: the `$` welded to the left edge
 * of the box is the unit, and "there is no separate confirmation" describes a
 * step that is not on screen — the surest way to make a reader look for one.
 * The label, the prefix, the field, the validation line and the button say the
 * whole thing between them.
 *
 * WHAT THAT COST, and what pays for it. The hint was the input's
 * aria-describedby, so it was also where the unit was said for somebody who
 * cannot see the prefix. aria-describedby now carries the validation message
 * and nothing else, which is what it is for; the label is the one description
 * of the field, and it names the thing being asked for rather than its format.
 */
export const FEE_FORM = {
  label: 'Reply with the priority fee you want',
  submit: 'Send reply',
} as const;

/* ---- 6. what the homeowner is shown -------------------------------------- */

export const HOMEOWNER_OFFER = {
  from: `Sent to ${QUICK_STOP_HERO.homeownerFirst} · Homeowner view`,
  title: 'Priority visit available',
  soonestLabel: 'How soon',
  soonest: QUICK_STOP_HERO.window,
  feeLabel: 'Priority fee',
  /* The sentence that stops the fee being read as the price of the repair. The
     page makes this distinction in four places and this is the one a homeowner
     would actually be looking at when they decide. */
  support:
    'Choose priority to reserve this arrival window, or schedule the next regular opening. Service work is priced separately.',
  accept: 'Accept priority visit',
  decline: 'Schedule non-priority visit',
} as const;

/* ---- 7. how it ends ------------------------------------------------------ */

export type HomeownerChoice = 'priority' | 'regular';

/**
 * AUTHORED HERE, NOT PORTED. The build brief this hero was specified against
 * (outputs/quick-stop-hero-build-brief.md) is not in the repository, so the two
 * confirmation states are written to the product's own rules rather than copied
 * from it: the fee reserves a window and is paid before the visit, and the work
 * is quoted and invoiced separately from it. Both say what happens next for the
 * contractor, because that is who is reading the page.
 */
export const CHOICE_RESULT: Record<HomeownerChoice, { title: string; body: (fee: string) => string }> = {
  priority: {
    title: 'Priority visit accepted',
    body: (fee) =>
      `${QUICK_STOP_HERO.homeownerFirst} pays the ${fee} priority fee to hold ${QUICK_STOP_HERO.windowMidSentence}. The work itself is quoted and invoiced separately, the way it is on any other job.`,
  },
  regular: {
    title: 'Regular visit requested',
    body: () =>
      `No priority fee. ${QUICK_STOP_HERO.homeownerFirst} goes into your next regular opening instead, and nothing is added to tomorrow.`,
  },
};

/* ---- the progress rail --------------------------------------------------- */

/**
 * Four labels across the top of the panel, so somebody who arrives mid-sequence
 * can see where in it they are.
 *
 * Each step names the stage it lights up on and the stage it is finished by.
 * Derived from the same ordered list the panel runs on, so a step cannot claim
 * to be done before the thing it describes has happened.
 */
export const PROGRESS_STEPS: readonly {
  label: string;
  activeAt: QuickStopStage;
  doneAt: QuickStopStage;
}[] = [
  { label: 'Intake', activeAt: 'request', doneAt: 'job' },
  { label: 'Job', activeAt: 'job', doneAt: 'text' },
  { label: 'Your fee', activeAt: 'text', doneAt: 'reply' },
  { label: 'Homeowner', activeAt: 'offer', doneAt: 'decided' },
];

/* ---- what is said out loud ----------------------------------------------- */

/**
 * The panel is real content rather than a picture — it contains a form somebody
 * can fill in — so it is NOT hidden from screen readers the way the /features
 * simulation is. What it needs instead is a line when something arrives on its
 * own, since an automatic change with no announcement is a change a screen
 * reader user never learns about.
 *
 * Only the stages worth interrupting for. "The job panel has rendered" is not
 * one: the messages that matter are the one that asks for a number and the one
 * that comes back.
 */
export const STAGE_ANNOUNCEMENT: Partial<Record<QuickStopStage, string>> = {
  form: 'Quick Stop request ready. Reply with the priority fee you want.',
  offer: `Offer sent to ${QUICK_STOP_HERO.homeownerFirst}. They can accept the priority visit or schedule a regular one.`,
};

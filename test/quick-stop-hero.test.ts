import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FEE_ERRORS,
  PREFILLED_FEE_CENTS,
  formatPriorityFee,
  readPriorityFee,
} from '@/app/features/quick-stops/quick-stop-fee';
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
  QUICK_STOP_STAGES,
  STAGE_ANNOUNCEMENT,
  START_RATIO,
  stageIndex,
} from '@/app/features/quick-stops/quick-stop-hero-script';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
/** WHY comments quote the copy they replaced, so they come out before anything
 *  asserts that copy is gone. */
const strip = (source: string) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const SIM = read('src', 'app', 'features', 'quick-stops', 'QuickStopHeroSimulation.tsx');
const SIM_CODE = strip(SIM);
const CSS = read('src', 'app', 'features', 'quick-stops', 'quick-stop-hero-simulation.module.css');
const PAGE = read('src', 'app', 'features', 'quick-stops', 'page.tsx');
const PAGE_CODE = strip(PAGE);
const SCRIPT = read('src', 'app', 'features', 'quick-stops', 'quick-stop-hero-script.ts');
const SCRIPT_CODE = strip(SCRIPT);
const LAYOUT = read('src', 'components', 'marketing', 'feature-detail-layout.tsx');
/** Comments out: the sheet's own note lists the eleven classes it deleted, and
 *  that list is the thing the assertion below would otherwise trip over. */
const PAGE_CSS = read('src', 'app', 'features', 'quick-stops', 'quick-stops.module.css').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

/**
 * The hero on /features/quick-stops plays the exchange instead of printing its
 * last frame. These are the things that would quietly undo that.
 */
describe('the hero simulation replaced the pending-offer card', () => {
  it('leaves no part of the old card behind', () => {
    for (const gone of ['PendingOffer', 'offerFacts', 'factLead', 'heroImportant']) {
      expect(PAGE, `${gone} is still on the page`).not.toContain(gone);
      expect(PAGE_CSS, `${gone} still has rules`).not.toContain(gone);
    }
  });

  it('renders the simulation in the slot the card sat in', () => {
    expect(PAGE).toContain('demo={<QuickStopHeroSimulation />}');
  });

  /**
   * NO CAPTION ABOVE IT AND NO STATUS ROW BELOW IT, on request. The panel ends
   * after its own content. ExampleFrame is still imported and still wraps the
   * mock further down the page — this asserts the HERO does not use it, not
   * that the page stopped labelling anything.
   */
  it('has no frame, caption or replay control around it', () => {
    const hero = PAGE_CODE.slice(PAGE_CODE.indexOf('eyebrow='), PAGE_CODE.indexOf('story={'));
    expect(hero).not.toContain('ExampleFrame');
    expect(hero).not.toMatch(/Live example/i);
    expect(SIM_CODE).not.toMatch(/replay/i);
    // Two ExampleFrames became one, and it is not this one.
    expect(PAGE_CODE.match(/<ExampleFrame/g) ?? []).toHaveLength(1);
  });

  /**
   * AND NOTHING UNDER IT EITHER. The layout's four-cell strip sat directly
   * below the panel — Route-aware, Always optional, Your fee, Paid before you
   * go — which made the hero read as two sections joined together and summarized
   * in eleven words each the exchange the visitor had just played through.
   */
  it('ends at the bottom of the panel, with no proof strip under it', () => {
    expect(PAGE_CODE).not.toContain('proof={');
    // Comments stripped: the page's own note names the four cells it dropped.
    for (const gone of ['Route-aware', 'Always optional', 'Paid before you go']) {
      expect(PAGE_CODE, `${gone} is still under the hero`).not.toContain(gone);
    }
    // The strip is optional in the layout rather than deleted from it: eleven
    // other feature pages still pass one.
    expect(LAYOUT).toContain('proof?: FeatureProofPoint[];');
    expect(LAYOUT).toContain('proof = []');
    expect(LAYOUT).toContain('{proof.length ? (');
  });

  it('keeps both production CTAs exactly as they were', () => {
    expect(PAGE).toContain("primary={{ label: 'See Quick Stops in the demo', href: '/demo/quick-stops' }}");
    expect(PAGE).toContain("secondary={{ label: 'See how the fee works', href: '#how-it-works' }}");
  });

  it('says the new hero copy, with the accent on the offer', () => {
    expect(PAGE).toContain('eyebrow="Customers pay more to be seen sooner"');
    // The <em> is what flagship.module.css paints orange.
    expect(PAGE).toContain('<em>high-priority stop.</em>');
    expect(PAGE).toContain('You set the priority fee · Customer pays before you go · Service is charged separately');
  });

  it('leaves one H1 on the page, and it belongs to the layout', () => {
    expect(SIM).not.toMatch(/<h1\b/);
    // The panel's own headings are paragraphs: this sits inside the hero's h1
    // section and a second one would split the page's outline in two.
    expect(SIM).not.toMatch(/<h[1-6]\b/);
  });
});

/**
 * IT TOUCHES NOTHING. A hero that could send an SMS or take a payment is a hero
 * that will, from a crawler or a misclick.
 */
describe('what the panel is not allowed to do', () => {
  it('calls nothing', () => {
    for (const forbidden of ['fetch(', 'useRouter', 'supabase', 'stripe', '/api/', 'axios']) {
      expect(SIM_CODE.toLowerCase(), `the hero reaches for ${forbidden}`).not.toContain(forbidden.toLowerCase());
    }
  });

  it('reads its copy from the script and invents none in the component', () => {
    // Every visible string is imported. A literal in the JSX is a string that
    // can drift from the one the tests and the page reason about.
    expect(SIM).toContain("from './quick-stop-hero-script'");
    expect(SCRIPT).toContain(HOMEOWNER_REQUEST);
    expect(SIM_CODE).not.toContain(HOMEOWNER_REQUEST);
    expect(SIM_CODE).not.toContain(HOMEOWNER_OFFER.accept);
  });

  it('ships no dead link and no anchor at all', () => {
    expect(SIM_CODE).not.toMatch(/<a\b|<Link\b|href=/);
  });
});

/**
 * The sequence is a list, and the list is the machine.
 */
describe('the stage machine', () => {
  it('runs in one declared order', () => {
    expect([...QUICK_STOP_STAGES]).toEqual([
      'rest',
      'request',
      'job',
      'text',
      'form',
      'reply',
      'offer',
      'decided',
    ]);
  });

  it('advances automatically only as far as the fee form', () => {
    expect(AUTO_STAGES.map((step) => step.stage)).toEqual(['request', 'job', 'text', 'form']);
    // The gate IS the last automatic stage — the pause is not a coincidence of
    // the array's length.
    expect(AUTO_STAGES[AUTO_STAGES.length - 1].stage).toBe(GATE_STAGE);
    // Nothing after it has a time, so nothing after it can fire on a timer.
    for (const step of AUTO_STAGES) {
      expect(stageIndex(step.stage)).toBeLessThanOrEqual(stageIndex(GATE_STAGE));
    }
  });

  it('gives every automatic stage a time that only moves forward', () => {
    const times = AUTO_STAGES.map((step) => step.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(new Set(times).size).toBe(times.length);
    expect(times[0]).toBeGreaterThan(0);
  });

  it('does not loop, and offers no way to restart', () => {
    expect(SIM_CODE).not.toMatch(/setInterval|infinite/);
    // start() is reachable only from the observer, and only once.
    expect(SIM).toContain('if (arrived && !begun)');
    expect(SIM).toContain('begun = true;');
  });

  it('begins at about a third of the hero rather than on load', () => {
    expect(SIM).toContain('IntersectionObserver');
    expect(SIM).toContain('threshold: [0, START_RATIO]');
    expect(START_RATIO).toBeGreaterThan(0.25);
    expect(START_RATIO).toBeLessThan(0.5);
  });

  it('stops its clock when nobody is watching, and cleans up on the way out', () => {
    expect(SIM).toContain("addEventListener('visibilitychange'");
    expect(SIM).toContain('observer.disconnect()');
    expect(SIM).toContain("removeEventListener('visibilitychange'");
    // BOTH timers: the sequence one and the one-shot before the offer.
    expect(SIM).toContain('clearTimer();');
    expect(SIM).toContain('window.clearTimeout(offerTimerRef.current)');
    expect(CSS).toContain('animation-play-state: paused');
  });

  /**
   * Turning reduced motion ON mid-sequence must not rewind somebody who has
   * already submitted a fee — it only ever moves the panel forward to the gate.
   */
  it('answers reduced motion with the panel already at the form', () => {
    expect(SIM).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    expect(SIM).toMatch(/stageIndex\(current\) < stageIndex\(GATE_STAGE\) \? GATE_STAGE : current/);
    expect(CSS).toContain('@media (prefers-reduced-motion: reduce)');
    expect(CSS).toMatch(/\.sim\[data-still='true'\] \.row \{\s*animation: none;/);
  });

  it('reserves the height the finished panel needs, at every width', () => {
    // Otherwise the sections below step down six times: once per stage, again
    // when the offer lands, and again when it is answered.
    const reserves = [...CSS.matchAll(/min-height: (\d+)px/g)].map((match) => Number(match[1]));
    expect(reserves.length, 'there is no reserve').toBeGreaterThanOrEqual(3);
    // Narrower wraps to more lines, so each reserve is at least as tall as the
    // one before it.
    expect(reserves).toEqual([...reserves].sort((a, b) => a - b));
  });

  /**
   * AND IT IS OUTSIDE THE CARD. On the thread it reserved the same space INSIDE
   * the panel, which drew a full-height card from the first paint — so the
   * state the visitor sits in longest, waiting at the fee form, was a composer
   * with 380px of empty navy under it. On `.sim` the card is only ever as tall
   * as what has arrived and the held space is hero background.
   */
  it('holds that height outside the panel, not inside it', () => {
    const sim = CSS.slice(CSS.indexOf('\n.sim {'), CSS.indexOf('/* ---- the shell'));
    expect(sim).toMatch(/min-height: \d+px/);
    expect(sim).toContain('justify-content: center');
    // The thread grows with its content and nothing else.
    const thread = CSS.slice(CSS.indexOf('.sim .thread {'), CSS.indexOf('.sim .thread:focus'));
    expect(thread).not.toContain('min-height');
    // Every override is on the box, not the list.
    expect(CSS).not.toMatch(/\.sim \.thread \{[^}]*min-height/);
  });
});

/**
 * The one step that is the contractor's.
 */
describe('the fee form', () => {
  it('is a real labelled form, not a box that looks like one', () => {
    expect(SIM).toContain('<form');
    expect(SIM).toContain('htmlFor={fieldId}');
    expect(SIM).toContain('inputMode="decimal"');
    expect(SIM).toContain('type="submit"');
    expect(SIM).toContain('aria-invalid=');
    expect(SIM).toContain('aria-describedby=');
    expect(SIM).toContain('role="alert"');
  });

  it('cannot be submitted twice', () => {
    // Guarded on the SUBMITTED VALUE rather than on the form being mounted: a
    // repeat can arrive in the same tick the form is being rendered away.
    expect(SIM).toMatch(/if \(feeCents !== null\) return;/);
    // And the form is gone once there is one.
    expect(SIM).toContain("reached('form') && feeCents === null");
  });

  it('accepts every shape somebody actually types', () => {
    for (const raw of ['145', '$145', '145.00', ' 145 ', '$ 145']) {
      const reading = readPriorityFee(raw);
      expect(reading.ok, `${raw} was rejected`).toBe(true);
      if (reading.ok) expect(reading.cents).toBe(14_500);
    }
    const grouped = readPriorityFee('1,145');
    expect(grouped.ok).toBe(true);
    if (grouped.ok) expect(grouped.cents).toBe(114_500);

    const cents = readPriorityFee('145.50');
    expect(cents.ok).toBe(true);
    if (cents.ok) expect(cents.cents).toBe(14_550);
  });

  it('rejects blank, nonnumeric, zero and negative — each with its own line', () => {
    expect(readPriorityFee('')).toEqual({ ok: false, error: FEE_ERRORS.blank });
    expect(readPriorityFee('   ')).toEqual({ ok: false, error: FEE_ERRORS.blank });

    for (const raw of ['abc', '$', 'one forty five', '14.5.0', '145.123', '1e3']) {
      expect(readPriorityFee(raw), raw).toEqual({ ok: false, error: FEE_ERRORS.nonNumeric });
    }

    for (const raw of ['0', '0.00', '$0', '-145', '-0.01', '$-50']) {
      expect(readPriorityFee(raw), raw).toEqual({ ok: false, error: FEE_ERRORS.notPositive });
    }
  });

  it('says what to type rather than what went wrong', () => {
    for (const message of Object.values(FEE_ERRORS)) {
      expect(message).not.toMatch(/invalid|error|incorrect/i);
      expect(message.endsWith('.')).toBe(true);
    }
  });

  it('prints the reply as money without inventing cents or rounding any away', () => {
    expect(formatPriorityFee(14_500)).toBe('$145');
    expect(formatPriorityFee(114_500)).toBe('$1,145');
    // The one that would break if formatUsdRounded were used on its own.
    expect(formatPriorityFee(14_550)).toBe('$145.50');
    expect(formatPriorityFee(PREFILLED_FEE_CENTS)).toBe('$145');
  });

  /** A dollar reply IS the yes. Asking for a second confirmation is the step
   *  this page exists to say does not happen — so there is no confirm control,
   *  and no sentence explaining the absence of one either. */
  it('needs no separate YES, and no sentence saying so', () => {
    expect(SIM_CODE).not.toMatch(/\bYES\b/);
    // The helper line under the field is gone. Comments stripped first: the
    // constant's own note quotes the sentence it replaced, which is the thing
    // that has to stay findable.
    expect(FEE_FORM).not.toHaveProperty('hint');
    expect(SCRIPT_CODE).not.toContain('A dollar reply is a yes');
    expect(SCRIPT_CODE).not.toContain('In dollars.');
    expect(SIM_CODE).not.toMatch(/styles\.hint|FEE_FORM\.hint/);
    expect(CSS).not.toMatch(/\.hint\s*\{/);
  });

  /** What is left is the whole control: a real label, the unit, the field, the
   *  validation line, the button. aria-describedby now carries the one thing it
   *  is for. */
  it('keeps the composer a labeled field with inline validation', () => {
    expect(FEE_FORM.label).toBe('Reply with the priority fee you want');
    expect(FEE_FORM.submit).toBe('Send reply');
    expect(SIM).toContain('aria-describedby={error ? errorId : undefined}');
    expect(SIM_CODE).not.toContain('hintId');
  });
});

/**
 * What the homeowner is shown, and what happens when they answer.
 */
describe('the homeowner offer', () => {
  it('carries the window, the fee and the sentence that separates them', () => {
    expect(HOMEOWNER_OFFER.title).toBe('Priority visit available');
    expect(HOMEOWNER_OFFER.soonestLabel).toBe('How soon');
    expect(HOMEOWNER_OFFER.feeLabel).toBe('Priority fee');
    expect(HOMEOWNER_OFFER.support).toContain('Service work is priced separately.');
  });

  it('offers exactly two answers and disables both after either', () => {
    expect(HOMEOWNER_OFFER.accept).toBe('Accept priority visit');
    expect(HOMEOWNER_OFFER.decline).toBe('Schedule non-priority visit');
    expect(SIM).toMatch(/disabled=\{choice !== null\}/);
    // Both of them, not just the one that was not pressed.
    expect(SIM.match(/disabled=\{choice !== null\}/g) ?? []).toHaveLength(2);
    expect(SIM).toContain('if (choice) return;');
  });

  it('has a confirmation for each, and neither promises the work is paid for', () => {
    for (const key of ['priority', 'regular'] as const) {
      const result = CHOICE_RESULT[key];
      expect(result.title.length).toBeGreaterThan(8);
      expect(result.body('$145').length).toBeGreaterThan(40);
    }
    expect(CHOICE_RESULT.priority.body('$145')).toContain('$145');
    expect(CHOICE_RESULT.priority.body('$145')).toMatch(/quoted and invoiced separately/);
    // The window mid-sentence, with the meridiem still capitalised. Built with
    // toLowerCase() once, which printed "tomorrow, 9–11 am".
    expect(CHOICE_RESULT.priority.body('$145')).toContain('tomorrow, 9–11 AM');
    expect(CHOICE_RESULT.priority.body('$145')).not.toMatch(/\d\s?[ap]m\b/);
    // Choosing the regular visit costs nothing, and says so.
    expect(CHOICE_RESULT.regular.body('$145')).toContain('No priority fee');
    expect(CHOICE_RESULT.regular.body('$145')).not.toContain('$145');
  });

  it('stacks its two buttons on a narrow screen, and only its own', () => {
    const narrow = CSS.slice(CSS.indexOf('@media (max-width: 620px)'));
    expect(narrow).toMatch(/\.choices \{\s*grid-template-columns: 1fr;/);
    // The hero's own CTAs are the layout's and are not touched here.
    expect(CSS).not.toContain('hero-actions');
    expect(CSS).not.toContain('.button');
  });
});

/**
 * Unlike the /features panel, this one is real content: it has a form in it, so
 * nothing is hidden and the automatic arrivals are announced instead.
 */
describe('what it says to a screen reader', () => {
  it('hides nothing that carries meaning', () => {
    // aria-hidden is allowed only on decoration — the avatar, the live dot, the
    // progress dots and the "$" beside the field.
    const hidden = SIM_CODE.match(/aria-hidden="true"/g) ?? [];
    expect(hidden.length).toBeLessThanOrEqual(4);
    // The panel itself is NOT hidden the way the /features simulation is —
    // its own opening tag, not the decoration a few lines inside it.
    expect(SIM_CODE).not.toMatch(/className=\{styles\.panel\}[^>]*aria-hidden/);
  });

  it('announces the changes worth interrupting for, and no others', () => {
    expect(SIM).toContain('aria-live="polite"');
    expect(SIM).toContain('className="sr-only"');
    // Only the two automatic arrivals that change what is being asked of you.
    expect(Object.keys(STAGE_ANNOUNCEMENT).sort()).toEqual(['form', 'offer']);
  });

  it('keeps the status out of sight — there is no visible status row', () => {
    expect(CSS).not.toMatch(/\.status\b/);
    expect(SIM_CODE).not.toMatch(/styles\.status|styles\.footer/);
    // The announcements reach the live region and nowhere else: nothing draws
    // `live`, and no stage string is rendered into a styled element.
    expect(SIM_CODE.match(/\{live\}/g) ?? []).toHaveLength(1);
    expect(SIM_CODE).toMatch(/className="sr-only" aria-live="polite"[\s\S]*?\{live\}/);
    expect(SIM_CODE).not.toMatch(/styles\.\w+[^>]*>\s*\{live\}/);
  });

  /**
   * The panel ends where the conversation ends. Everything visible is inside
   * `styles.panel`; the only sibling it has is the hidden live region, and the
   * result of the homeowner's choice is inside the offer card rather than
   * repeated under it.
   */
  it('draws nothing below the conversation card', () => {
    const afterPanel = SIM_CODE.slice(SIM_CODE.lastIndexOf('</ol>'));
    expect(afterPanel.match(/<p\b/g) ?? []).toHaveLength(1);
    expect(afterPanel).toContain('className="sr-only"');
    expect(afterPanel).not.toMatch(/styles\./);
    // The one result block sits inside the offer, above the thread's closing tag.
    expect(SIM_CODE.match(/styles\.result\b/g) ?? []).toHaveLength(1);
    expect(SIM_CODE.indexOf('styles.result')).toBeLessThan(SIM_CODE.lastIndexOf('</ol>'));
  });

  it('never moves focus on a timer, and does not drop it on submit', () => {
    // The ONE focus() in the file, and it is inside the submit handler.
    const focuses = SIM_CODE.match(/\.focus\(\)/g) ?? [];
    expect(focuses).toHaveLength(1);
    const submit = SIM_CODE.slice(SIM_CODE.indexOf('const onSubmit'), SIM_CODE.indexOf('const onChoose'));
    expect(submit).toContain('threadRef.current?.focus()');
    // A container, not a control, and not in the tab order.
    expect(SIM).toContain('tabIndex={-1}');
    expect(CSS).toMatch(/\.thread:focus \{\s*outline: none;/);
  });

  it('names four progress steps that cannot claim to be done early', () => {
    expect(PROGRESS_STEPS.map((step) => step.label)).toEqual(['Intake', 'Job', 'Your fee', 'Homeowner']);
    for (const step of PROGRESS_STEPS) {
      expect(stageIndex(step.doneAt), `${step.label} finishes before it starts`).toBeGreaterThan(
        stageIndex(step.activeAt),
      );
    }
  });
});

/**
 * The copy the brief specified, word for word, so a tidy-up cannot reword the
 * thing the page is being measured against.
 */
describe('the script says exactly what it was asked to say', () => {
  it('quotes the homeowner', () => {
    expect(HOMEOWNER_REQUEST).toBe(
      'Kitchen tap is leaking under the sink. I’m home today and tomorrow morning.',
    );
  });

  it('shows what intake made of it', () => {
    expect(JOB_PANEL.title).toBe('AI Intake turned this into a Quick Stop');
    expect(JOB_PANEL.subtitle).toBe('Leaking kitchen tap · Jamie R. · Royal Oak');
    expect([...JOB_PANEL.facts]).toEqual([
      '2.1 mi off tomorrow’s route',
      'Available today or tomorrow morning',
      'Soonest opening: tomorrow, 9–11 AM',
    ]);
  });

  it('asks the contractor for a number, in two paragraphs', () => {
    expect(CONTRACTOR_TEXT).toHaveLength(2);
    expect(CONTRACTOR_TEXT[0]).toBe(
      'Quick Stop: Jamie in Royal Oak has a leaking kitchen tap, 2.1 miles off tomorrow’s route. You can be there tomorrow, 9–11 AM.',
    );
    expect(CONTRACTOR_TEXT[1]).toBe(
      'What priority fee would make the stop worth it? Reply with a dollar amount.',
    );
  });

  it('uses curly apostrophes throughout, like the rest of the site', () => {
    for (const line of [HOMEOWNER_REQUEST, ...CONTRACTOR_TEXT, ...JOB_PANEL.facts]) {
      expect(line, line).not.toMatch(/'/);
    }
  });
});

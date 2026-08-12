import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').split('\r\n').join('\n');

const STOP_ARRIVAL = read('src', 'app', 'dashboard', 'schedule', 'plan', 'StopArrival.tsx');
const ARRIVAL_PANEL = read('src', 'components', 'arrival-panel.tsx');
const PLANNER = read('src', 'app', 'dashboard', 'schedule', 'plan', 'DayPlanner.tsx');
const PLAN_PAGE = read('src', 'app', 'dashboard', 'schedule', 'plan', 'page.tsx');
const HOURS = read('src', 'components', 'working-hours-panel.tsx');
const BOOKING = read('src', 'app', 'dashboard', 'schedule', 'booking', 'BookingSetup.tsx');
const CSS = read('src', 'app', 'globals.css');

/** The block of CSS a media query opens, so a rule can be checked in context. */
const mediaBlock = (needle: string) => {
  const at = CSS.indexOf(needle);
  expect(at, needle).toBeGreaterThan(-1);
  return CSS.slice(CSS.lastIndexOf('@media', at), CSS.indexOf('\n}', at));
};

/**
 * PRESSING "I'M ON MY WAY" PRODUCED A SECOND "I'M ON MY WAY".
 *
 * The row's trigger, the panel's heading and the panel's send button were the
 * same sentence three times, so the first press looked like it had done nothing
 * except duplicate itself.
 */
describe('the stop row and the arrival panel are not the same button', () => {
  it('names the trigger for what it opens, not for what the panel sends', () => {
    expect(STOP_ARRIVAL).toContain("'Text an ETA'");
    expect(STOP_ARRIVAL).not.toContain(`: "I'm on my way"`);
    // The send keeps its name — it is the one that actually texts somebody.
    expect(ARRIVAL_PANEL).toContain(`"\u{1F4CD} I'm on my way"`);
  });

  /** The other two states already said what they were; only the idle one was
   *  borrowing the send's words. */
  it('still reports the trip state rather than a fixed label', () => {
    expect(STOP_ARRIVAL).toContain("arrived ? 'Arrived' : live ? 'On the way'");
  });
});

/**
 * THE CARD WAS A PILE ON A PHONE.
 *
 * "1.3 mi - 4 min drive" and the Flexible badge shared the last row with three
 * buttons on an `auto` track that sized itself to about 230px of a 390px screen.
 * Grid does not clip an overflowing item, so the text ran on underneath the
 * buttons.
 */
describe('the stop card fits the phone it is read on', () => {
  it('gives the actions their own row instead of sharing one with the drive info', () => {
    const block = mediaBlock("'num actions'");
    expect(block).toContain("'num who'");
    expect(block).toContain("'num meta'");
    expect(block).toContain("'num actions'");
    // The three-column version is what put them side by side.
    expect(block).not.toContain("'num meta actions'");
  });

  it('wraps the buttons rather than letting them overflow the card', () => {
    expect(mediaBlock("'num actions'")).toContain('.plan-stop-actions { align-self: center; flex-wrap: wrap; }');
  });
});

/**
 * A SENTENCE ABOUT A SETTING, AND NO WAY TO REACH IT.
 *
 * "Everything fits inside your working hours, finishing by 6:00 PM" is about two
 * numbers the contractor can change, in a panel a few hundred pixels down the
 * same screen — unlinked, so acting on the sentence meant knowing it was there.
 */
describe('route insights link to the setting they are about', () => {
  it('carries the link on the working-hours note', () => {
    expect(PLANNER).toContain("fix: { href: '#working-hours', label: 'Working hours' }");
    expect(PLANNER).toContain('className="plan-insight-fix"');
  });

  it('points at a panel that exists on this page', () => {
    expect(HOURS).toContain('<details id="working-hours"');
    expect(PLAN_PAGE).toContain('<WorkingHoursPanel');
  });

  /** A link to a closed <details> scrolls to its header and stops, which reads
   *  as a dead link — the lead page hit this first. */
  it('opens the panel rather than scrolling to a closed summary', () => {
    expect(PLAN_PAGE).toContain('<OpenActionOnHash />');
    expect(read('src', 'app', 'dashboard', 'leads', '[leadId]', 'OpenActionOnHash.tsx'))
      .toContain('el instanceof HTMLDetailsElement && !el.open');
  });

  it('lands the panel clear of the fixed bar', () => {
    expect(CSS).toContain('#working-hours { scroll-margin-top: calc(var(--appbar-h) + 1rem); }');
  });
});

/**
 * THE MINIMUM JOB VALUE INVITED CENTS AND THEN THREW THEM AWAY.
 *
 * The box printed two decimals, asked for `decimal` input and placeheld "0.00",
 * then rounded: typing 250.50 left 251.00, which is indistinguishable from "my
 * setting did not save".
 */
describe('the minimum job value is whole dollars, and says so', () => {
  it('stops printing cents it will not keep', () => {
    expect(BOOKING).toContain("return Math.round(n).toLocaleString('en-US', { maximumFractionDigits: 0 });");
    expect(BOOKING).toContain('inputMode="numeric"');
    expect(BOOKING).toContain('placeholder="0"');
    expect(BOOKING).toContain('aria-label="Minimum job value in whole dollars"');
  });

  /**
   * THE TRAP THE FIRST FIX WALKED INTO. Deleting "." from the text of a
   * CONTROLLED input turns "250.50" into "250", and the "5" and "0" still to
   * come land after it — 25050. A hundredfold larger floor, silently, on the
   * number that decides which jobs are taken without review.
   */
  it('never multiplies what was typed by a hundred', () => {
    expect(BOOKING).toContain("const [whole = '', ...rest] = raw.split('.');");
    expect(BOOKING).toContain('const parsed = Number(whole);');
    // The dot survives in the text while typing; only the value truncates.
    expect(BOOKING).toContain('setText(rest.length > 0 ? `${whole}.${rest.join(\'\')}` : whole);');
  });

  /** The save path was never the problem — it is checked here so a future
   *  change to the form cannot quietly drop the field. */
  it('sends the field with the rest of the form', () => {
    expect(BOOKING).toContain("data.set('instantBookMinAmount', String(instant.minAmount || ''));");
    expect(read('src', 'app', 'dashboard', 'settings', 'actions.ts')).toContain('instant_book_min_amount: instantBookMinAmount,');
  });
});

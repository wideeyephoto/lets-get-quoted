import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { quickStopFunnel, quickStopFunnelSentence } from '@/lib/quick-stop-funnel';
import type { CandidateReport } from '@/lib/quick-stop-candidates';
import {
  LONG_VISIT_MINUTES,
  quickStopSectionsFlagged,
  quickStopSectionsState,
  reviewQuickStopSections,
  type SectionInput,
} from '@/lib/quick-stop-sections';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
const stripJs = (source: string) =>
  source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const PAGE = stripJs(read('src', 'app', 'dashboard', 'quick-stops', 'page.tsx'));
const CONFIGURATOR = stripJs(read('src', 'app', 'dashboard', 'quick-stops', 'QuickStopConfigurator.tsx'));
const CANDIDATES = stripJs(read('src', 'app', 'dashboard', 'quick-stops', 'QuickStopCandidates.tsx'));
const AREAS = stripJs(read('src', 'app', 'dashboard', 'quick-stops', 'QuickStopAreas.tsx'));
const MAP = stripJs(read('src', 'app', 'dashboard', 'quick-stops', 'QuickStopCoverageMap.tsx'));

/* ===========================================================================
   1. Insights: a funnel, not five sentences to subtract
   ---------------------------------------------------------------------------
   What the panel printed on a real account: a headline of "0 of 3", a
   parenthetical about the 90-day window and its 200-row cap, a sentence about
   48 records that looked like test data, another about one row with no
   duration, and two cards whose whole description was a phone number.

   All true, and between them they answer "why is this empty?" — but only if you
   read all five and do the arithmetic yourself.
   ======================================================================== */
const report = (over: Partial<CandidateReport> = {}): CandidateReport => ({
  eligible: [],
  unknownLength: [],
  excluded: [],
  unjudged: 0,
  screened: 0,
  received: 0,
  removed: { duplicates: 0, alreadyQuickStop: 0, testData: 0 },
  topReasons: [],
  ...over,
});

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i) })) as CandidateReport['eligible'];

describe('the demand funnel', () => {
  const audited = report({
    received: 54,
    removed: { duplicates: 0, alreadyQuickStop: 0, testData: 48 },
    screened: 6,
    excluded: rows(2),
    unjudged: 1,
    unknownLength: rows(3),
    eligible: [],
    topReasons: [{ label: 'Longer than one short visit', count: 2 }],
  });

  it('reads left to right, in the order it happened', () => {
    const steps = quickStopFunnel(audited);
    expect(steps.map((step) => [step.key, step.count])).toEqual([
      ['read', 54],
      ['screened', 6],
      ['judged', 3],
      ['matched', 0],
    ]);
  });

  it('names what left at each step, and what it was', () => {
    const [, screened, judged] = quickStopFunnel(audited);
    expect(screened.detail).toContain('48 records set aside');
    expect(screened.detail).toContain('test data');
    expect(judged.detail).toContain('2 ruled out');
    expect(judged.detail).toContain('longer than one short visit');
    expect(judged.detail).toContain('1 with nothing written down');
  });

  /**
   * THE STEP THAT LOOKS LIKE A BUG AND IS NOT. Nothing in this app writes
   * estimated_hours automatically — not the public lead form, not online
   * booking, not missed-call capture — so on most accounts every record reaches
   * the last step and stops there. The panel reports zero while the rows above
   * it are perfectly good work.
   */
  it('offers something to do about the last step, because there is something', () => {
    const matched = quickStopFunnel(audited).at(-1)!;
    expect(matched.detail).toContain('no length recorded');
    expect(matched.action).toEqual({ label: 'Add lengths on these jobs', href: '#quick-stop-unknown' });
    // …and the anchor it points at is a real element, not a dead link.
    expect(CANDIDATES).toContain('id="quick-stop-unknown"');
  });

  it('points at the biggest single fall, and only when there is one', () => {
    expect(quickStopFunnel(audited).find((step) => step.isBiggestDrop)?.key).toBe('screened');
    // A brand-new account: nothing anywhere, so nothing to point at.
    expect(quickStopFunnel(report()).some((step) => step.isBiggestDrop)).toBe(false);
    // Everything sails through: no drop, no highlight.
    const clean = report({ received: 4, screened: 4, eligible: rows(4) });
    expect(quickStopFunnel(clean).some((step) => step.isBiggestDrop)).toBe(false);
  });

  /* A row of five numbers with arrows between them is a picture. Read aloud
     unaided it is "54 6 3 0", which is not the same information. */
  it('says the same thing in one sentence for a screen reader', () => {
    expect(quickStopFunnelSentence(quickStopFunnel(audited))).toBe(
      '54 read, then 6 screened, then 3 passed every rule, then 0 countable',
    );
  });

  it('says "nothing set aside" rather than going quiet', () => {
    const steps = quickStopFunnel(report({ received: 3, screened: 3, eligible: rows(3) }));
    expect(steps[1].detail).toBe('Nothing set aside');
    expect(steps[2].detail).toBe('Nothing ruled out');
  });

  it('is rendered by the panel, not just computed', () => {
    expect(CANDIDATES).toContain('quickStopFunnel(report)');
    expect(CANDIDATES).toContain('quickStopFunnelSentence');
  });
});

/* ===========================================================================
   2. Settings: what a drawer is set to, without opening it
   ======================================================================== */
const settings = (over: Partial<SectionInput> = {}): SectionInput => ({
  weekdayCount: 5,
  daysAhead: 1,
  earliestTime: '08:00',
  latestEnd: '17:00',
  maxVisitMinutes: 60,
  categoryCount: 4,
  maxDetourMiles: 8,
  maxDetourMinutes: 15,
  minFeeCents: 8000,
  maxFeeCents: 20000,
  maxPerDay: 2,
  refunds: { withinGraceMinutes: 30, grace: 100, beforeEnRoute: 75, afterEnRoute: 50, afterArrived: 0 },
  ...over,
});

describe('each settings drawer says what it is set to', () => {
  const by = (input: SectionInput) => Object.fromEntries(reviewQuickStopSections(input).map((r) => [r.key, r]));

  it('summarises the value, not the subject', () => {
    const r = by(settings());
    expect(r.when.summary).toBe('5 days a week · 8 AM – 5 PM');
    expect(r.what.summary).toBe('Up to 60 min · 4 types of work');
    expect(r.far.summary).toBe('8 mi · 15 min off your route');
    expect(r.charge.summary).toBe('$80 – $200 · up to 2 a day');
    expect(Object.values(r).every((review) => review.state === 'ok')).toBe(true);
  });

  /**
   * THE FIVE-HOUR "QUICK" STOP. The audited account was reported as ready to go
   * with a 300-minute visit limit — a full day's work arriving through a form
   * built for filling a gap in one. A warning, never a block: an owner is
   * allowed to want that, they are just not allowed to be unaware of it.
   */
  it('flags a visit limit that is no longer a stop', () => {
    const r = by(settings({ maxVisitMinutes: 300 }));
    expect(r.what.state).toBe('warn');
    expect(r.what.issues[0]).toContain('5 hours');
    expect(by(settings({ maxVisitMinutes: LONG_VISIT_MINUTES })).what.state).toBe('ok');
  });

  /* The drawer already renders these warnings inside itself. Reading the same
     function means the badge and the list can never disagree. */
  it('flags refund terms the app itself calls unfair, on the closed drawer', () => {
    const r = by(settings({ refunds: { withinGraceMinutes: 0, grace: 0, beforeEnRoute: 0, afterEnRoute: 0, afterArrived: 0 } }));
    expect(r.terms.state).toBe('warn');
    expect(r.terms.issues[0]).toContain('Unfair to the customer');
  });

  it('separates "not set" from "set to something odd"', () => {
    const r = by(settings({ weekdayCount: 0, maxFeeCents: 0, maxDetourMiles: 0 }));
    expect(r.when.state).toBe('todo');
    expect(r.charge.state).toBe('todo');
    expect(r.far.state).toBe('todo');
    expect(r.when.summary).toBe('No days chosen');
  });

  it('rolls up to one word and one count for the bar', () => {
    const clean = reviewQuickStopSections(settings());
    expect(quickStopSectionsState(clean)).toBe('ok');
    expect(quickStopSectionsFlagged(clean)).toBe(0);

    // todo outranks warn: one is blocking, the other is a judgement.
    const mixed = reviewQuickStopSections(settings({ maxVisitMinutes: 300, weekdayCount: 0 }));
    expect(quickStopSectionsState(mixed)).toBe('todo');
    expect(quickStopSectionsFlagged(mixed)).toBe(2);
  });

  it('is what the configurator renders on each closed drawer', () => {
    expect(CONFIGURATOR).toContain('reviewQuickStopSections(');
    expect(CONFIGURATOR).toContain('bset-section-state');
  });
});

/* ===========================================================================
   3. Saving
   ======================================================================== */
describe('the save bar', () => {
  /* It sat below five collapsed drawers, always enabled, with nothing saying
     whether anything had changed — so the only way to know a save had worked
     was to scroll back down and watch a button you had already pressed. */
  it('sticks to the bottom and only appears once something changed', () => {
    expect(CONFIGURATOR).toContain('qs-savebar');
    expect(CONFIGURATOR).toContain('onlyWhenChanged');
  });

  it('says what is unsaved rather than only offering to save it', () => {
    expect(CONFIGURATOR).toContain('Unsaved changes');
  });

  /**
   * THE BAR HAS TO DISAPPEAR WITH ITS BUTTON, and the selector that does it has
   * one trap in each direction.
   *
   * SaveButton stays MOUNTED and sets `hidden` — its effects reach the form
   * through the button's own .form property, so a button that unmounts takes its
   * listeners with it and never comes back. So `:has(button)` alone matches
   * forever and the bar would sit there claiming unsaved changes over a form
   * nobody had touched.
   *
   * And it cannot be done on computed display either: `.btn` sets
   * display:inline-flex, and an author rule beats the UA stylesheet's
   * `[hidden]{display:none}` — the trap `.bset-section-body[hidden]` and
   * `.settings-tabpanel[hidden]` are each written to dodge.
   */
  it('hides itself on a clean form, by the attribute and not by display', () => {
    const css = read('src', 'app', 'globals.css');
    expect(css).toContain('.qs-savebar:not(:has(button:not([hidden]))) { display: none; }');
    const save = readFileSync(join(process.cwd(), 'src', 'components', 'save-button.tsx'), 'utf8');
    expect(save).toContain('hidden={!visible}');
  });
});

/* ===========================================================================
   4. Today is the day's work, and nothing else
   ---------------------------------------------------------------------------
   Measured at 4,100px on desktop and 7,900px on a phone, mixing operations,
   an editable priority-area list, onboarding, earnings marketing, a worked
   example, education and setup progress.
   ======================================================================== */
describe('Today holds today', () => {
  const todayPanel = PAGE.slice(PAGE.indexOf('const todayPanel'), PAGE.indexOf('const settingsPanel'));
  const settingsPanel = PAGE.slice(PAGE.indexOf('const settingsPanel'), PAGE.indexOf('const insightsPanel'));

  it('keeps the status, the map and the requests', () => {
    expect(todayPanel).toContain('<QuickStopStatus');
    expect(todayPanel).toContain('<QuickStopCoverageMap');
    expect(todayPanel).toContain('quick-stop-requests');
  });

  /**
   * Priority areas are a SETTING — where you would be willing to drive — not a
   * fact about today, and they are an editable list with three server actions
   * sitting in the middle of an operations screen. The page comment already
   * claimed this had moved; it had not.
   */
  it('moves the priority-area editor to Settings', () => {
    expect(todayPanel).not.toContain('<QuickStopAreas');
    expect(settingsPanel).toContain('<QuickStopAreas');
    // The anchor was already reserved for the Settings tab — see lib/quick-stop-tabs.
    expect(AREAS).toContain('id="quick-stop-areas"');
  });

  /* The map stays. Where a Quick Stop could land is a fact about today's route,
     which is the one thing on this tab that has to be here — and it no longer
     comes bundled with a form that writes settings. */
  it('leaves the coverage map behind, with no editor attached to it', () => {
    expect(MAP).not.toContain('addQuickStopAreaAction');
    expect(AREAS).toContain('addQuickStopAreaAction');
    // The wrapper that rendered the map and the editor together is gone, not
    // merely bypassed — leaving it would leave a second way to mount the form.
    expect(() => read('src', 'app', 'dashboard', 'quick-stops', 'QuickStopCoverage.tsx')).toThrow();
  });

  /**
   * The pitch — how it works, the worked example, the customer preview, the
   * benefit list, the setup checklist — is right the first time and scrolled
   * past every day after. It was folded once the switch was on and fully
   * expanded otherwise, which is the state a new owner is in.
   */
  it('folds the pitch in every state, not only once the switch is on', () => {
    expect(todayPanel).toContain('quick-stop-how');
    expect(todayPanel).not.toContain('settings.enabled ? (');
  });
});

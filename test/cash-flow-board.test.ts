import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The cash-flow page's two standing promises.
 *
 * 1. It does not present a number it was never given. An unentered bank balance
 *    is unknown, not zero, and every readout built on a starting point has to
 *    say so rather than print a confident figure about a placeholder.
 * 2. It does not report the edge of its own chart as a fact about the business.
 *    "First warning: None" was true of a 30-day window and false of the
 *    account, which went negative on day 33.
 *
 * Read as text, because these are structural claims about the component rather
 * than about what the forecast computes — that part is in cash-outlook.test.ts.
 */

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

/** This repo writes long WHY comments that quote the code they explain, so a
 *  bare toContain will happily match a comment about the thing instead. */
const stripJs = (source: string) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
const stripCss = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '');

const BOARD = stripJs(read('src', 'app', 'dashboard', 'cash-flow', 'CashFlowBoard.tsx'));
const PAGE = stripJs(read('src', 'app', 'dashboard', 'cash-flow', 'page.tsx'));
const CSS = stripCss(read('src', 'app', 'globals.css'));

const ruleFor = (selector: string) => {
  const at = CSS.indexOf(`\n${selector} {`);
  expect(at, `no rule for ${selector}`).toBeGreaterThan(-1);
  return CSS.slice(at, CSS.indexOf('}', at));
};

/** The @media condition a declaration sits under, in a 29,000-line stylesheet
 *  where indexOf('@media (max-width: 720px)') finds somebody else's block. */
const mediaAround = (needle: string) => {
  const at = CSS.indexOf(needle);
  expect(at, `not found: ${needle}`).toBeGreaterThan(-1);
  const opens = [...CSS.slice(0, at).matchAll(/@media ([^{]+)\{/g)];
  return opens.length ? opens[opens.length - 1][1].trim() : null;
};

describe('an unentered balance is unknown, not zero', () => {
  it('keeps the balance nullable instead of defaulting it to 0', () => {
    // `useState<number>(savedBalance ?? 0)` is the whole bug in one line: it
    // turns "nobody has told us" into "there is nothing in the account".
    expect(BOARD).toContain('useState<number | null>(savedBalance)');
    expect(BOARD).not.toContain('useState<number>(savedBalance ?? 0)');
  });

  it('derives one flag for "known" and uses it, rather than testing null everywhere', () => {
    expect(BOARD).toContain('const balanceKnown = balance !== null');
    expect(BOARD).toContain('const startingBalance = balance ?? 0');
  });

  it('leaves the balance box empty rather than pre-filling a zero nobody typed', () => {
    expect(BOARD).toContain("value={balance === null ? '' : balance}");
  });

  it('does not submit a balance that was never entered', () => {
    // Saving a 0 here would write the very fiction the null exists to prevent,
    // and stamp it with today's date as if it had been checked.
    expect(BOARD).toContain('{balance === null ? null : <input type="hidden" name="balance"');
  });

  it('withholds the balance-based readouts and says why', () => {
    // Headroom is a statement about the starting point. Without one it is a
    // statement about a placeholder.
    expect(BOARD).toContain("outlook.headroom === null ? '—'");
    expect(BOARD).toMatch(/Needs today.s bank balance/);
  });

  it('still shows what survives the gap — the shape, and the balance it implies', () => {
    // safeStartingCash falls out of the movements and the buffer, so it is true
    // whether or not anybody has said what is in the account. Withholding it
    // would be its own kind of dishonest.
    expect(BOARD).toContain('Starting balance needed');
    expect(BOARD).toContain('Cash movement preview');
  });

  it('carries the empty-state copy the page was specified with', () => {
    expect(BOARD).toContain('Preview — starting balance needed');
    expect(BOARD).toContain('t reflect your actual position until you enter');
  });
});

describe('the prompt to enter a balance is a control, not a label', () => {
  it('is a real button wired to the field it asks for', () => {
    // It used to be a <span> styled as a pill — it looked exactly like the
    // control it needed to be, and clicking it did nothing.
    expect(BOARD).toContain('const focusBalance = useCallback');
    expect(BOARD).toContain('field.focus({ preventScroll: true })');
    expect(BOARD).toMatch(/<button type="button" className="btn primary cash-setup-cta" onClick=\{focusBalance\}>/);
    expect(BOARD).toContain('ref={balanceRef}');
  });

  it('gives the pill-as-button a hit target and a pointer', () => {
    const rule = ruleFor('.cash-status-pill.is-action');
    expect(rule).toContain('cursor: pointer');
    expect(rule).toMatch(/min-height:\s*44px/);
  });
});

describe('risk does not stop existing at the edge of the chart', () => {
  it('loads the full horizon whatever window the tabs asked for', () => {
    // The event that would have contradicted "First warning: None" was never
    // fetched, because the window decided what the page was allowed to know.
    expect(PAGE).toContain('days: MAX_HORIZON_DAYS');
    expect(PAGE).not.toContain('days: selected.days');
    expect(PAGE).toContain('longDays={MAX_HORIZON_DAYS}');
  });

  it('builds a second forecast past the window and reads the outlook off it', () => {
    expect(BOARD).toContain('const longForecast = useMemo');
    expect(BOARD).toContain('cashOutlook({');
    expect(BOARD).toContain('long: longForecast');
    expect(BOARD).toContain('windowDays: horizonDays');
  });

  it('never prints a bare "None" for the next warning', () => {
    // "None" was the claim. `None in 90 days` is the fact.
    expect(BOARD).toContain('`None in ${longHorizon} days`');
    expect(BOARD).not.toMatch(/:\s*'None'/);
  });

  it('says out loud when the warning is past the chart', () => {
    expect(BOARD).toContain('outlook.risk.beyondWindow');
    expect(BOARD).toMatch(/past the \$\{horizonDays\}-day chart/);
  });
});

describe('the decision comes before the picture of it', () => {
  it('puts status, next warning, headroom and funding above the chart', () => {
    const decision = BOARD.indexOf('cash-decision');
    const chart = BOARD.indexOf('cash-hero-chart');
    expect(decision).toBeGreaterThan(-1);
    expect(chart).toBeGreaterThan(-1);
    expect(decision).toBeLessThan(chart);
    for (const fact of ['Next warning', 'Headroom above buffer', 'Funding needed']) {
      expect(BOARD).toContain(fact);
    }
  });

  it('stacks the facts on a phone rather than crushing three columns', () => {
    const phone = CSS.slice(CSS.indexOf('@media (max-width: 700px)'));
    expect(phone).toContain('.cash-decision-facts { grid-template-columns: 1fr;');
  });
});

describe('scenarios are a control, not a checkbox that draws a line', () => {
  it('replaces the buried switch with tabs beside the horizon', () => {
    expect(BOARD).toContain('cash-scenario-tabs');
    expect(BOARD).toContain("useState<ScenarioKey>('base')");
    // The old one: a checkbox in the settings panel that drew a dashed line and
    // moved no number on the page.
    expect(BOARD).not.toContain('Model customer payments arriving late');
    expect(BOARD).not.toContain('cash-switch');
  });

  it('applies the scenario to the events, so every number is about it', () => {
    expect(BOARD).toContain('applyScenario(events, scenarioDef)');
    expect(BOARD).toContain('buildForecast(scenarioEvents');
    // Shifted list AND a lateDays would move the money twice.
    expect(BOARD).not.toMatch(/lateDays:\s*modelledLateDays/);
  });

  it('summarises all three from the raw events, whichever is selected', () => {
    // Summarising the already-shifted list would compound the selected
    // scenario onto the other two.
    expect(BOARD).toContain('summariseScenarios({');
    expect(BOARD).toMatch(/summariseScenarios\(\{\s*events,/);
  });

  it('puts the warning date and the funding on each tab', () => {
    expect(BOARD).toContain('summary.warningLabel ? `Warning ${summary.warningLabel}`');
    expect(BOARD).toContain('${money(summary.funding)} needed');
  });

  it('gives the tabs a real hit target', () => {
    expect(ruleFor('.cash-scenario')).toMatch(/min-height:\s*44px/);
  });
});

describe('a risky date comes with something to do about it', () => {
  it('names the movements that dug the hole and offers actions per kind', () => {
    expect(BOARD).toContain('cashLowPanel(longForecast');
    expect(BOARD).toContain('cash-low-causes');
    expect(BOARD).toContain('cause.actions.map');
  });

  it('does not dress advice with nowhere to go as a button', () => {
    // A control that looks like a control and does nothing is the same defect
    // as the old status pill.
    expect(BOARD).toContain('cash-low-advice');
    expect(BOARD).toMatch(/action\.href \? \(/);
  });

  it('gives those actions a real hit target too', () => {
    expect(ruleFor('.cash-low-actions .btn')).toMatch(/min-height:\s*44px/);
  });
});

describe('the page says how much of itself to trust', () => {
  it('asks about contradictory entries rather than drawing them silently', () => {
    expect(BOARD).toContain('cashFlags(events');
    expect(BOARD).toContain('cash-flag-q');
  });

  it('reports confidence and when the balance was last updated', () => {
    expect(BOARD).toContain('cashConfidence(forecast)');
    expect(BOARD).toContain('Balance last updated');
  });
});

describe('the page is a week, not a quarter of rows', () => {
  it('shows seven days of movements and keeps the rest one press away', () => {
    expect(BOARD).toContain('const DAYS_SHOWN = 7');
    expect(BOARD).toContain('shownDays.map');
    expect(BOARD).toContain('cash-show-all');
    // Selecting a marker past day seven has to still land somewhere.
    expect(BOARD).toContain('day.index === selected');
  });

  it('puts the movements above the standing bills', () => {
    // The old order put a list that changes twice a year between somebody and
    // the week they came to look at.
    expect(BOARD.indexOf('cash-events-card')).toBeLessThan(BOARD.indexOf('id="cash-bills"'));
  });

  it('collapses the sections that are read once', () => {
    expect(BOARD).toContain('<details ref={billsRef} id="cash-bills" className="panel cash-collapse">');
    expect(PAGE).toContain('cash-collapse cash-where-card');
  });

  it('opens the bills panel when something is sent to it', () => {
    // Scrolling somebody to a closed section and calling that "here is the
    // thing you just added" is worse than not moving.
    expect(BOARD).toContain('panel.open = true');
    expect(BOARD).toContain("window.location.hash === '#cash-bills'");
  });

  it('keeps a disclosure marker on the summary', () => {
    // `display` on a summary drops the UA triangle, and without it a control
    // reads as a heading.
    expect(CSS).toContain('.cash-collapse > summary::after');
    expect(CSS).toContain('.cash-collapse[open] > summary::after');
  });
});

describe('every control is reachable with a thumb', () => {
  it('raises the marker target on phone widths without coarsening the desktop chart', () => {
    const LAYOUT = read('src', 'lib', 'cash-chart-layout.ts');
    expect(LAYOUT).toContain('export function touchSize(width: number)');
    expect(LAYOUT).toMatch(/width < MOBILE_MAX \? 44 : MIN_TOUCH/);
    // The grouping gap and the hit target must be the same figure, or two
    // markers a thumb apart both claim the same pixels.
    const CHART = stripJs(read('src', 'app', 'dashboard', 'cash-flow', 'CashChart.tsx'));
    expect(CHART).toContain('groupMarkers(days, xFor, touch)');
    expect(CHART).toContain('const hitRadius = touch / 2');
  });

  it('sizes the page controls at 44px on a phone', () => {
    const block = CSS.indexOf('.cash-window-row .insight-window-tab,');
    expect(block).toBeGreaterThan(-1);
    const phone = CSS.slice(block, CSS.indexOf('\n}', block));
    for (const selector of ['.cash-preset', '.cash-event-daybtn', '.cash-toggle']) {
      expect(phone, selector).toContain(selector);
    }
    expect(mediaAround('.cash-window-row .insight-window-tab,')).toBe('(max-width: 760px)');
    expect(mediaAround('.cash-range { height: 44px; }')).toBe('(max-width: 760px)');
    // Scoped, not global: .insight-window-tab is shared with Insights, and that
    // is not a page this audit looked at.
    expect(CSS).not.toMatch(/\n\.insight-window-tab \{[^}]*min-height:\s*44px/);
  });

  it('stops the bill cards being 16rem of nothing on a phone', () => {
    // `flex: 1 1 16rem` is a width in the desktop row and a HEIGHT once the
    // mobile rule flips the container to a column.
    expect(CSS).toContain('.cash-bill-main { flex: 0 0 auto; }');
    expect(mediaAround('.cash-bill-main { flex: 0 0 auto; }')).toBe('(max-width: 720px)');
  });
});

describe('wording that does not assume a mouse', () => {
  it('offers a zero buffer as an amount rather than as "None"', () => {
    // In a row of dollar amounts "None" reads as "no preset selected".
    expect(BOARD).toContain("'No buffer ($0)'");
    expect(BOARD).not.toMatch(/preset === 0 \? 'None'/);
  });

  it('does not tell a touch or keyboard user to drag', () => {
    expect(BOARD).toContain('Adjust the dashed line');
    expect(BOARD).not.toContain('Drag the dashed line');
  });

  it('names the action rather than the gesture on the chart itself', () => {
    // The handles take arrow keys and the markers are a roving tabindex, so
    // "Drag" and "Tap" are each wrong for two of the three ways in.
    const CHART = stripJs(read('src', 'app', 'dashboard', 'cash-flow', 'CashChart.tsx'));
    expect(CHART).not.toMatch(/\bDrag the dot\b/);
    expect(CHART).not.toMatch(/\bTap a marker\b/);
    expect(CHART).toContain('Select a marker');
  });
});

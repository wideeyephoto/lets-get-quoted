import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The cash-flow page's two standing promises.
 *
 * 1. It says which starting point it is using. The forecast opens from $0 when
 *    no balance has been saved — a number a contractor can read and correct —
 *    and the page states that in the field and under the chart rather than
 *    withholding every figure until somebody goes and looks it up. What it does
 *    NOT do is dress that placeholder up as a finding: the figures that are
 *    arithmetic on a bank balance wait for a bank balance.
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
const mediaAround = (needle: string | RegExp) => {
  const at = typeof needle === 'string' ? CSS.indexOf(needle) : CSS.search(needle);
  expect(at, `not found: ${needle}`).toBeGreaterThan(-1);
  const opens = [...CSS.slice(0, at).matchAll(/@media ([^{]+)\{/g)];
  return opens.length ? opens[opens.length - 1][1].trim() : null;
};

/**
 * THE FORECAST OPENS FROM ZERO NOW.
 *
 * What stood here was the opposite rule, and the reasoning was sound: a balance
 * nobody gave is not a balance of zero, and printing fictions to the dollar
 * beside the word "Overdrawn" is worse than printing nothing. But the cost of
 * withholding landed on every visit before the one where somebody finally went
 * and looked their balance up — a callout between the page title and its first
 * number, three readouts printing an em-dash, and a chart labelled a preview.
 * The page it was protecting them from is the page they came to see.
 *
 * What survives is the part that can be acted on: the field says nothing has
 * been saved, and the chart says which zero it is starting from.
 *
 * The line between the two decisions is what the zero can support. The SHAPE of
 * the month is real without a balance, so the curve, the day list and the safe
 * starting cash the movements imply are all drawn. A dated shortfall and a
 * funding figure to the dollar are not — those are arithmetic on a number
 * nobody gave, and they wait for it.
 */
describe('the forecast starts from a number, and says which', () => {
  it('defaults the balance to 0 rather than to unknown', () => {
    expect(BOARD).toContain('useState<number>(savedBalance ?? 0)');
    expect(BOARD).not.toContain('useState<number | null>(savedBalance)');
  });

  it('keeps a separate flag for whether a human ever gave it', () => {
    // Two different questions. What the forecast starts from is always a
    // number; whether anybody confirmed it is what the hint and the Save
    // label are about.
    expect(BOARD).toContain('const balanceSaved = savedBalance !== null');
    expect(BOARD).toContain('const startingBalance = balance;');
  });

  it('drops the setup wall entirely', () => {
    const markup = BOARD.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(markup).not.toContain('Preview — starting balance needed');
    expect(markup).not.toContain('cash-setup');
    expect(CSS).not.toContain('.cash-setup {');
  });

  /** One line under the chart instead. It is worth saying the curve starts
   *  from a zero nobody confirmed; it is not worth blocking the page to say. */
  it('says which zero the line starts from, where the line is', () => {
    // Gone the moment a number is typed, saved or not — the sentence names $0
    // outright, and by then the curve above it starts somewhere else.
    expect(BOARD).toContain('{balanceGiven ? null : (');
    expect(BOARD).toContain('cash-provisional-note');
    expect(BOARD).toContain('because no bank balance has been saved yet');
  });

  /**
   * An em-dash where the figure would be a fiction, and only there.
   *
   * "Funding needed $8,412" beside a red "Shortfall projected" is a precise,
   * alarming claim about an account nobody has described — it is `required`
   * minus a placeholder. The card that reports what the MOVEMENTS need (safe
   * starting cash) needs no balance and keeps its number.
   */
  it('withholds the figures that are arithmetic on a balance nobody gave', () => {
    expect(BOARD).toContain('balanceKnown: balanceGiven');
    expect(BOARD).not.toContain('balanceKnown: true');
    expect(BOARD).toContain('<dt>Funding needed</dt>');
    expect(BOARD).toContain("{balanceGiven ? money(outlook.funding) : '—'}");
    expect(BOARD).toContain('balanceGiven && outlook.funding > 0');
    // The setup wall is still gone. The withholding is three figures, not the
    // page: the chart, the day list and safe starting cash all still draw.
    expect(BOARD).not.toContain('Cash movement preview');
    expect(BOARD).toContain('{money(outlook.required)}');
  });

  /**
   * WITHHELD IN ONE PLACE IS WITHHELD IN ALL OF THEM.
   *
   * A scenario tab's "$8,412 needed" is `required` minus the starting balance —
   * the same subtraction the Funding needed card refuses to make without a
   * balance, printed to the dollar a couple of hundred pixels under it. The
   * warning DATE on the tab is not gated: that one comes off the shape.
   */
  it('gates the scenario tabs on the same question as the card above them', () => {
    expect(BOARD).toContain('balanceGiven && summary.funding > 0');
    expect(BOARD).not.toContain('{summary.funding > 0 ?');
  });

  /**
   * THE DIAL HAS TO MOVE TOGETHER.
   *
   * The exact box, the slider and the chart's drag handle all feed the forecast
   * directly, so a typed balance redraws the curve, the day balances and the
   * warning date on the keystroke. Gating the verdict on `savedBalance` alone
   * froze the status pill, the headroom and the funding figure at "Needs
   * today's bank balance" while the chart moved under the reader's hands — the
   * three figures they were dialling toward being the only three that stopped.
   */
  it('counts a balance typed this visit as given, not just a stored one', () => {
    expect(BOARD).toContain('const balanceGiven = balanceSaved || balanceTouched;');
    // The stored/typed distinction still exists where it is the actual
    // question: what the database holds, and what Save is offering to do.
    expect(BOARD).toContain('const balanceSaved = savedBalance !== null');
    expect(BOARD).toContain('{dirty || !balanceSaved ?');
  });

  it('leaves the saved value nullable end to end', () => {
    // The DEFAULT is a display decision. Nothing here turns a fresh account's
    // null into a stored zero behind their back — saving is still a press.
    expect(BOARD).toContain('savedBalance: number | null;');
    expect(BOARD).toContain('{dirty || !balanceSaved ?');
  });

  /**
   * ONE PRESS CANNOT CONFIRM A PLACEHOLDER.
   *
   * `balance !== savedBalance` is `0 !== null` on a fresh account, so Save was
   * live on first paint and pressing it stored the placeholder as a confirmed,
   * timestamped bank balance — which turned off the "starting from $0" note and
   * seeded an accuracy snapshot from a number nobody had checked.
   */
  it('treats an untouched placeholder as clean rather than as an edit', () => {
    expect(BOARD).toContain('const [balanceTouched, setBalanceTouched] = useState(false)');
    expect(BOARD).toContain('balanceSaved ? balance !== savedBalance : balanceTouched');
    expect(BOARD).not.toContain('const dirty = balance !== savedBalance');
  });

  it('leaves the balance out of the post until somebody has moved it', () => {
    // A missing field is "no balance given" to the action, which is what keeps
    // cash_balance, its timestamp and the snapshot untouched when only the
    // buffer was saved.
    expect(BOARD).toContain('{balanceGiven ? <input type="hidden" name="balance" value={balance} /> : null}');
    // Every way in has to mark it: the exact box, the slider, and the chart
    // handle. One still wired to the raw setter would save a zero silently.
    expect(BOARD).toContain('onBalanceChange={changeBalance}');
    expect(BOARD).toContain('changeBalance(Number(event.target.value))');
    expect(BOARD).toContain('if (Number.isFinite(next)) changeBalance(next)');
    expect(BOARD).not.toContain('onBalanceChange={setBalance}');
  });

  /**
   * A GENUINE $0 HAS TO BE SAYABLE.
   *
   * Tracking the touch rather than the value was chosen so that an owner who is
   * actually at zero could still save it — but the obvious path never armed the
   * flag. The box already reads 0, the setup prompt selects it, they type 0,
   * and React drops onChange because the value string did not change. The
   * account this page exists for was the one it could not hear from.
   */
  it('arms the save on a keystroke, not only on a changed value', () => {
    expect(BOARD).toContain('onKeyDown={(event) => {');
    expect(BOARD).toContain("event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete'");
    expect(BOARD).toContain('setBalanceTouched(true)');
  });
});

/**
 * THREE DIALS, BEHIND ONE DOOR.
 *
 * Money in the bank, the safety buffer and the credit line are settings: set
 * once, corrected occasionally, read past on every other visit. Unrolled they
 * were a configuration screen between the forecast and the list of what
 * actually moves money.
 */
describe('the settings are a drawer, not a panel', () => {
  it('is a details, closed, named for what is in it', () => {
    expect(BOARD).toContain('<details ref={settingsRef} className="panel cash-controls"');
    expect(BOARD).toContain('<strong>Advanced settings</strong>');
  });

  /** Closed on every load, including a fresh account. The forecast starts
   *  from $0 and works; opening the settings for somebody who did not ask is
   *  the same nag the setup callout was. */
  it('does not open itself', () => {
    expect(BOARD).not.toContain('open={!balanceSaved}');
    expect(BOARD).toContain('<details ref={settingsRef} className="panel cash-controls">');
  });

  it('keeps the three current values readable without opening it', () => {
    expect(BOARD).toContain('in the bank</span>');
    expect(BOARD).toContain('buffer</span>');
    expect(BOARD).toContain("creditLine > 0 ? `${money(creditLine)} credit` : 'No credit line'");
  });

  /** A <details> does not open because something inside it was focused — the
   *  browser only does that for find-in-page and fragment navigation. */
  it('opens the drawer before putting the cursor in the balance field', () => {
    expect(BOARD).toContain('if (settingsRef.current) settingsRef.current.open = true;');
    expect(BOARD).toContain('field.focus({ preventScroll: true })');
    expect(BOARD).toContain('ref={balanceRef}');
  });
});

describe('the prompt to enter a balance is a control, not a label', () => {
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
    expect(phone).toMatch(/\.cash-decision-facts\s*\{\s*grid-template-columns:\s*1fr;/);
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

  it('puts the assumption behind the date on the tab too', () => {
    // It lived in a title tooltip and in a line inside the collapsed settings
    // drawer, so on a phone "Warning Sep 10" was a date with no stated reason
    // to believe it.
    expect(BOARD).toContain('<small>{summary.hint}</small>');
    expect(BOARD).not.toContain('title={summary.hint}');
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

  it('links to each entry that made a flag, not to one panel holding half of them', () => {
    // "Check the entries →" always landed in the bills panel, which holds
    // scheduled payments only — so a bill colliding with a payroll run or a
    // customer payment sent somebody to a list containing at most one side.
    expect(BOARD).toContain('flag.entries.length > 0 ?');
    expect(BOARD).toContain('flag.entries.map');
    expect(BOARD).toContain('href={entry.href}');
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
    expect(CSS).toMatch(/\.cash-collapse\s*>\s*summary::after/);
    expect(CSS).toMatch(/\.cash-collapse\[open\]\s*>\s*summary::after/);
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
    expect(mediaAround(/\.cash-range\s*\{\s*height:\s*44px;/)).toBe('(max-width: 760px)');
    // Scoped, not global: .insight-window-tab is shared with Insights, and that
    // is not a page this audit looked at.
    expect(CSS).not.toMatch(/\n\.insight-window-tab \{[^}]*min-height:\s*44px/);
  });

  it('stops the bill cards being 16rem of nothing on a phone', () => {
    // `flex: 1 1 16rem` is a width in the desktop row and a HEIGHT once the
    // mobile rule flips the container to a column.
    expect(CSS).toMatch(/\.cash-bill-main\s*\{\s*flex:\s*0 0 auto;/);
    expect(mediaAround(/\.cash-bill-main\s*\{\s*flex:\s*0 0 auto;/)).toBe('(max-width: 720px)');
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

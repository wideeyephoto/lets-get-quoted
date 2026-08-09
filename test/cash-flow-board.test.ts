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
});

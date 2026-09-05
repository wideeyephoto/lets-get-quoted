import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { summarizeJobLabor, type LaborEntry } from '@/lib/labor';
import { hoursLabel, payMoney } from '@/lib/crew-pay';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const TAB = read('src', 'app', 'dashboard', 'crew', 'LaborByJob.tsx');
/**
 * The tab with its prose taken out.
 *
 * EVERY assertion below runs against this, not against the raw file, and the
 * absence assertions are the reason. This module's header comment quotes the
 * exact strings this change removes — "Not quoted", "% of quote" — because
 * naming the defect is how the comment earns its place. A bare toContain
 * against the raw source would match the comment describing the fix and pass
 * whether or not the fix shipped. It has bitten this repo twice.
 */
const CODE = TAB.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const LABOR = read('src', 'lib', 'labor.ts');
const JOBS = read('src', 'lib', 'jobs.ts');
const HOURS_TAB = read('src', 'app', 'dashboard', 'crew', 'HoursAndPay.tsx');
const PERIOD_BAR = read('src', 'app', 'dashboard', 'crew', 'CrewPeriodBar.tsx');

// The tab is a React component in a suite with no DOM, so this asserts against
// the source the way the other panel tests here do. That is a real limit and
// worth naming: it proves the markup says what it must, not that a browser
// painted it. The arithmetic underneath IS exercised directly — summarizeJobLabor
// is pure and lives in lib — and the one row that started all of this is rebuilt
// from its real numbers below.

describe('the row that used one word for two columns', () => {
  it('reproduces the contradictory row from its real data', () => {
    // "0 hours · $960 · Not quoted · 1745.45% of quote", as reported. The
    // arithmetic was never wrong: 960 / 55 * 100 = 1745.45, so the job carries
    // estimated_hours null and quoted_amount 55. Every figure in that row is
    // correct and the row as a whole is unreadable.
    const entries: LaborEntry[] = [
      {
        id: 'e1',
        crew_id: 'c1',
        crew_name: 'Danny',
        crew_role_label: null,
        job_id: 'j1',
        description: 'Labor',
        hours: 0,
        rate: 0,
        amount: 960,
        created_at: '2026-08-03T14:00:00.000Z',
      },
    ];
    const [row] = summarizeJobLabor(entries, [
      { id: 'j1', ref: 'J-1001', client_name: 'Ruiz', status: 'complete', estimated_hours: null, quoted_amount: 55 },
    ]);
    expect(row.hours).toBe(0);
    expect(row.laborCost).toBe(960);
    // The two things the one word "quote" was standing for: no ESTIMATED HOURS,
    // and a share of the QUOTED DOLLAR TOTAL.
    expect(row.quotedHours).toBeNull();
    expect(row.laborShare).toBe(1745.45);
  });

  it('names the column in the value instead of saying "quote" twice', () => {
    expect(CODE).toContain('No hours estimated');
    expect(CODE).toContain('% of the quoted total');
    // The two collapsed words are gone from the rendering entirely.
    expect(CODE).not.toContain('Not quoted');
    expect(CODE).not.toContain('% of quote');
  });

  it('puts the hours figures and the money figures in separate labelled column groups', () => {
    // Not decoration: the defect was four mixed metrics in one row, two of them
    // measured against an allowance in hours and two against a total in
    // dollars, with nothing saying which was which.
    expect(CODE).toMatch(/scope="colgroup"[\s\S]{0,40}Hours/);
    expect(CODE).toMatch(/scope="colgroup"[\s\S]{0,40}Cost/);
    expect(CODE).toContain('Quoted hours');
    expect(CODE).toContain('Labor cost');
    expect(CODE).toContain('Actual labor hours');
    // The share is its own column now, so it can never share a cell with the
    // hours allowance again.
    expect(CODE).not.toMatch(/laborShare[\s\S]{0,120}<small>/);
  });

  it('explains the two allowances in the headers rather than hoping the reader knows', () => {
    expect(CODE).toContain('its estimated hours are the allowance');
    expect(CODE).toMatch(/quoted DOLLAR total/);
  });
});

describe('money on this tab', () => {
  it('renders through payMoney, so a figure reads the same on both tabs', () => {
    expect(CODE).toMatch(/import \{[^}]*payMoney[^}]*\} from '@\/lib\/crew-pay'/);
    // The local formatter is gone. It dropped cents, so one labor entry read
    // "$305" here and "$304.50" on Hours & pay, which is the same number twice.
    expect(CODE).not.toContain('maximumFractionDigits: 0');
    expect(CODE).not.toMatch(/function money\(/);
    expect(CODE).not.toMatch(/[^y]money\(/);
    // All nine of the old call sites, and then some.
    expect((CODE.match(/payMoney\(/g) ?? []).length).toBeGreaterThanOrEqual(9);
  });

  it('agrees with the formatter Hours & pay uses, to the cent', () => {
    expect(payMoney(304.5)).toBe('$304.50');
    expect(HOURS_TAB).toMatch(/import \{[\s\S]*?payMoney,[\s\S]*?\} from '@\/lib\/crew-pay'/);
  });
});

describe('hours on this tab', () => {
  it('says hours one way, everywhere, and it is the way Hours & pay says them', () => {
    expect(CODE).toMatch(/import \{[^}]*hoursLabel[^}]*\} from '@\/lib\/crew-pay'/);
    expect(hoursLabel(23.5)).toBe('23h 30m');
    // The rounded decimals this tab used to print for entry and crew hours.
    expect(CODE).not.toMatch(/Math\.round\(entry\.hours \* 100\) \/ 100/);
    expect(CODE).not.toMatch(/\{row\.hours\}/);
  });

  it('keeps the direction of a variance in the value', () => {
    // hoursLabel has no sign, so "+" and "−" have to be put back or an overrun
    // and an undertun render identically.
    expect(CODE).toMatch(/function varianceLabel/);
    expect(CODE).toContain("hours > 0 ? '+' : '−'");
    expect(CODE).toContain("'On the estimate'");
  });
});

describe('the period selector', () => {
  it('lives on the shared period bar now, driving the same URL Hours & pay drives', () => {
    expect(PERIOD_BAR).toMatch(/import \{[\s\S]*?buildPeriodHref,[\s\S]*?\} from '@\/lib\/labor'/);
    expect(PERIOD_BAR).toContain('aria-label="Previous period"');
    expect(PERIOD_BAR).toContain('aria-label="Next period"');
    expect(PERIOD_BAR).toContain('name="from"');
    expect(PERIOD_BAR).toContain('name="to"');
  });

  it('no longer sends the owner to another tab to change the date range', () => {
    expect(CODE).not.toContain('Date range follows the period on');
  });
});

describe('risk', () => {
  it('separates over the quoted HOURS from labor past the quoted TOTAL', () => {
    // Two different problems with two different fixes: one is an estimating
    // question, the other is a job that is losing money.
    expect(CODE).toContain('overHours');
    expect(CODE).toContain('overQuotedTotal');
    expect(CODE).toContain('Over the quoted hours');
    expect(CODE).toContain('Labor past the quoted total');
    // And they are separately filterable.
    expect(CODE).toContain('<option value="over-hours">');
    expect(CODE).toContain('<option value="over-cost">');
    // The single word that used to answer both is gone from the filter.
    expect(CODE).not.toContain('<option value="over">Over the quoted hours</option>');
  });

  it('grades the levels and puts the worst first', () => {
    for (const level of ['critical', 'over-cost', 'over-hours', 'watch', 'ok', 'unmeasured']) {
      expect(CODE).toContain(`${level.includes('-') ? `'${level}'` : level}:`);
    }
    expect(CODE).toMatch(/SEVERITY\[b\.severity\]\.rank - SEVERITY\[a\.severity\]\.rank/);
    // Ties break on what the overrun actually cost, so the biggest hole is row one.
    expect(CODE).toMatch(/b\.overrunCost - a\.overrunCost/);
  });

  it('will not call a job with nothing to compare "within the quote"', () => {
    expect(CODE).toMatch(/const unmeasured = row\.quotedHours === null && row\.laborShare === null/);
    expect(CODE).toContain('Nothing to measure');
  });

  it('names its watch threshold as a display choice and shows the real percentage beside it', () => {
    expect(CODE).toMatch(/const LABOR_SHARE_WATCH = \d+/);
    expect(CODE).toMatch(/\{row\.laborShare\}%/);
  });
});

describe('the summary totals', () => {
  it('carries the four the tab is about, each named as its own quantity', () => {
    expect(CODE).toContain('<small>Actual labor hours</small>');
    expect(CODE).toContain('<small>Labor cost</small>');
    expect(CODE).toContain('<small>Quoted allowance</small>');
    expect(CODE).toContain('<small>Margin impact</small>');
  });

  it('states the margin impact as the wages it is, not as lost profit', () => {
    expect(CODE).toContain('cost of hours past the estimate');
    expect(CODE).toMatch(/round2\(\(row\.laborCost \/ row\.hours\) \* row\.varianceHours\)/);
    // An entry can carry zero hours and a real amount — that is exactly the row
    // that started this — so the divide is guarded.
    expect(CODE).toMatch(/row\.hours > 0/);
  });
});

describe('the row controls', () => {
  it('makes the job and customer name a link to the job', () => {
    expect(CODE).toMatch(/<Link\s+href=\{`\/dashboard\/jobs\/\$\{row\.jobId\}`\}\s+className=\{styles\.tableName\}/);
    // The row itself still toggles, so the link has to stop there or opening a
    // job would also open a panel behind it.
    expect(CODE).toContain('event.stopPropagation()');
  });

  it('replaces the bare triangle with a named, keyboard-operable disclosure', () => {
    expect(CODE).toContain('View breakdown');
    expect(CODE).toContain('Hide breakdown');
    expect(CODE).toMatch(/aria-expanded=\{open\}/);
    expect(CODE).toMatch(/aria-controls=\{detailId\}/);
    // The panel it controls actually carries that id.
    expect(CODE).toMatch(/className=\{styles\.detailRow\} id=\{detailId\}/);
    // The glyph is decoration now, not the control's only name.
    expect(CODE).toMatch(/<span aria-hidden="true">\{open \? '▾' : '▸'\}<\/span>/);
  });
});

describe('the By crew member view', () => {
  it('sorts on hours, cost, jobs and overtime', () => {
    expect(CODE).toMatch(/type CrewSortKey = 'hours' \| 'cost' \| 'jobs' \| 'overtime'/);
    for (const key of ['hours', 'cost', 'jobs', 'overtime']) {
      expect(CODE).toContain(`sortKey="${key}"`);
    }
    expect(CODE).toContain('aria-sort=');
    expect(CODE).toContain('className={styles.sortBtn}');
  });

  it('works overtime out per WEEK, the way the rest of the product does', () => {
    // A period total of 80 hides 45 one week and 35 the next.
    expect(CODE).toMatch(/import \{[\s\S]*?splitOvertime,[\s\S]*?\} from '@\/lib\/labor'/);
    expect(CODE).toMatch(/toDateKey\(startOfWeek\(new Date\(entry\.loggedAt\)\)\)/);
    expect(CODE).toContain('splitOvertime(bucket.hoursByWeek, overtimeThreshold)');
    // And says so, because Hours & pay is the record for overtime.
    expect(CODE).toContain('Hours & pay is the record');
  });
});

describe('scheduled hours', () => {
  it('are shown when there are any, and claimed nowhere when there are none', () => {
    expect(CODE).toMatch(/scheduledHours\?: Record<string, number> \| null/);
    expect(CODE).toMatch(/const showScheduled = useMemo\(\(\) => ranked\.some\(\(item\) => item\.scheduled !== null\)/);
    expect(CODE).toContain('{showScheduled ? (');
    // The colSpan of the open breakdown has to follow the column count or the
    // panel stops spanning its own table.
    expect(CODE).toMatch(/colSpan=\{showScheduled \? 8 : 7\}/);
  });
});

describe('the labor-cost caveat', () => {
  it('says on screen which labor cost this one is', () => {
    expect(CODE).toContain('Labor cost here is wages only');
    expect(CODE).toContain('employer burden');
  });

  it('is true: this tab sums wages and the job page adds burden on top', () => {
    // The claim is checked against both sources rather than trusted. labor.ts
    // sums the entry amount, which jobs.ts documents as the wage alone.
    expect(LABOR).toMatch(/bucket\.cost \+= Number\(entry\.amount\) \|\| 0/);
    expect(JOBS).toMatch(/const laborBurden = costs[\s\S]{0,160}burden_amount/);
    expect(JOBS).toMatch(/const laborCost = laborWages \+ laborBurden/);
  });

  it('is rendered in every layout of the tab, not only the table', () => {
    // Three returns for three layouts; the caveat is one node used by all of
    // them, so a layout cannot ship without it.
    expect(CODE).toMatch(/const costCaveat = \(/);
    expect((CODE.match(/\{costCaveat\}/g) ?? []).length).toBe(3);
  });
});

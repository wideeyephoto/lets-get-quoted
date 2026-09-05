import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  OVERTIME_POLICY,
  entryIssue,
  exportBlockedReason,
  offsetForDate,
  summarizeCrewLabor,
  type LaborEntry,
} from '@/lib/labor';
import {
  PAY_WARNING_FIX,
  PAY_WARNING_HELP,
  PAY_WARNING_LABEL,
  approveActionLabel,
  buildPayRows,
  canApproveRow,
  entryHoursLabel,
  needsReapproval,
  payWarningChip,
  rateBreakdownLabel,
  rowHoursLabel,
  type PayRecord,
} from '@/lib/crew-pay';
import { roundHours } from '@/lib/labor-settings';

// The five payroll contradictions reported against Hours & pay, held down so
// they cannot come back. Three were real defects; two were misreadings of
// behaviour that is correct, each with a real defect hiding inside it. Every
// test here names which.
//
// The UI assertions read source as text, the way this suite tests every other
// component — there is no DOM here. IMPORTANT: this file's targets are heavily
// commented, and several of those comments QUOTE the strings being asserted
// against ("Missing rate", "There are no hours here left to approve"). Every
// source assertion therefore runs against a comment-stripped copy, or it would
// happily match the explanation of the bug instead of the fix.

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const HOURS_AND_PAY = read('src', 'app', 'dashboard', 'crew', 'HoursAndPay.tsx');
const HOURS_CODE = strip(HOURS_AND_PAY);
const DETAIL_CODE = strip(read('src', 'app', 'dashboard', 'crew', 'PayMasterDetail.tsx'));
const ACTIONS_CODE = strip(read('src', 'app', 'dashboard', 'crew', 'pay-actions.ts'));
const PERIOD_BAR_CODE = strip(read('src', 'app', 'dashboard', 'crew', 'CrewPeriodBar.tsx'));

// Monday of the week containing NOW.
const NOW = new Date(2026, 6, 29, 12, 0, 0);
const LOGGED = new Date(2026, 6, 27, 9, 0, 0).toISOString();

function entry(over: Partial<LaborEntry> = {}): LaborEntry {
  return {
    id: 'e1',
    crew_id: 'crew-1',
    crew_name: 'Mike Torres',
    crew_role_label: 'Lead carpenter',
    job_id: 'job-1',
    description: 'Framing',
    hours: 8,
    rate: 30,
    amount: 240,
    created_at: LOGGED,
    ...over,
  };
}

function record(over: Partial<PayRecord> = {}): PayRecord {
  return {
    id: 'rec-1',
    crewId: 'crew-1',
    crewName: 'Mike Torres',
    status: 'approved',
    regularHours: 8,
    overtimeHours: 0,
    approvedAmount: 240,
    approvedAt: new Date(2026, 6, 28, 9).toISOString(),
    approvedBy: 'owner@example.com',
    sentAt: null,
    paidAmount: null,
    paidAt: null,
    paidBy: null,
    paymentDate: null,
    paymentMethod: null,
    paymentReference: null,
    paymentNote: null,
    locked: false,
    ...over,
  };
}

const quarter = (hours: number) => roundHours(hours, 'quarter');

describe('(1) unassigned labor showing 0 hours and $960', () => {
  // The PAIRING is correct and stays: costs.amount is NOT NULL and costs.hours
  // is nullable, so a labor row really can carry money with no time on it, and
  // bucketing it under 'unassigned' is what makes it visible at all.
  it('keeps a row that has an amount but no hours, and blocks it rather than hiding it', () => {
    const { rows, totalPay } = summarizeCrewLabor([entry({ crew_id: null, crew_name: null, hours: null, rate: null, amount: 960 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Unassigned labor');
    expect(rows[0].hours).toBe(0);
    expect(totalPay).toBe(960);
    expect(rows[0].issues).toContain('incomplete-time');
    expect(entryIssue({ hours: null, rate: null, crew_id: null })).toBe('incomplete-time');
  });

  // THE REAL DEFECT. A rounding rule is a display preference. It recomputed
  // every amount as hours × rate, so a row with no hours became 0 × 0 and the
  // stored $960 disappeared from the period total the moment somebody chose
  // "nearest 15 minutes" in Labor settings.
  it('never lets a rounding rule delete a stored amount', () => {
    const rows = [entry({ crew_id: null, crew_name: null, hours: null, rate: null, amount: 960 })];
    const exact = summarizeCrewLabor(rows);
    const rounded = summarizeCrewLabor(rows, { roundHours: quarter });
    expect(exact.totalPay).toBe(960);
    expect(rounded.totalPay).toBe(960);
    expect(rounded.rows[0].entries[0].amount).toBe(960);
  });

  it('also keeps an amount that has hours but no rate — nothing to recompute from', () => {
    const { totalPay } = summarizeCrewLabor([entry({ rate: null, amount: 500 })], { roundHours: quarter });
    expect(totalPay).toBe(500);
  });

  it('still recomputes from the rounded hours when there IS something to recompute from', () => {
    // 8.2 hours at $30 rounds up to 8.25 hours, and the pay has to follow the
    // hours or the table shows a figure that doesn't multiply out.
    const { totalHours, totalPay } = summarizeCrewLabor([entry({ hours: 8.2, amount: 246 })], { roundHours: quarter });
    expect(totalHours).toBe(8.25);
    expect(totalPay).toBe(247.5);
  });

  it('renders never-recorded hours as a dash, not as a measured zero', () => {
    const { rows } = summarizeCrewLabor([entry({ crew_id: null, crew_name: null, hours: null, rate: null, amount: 960 })]);
    expect(rowHoursLabel(rows[0])).toBe('—');
    expect(entryHoursLabel(rows[0].entries[0])).toBe('—');
    // A person who genuinely worked no hours in the period, with no broken
    // entry behind it, is still a measurement.
    expect(rowHoursLabel({ hours: 0, issues: [] })).toBe('0h 00m');
    expect(entryHoursLabel({ hours: 2.5, issue: null })).toBe('2.5');
  });

  it('shows the dash in the table, the timesheet drawer and the detail pane', () => {
    expect(HOURS_CODE).toContain('{rowHoursLabel(row)}');
    expect(HOURS_CODE).toContain('{entryHoursLabel(entry)}');
    expect(DETAIL_CODE).toContain('{rowHoursLabel(row)}');
    expect(DETAIL_CODE).toContain('{entryHoursLabel(entry)}');
  });
});

describe('(2) "missing rate" on somebody whose profile says $30/hour', () => {
  // The ARITHMETIC is right and the flag is right. $450 is what the other
  // entries come to; one entry went in at a zero rate.
  const period = [
    entry({ id: 'a', hours: 5, rate: 30, amount: 150 }),
    entry({ id: 'b', hours: 5, rate: 30, amount: 150 }),
    entry({ id: 'c', hours: 5, rate: 30, amount: 150 }),
    entry({ id: 'd', hours: 4, rate: 0, amount: 0 }),
  ];

  it('keeps counting every other entry — the flag is about one entry, not the person', () => {
    const { rows } = summarizeCrewLabor(period);
    expect(rows[0].estimatedPay).toBe(450);
    expect(rows[0].issues).toContain('missing-rate');
    const built = buildPayRows(rows, []);
    expect(built[0].warnings).toContain('missing-rate');
  });

  // THE DEFECT: a per-entry condition wearing a per-person chip.
  it('labels the warning as an entry, the way its sibling "Entry with no hours" already did', () => {
    expect(PAY_WARNING_LABEL['missing-rate']).toBe('Entry with no rate');
    expect(PAY_WARNING_LABEL['missing-rate']).not.toBe('Missing rate');
    expect(PAY_WARNING_LABEL['no-hours']).toBe('Entry with no hours');
  });

  it('says how many entries are affected', () => {
    const { rows } = summarizeCrewLabor(period);
    expect(payWarningChip('missing-rate', rows[0].entries)).toBe('Entry with no rate (1)');
    expect(payWarningChip('no-hours', rows[0].entries)).toBe('Entry with no hours');
    // Warnings that really are about the person get no invented count.
    expect(payWarningChip('unassigned', rows[0].entries)).toBe('No crew member');
  });

  it('stops the help text claiming the person has no rate, and says what to do', () => {
    expect(PAY_WARNING_HELP['missing-rate']).toContain('One or more entries');
    expect(PAY_WARNING_HELP['missing-rate']).toContain('not a claim that the person has no rate');
    expect(PAY_WARNING_FIX['missing-rate']).toContain('already counted correctly');
  });

  it('counts entries, not people, in the reason the export is held back', () => {
    const { rows } = summarizeCrewLabor(period);
    const reason = exportBlockedReason(rows);
    expect(reason).toContain('1 entry');
    expect(reason).toContain('Mike Torres');
    expect(reason).toContain('the rest of the hours are counted as normal');
  });

  // The single most clarifying thing on the screen: the rate that was actually
  // used, beside the hours it was used on.
  it('shows the effective rate per entry, including the entry that has none', () => {
    const { rows } = summarizeCrewLabor(period);
    expect(rateBreakdownLabel(rows[0].entries)).toBe('$30.00/hr on 3 entries · no rate on 1 entry');
    expect(rateBreakdownLabel([])).toBeNull();
  });

  it('puts the effective rate on the table, the drawer and the detail pane', () => {
    expect(HOURS_CODE).toContain('rateBreakdownLabel(row.entries)');
    expect(HOURS_CODE).toContain('Rate used');
    expect(DETAIL_CODE).toContain('rateBreakdownLabel(selected.entries)');
    expect(DETAIL_CODE).toContain('Rate used');
  });
});

describe('(3) hours added after approval', () => {
  const { rows } = summarizeCrewLabor([entry({ id: 'a', hours: 8, amount: 240 }), entry({ id: 'b', hours: 2, amount: 60 })]);

  // NOT auto-revoking is deliberate and stays: a stored record wins, because an
  // owner who approved hours with a warning on them meant it.
  it('leaves the approval standing and shows the difference as an adjustment', () => {
    const [row] = buildPayRows(rows, [record({ approvedAmount: 240 })]);
    expect(row.review).toBe('approved');
    expect(row.adjustment).toBe(60);
    expect(row.warnings).toContain('changed-after-approval');
  });

  // THE REAL DEFECT NOBODY REPORTED: the warning could never be cleared. Every
  // already-approved row was filtered out of the approve action, so pressing
  // Approve answered "There are no hours here left to approve" — and the undo
  // the app told people to use has never existed.
  it('lets a changed approved row be approved again', () => {
    const [row] = buildPayRows(rows, [record({ approvedAmount: 240 })]);
    expect(needsReapproval(row)).toBe(true);
    expect(canApproveRow(row)).toBe(true);
    expect(approveActionLabel(row)).toBe('Re-approve changed hours');
  });

  it('lets a row that only had hours logged after approval be approved again', () => {
    // Same money, later entries: adjustment is zero, so only the timestamp
    // warning marks it.
    const approvedAt = new Date(2026, 6, 26, 9).toISOString();
    const [row] = buildPayRows(rows, [record({ approvedAmount: 300, approvedAt })]);
    expect(row.adjustment).toBe(0);
    expect(row.warnings).toContain('logged-after-approval');
    expect(needsReapproval(row)).toBe(true);
  });

  it('does not offer re-approval when nothing has changed', () => {
    const [row] = buildPayRows(rows, [record({ approvedAmount: 300 })]);
    expect(row.adjustment).toBe(0);
    expect(needsReapproval(row)).toBe(false);
    expect(canApproveRow(row)).toBe(false);
    expect(approveActionLabel(row)).toBe('Re-approve changed hours');
  });

  it('keeps paid rows out of it — money has already gone out against that figure', () => {
    const [row] = buildPayRows(rows, [
      record({ status: 'paid', approvedAmount: 240, paidAmount: 240, paidAt: new Date(2026, 6, 28, 17).toISOString(), paymentDate: '2026-07-28' }),
    ]);
    expect(row.adjustment).toBe(60);
    expect(needsReapproval(row)).toBe(false);
    expect(canApproveRow(row)).toBe(false);
  });

  it('leaves labor with nobody on it, and rows with no hours, unapprovable as before', () => {
    const unassigned = summarizeCrewLabor([entry({ crew_id: null, crew_name: null, hours: null, rate: null, amount: 960 })]);
    const [row] = buildPayRows(unassigned.rows, []);
    expect(canApproveRow(row)).toBe(false);
  });

  it('is wired into the action and all three approve gates', () => {
    // The filter that made re-approval impossible is gone from the action.
    expect(ACTIONS_CODE).not.toContain("row.review !== 'approved'");
    expect(ACTIONS_CODE).toContain('canApproveRow(row) && row.blockers.length === 0');
    // …and the dead end it produced is gone from the message.
    expect(ACTIONS_CODE).toContain('already approved and nothing has changed since');
    // Row menu, Overview pane, detail pane.
    expect(HOURS_CODE.match(/canApproveRow\(row\)/g)?.length).toBe(2);
    expect(HOURS_CODE).toContain('approveActionLabel(row)');
    expect(DETAIL_CODE).toContain('canApproveRow(selected)');
    expect(DETAIL_CODE).toContain('approveActionLabel(selected)');
  });
});

describe('(4) overtime', () => {
  it('counts hours and never multiplies pay', () => {
    // 45 hours at $30 is $1,350 — not $1,575. Nothing in the rollup applies a
    // premium, and the screen has to say so rather than leave "OT 5h" beside a
    // pay figure to imply one.
    const { rows, totalOvertime, totalPay } = summarizeCrewLabor([
      entry({ id: 'a', hours: 40, amount: 1200 }),
      entry({ id: 'b', hours: 5, amount: 150 }),
    ]);
    expect(totalOvertime).toBe(5);
    expect(totalPay).toBe(1350);
    expect(rows[0].regularHours).toBe(40);
  });

  it('states the policy in one place, in words', () => {
    expect(OVERTIME_POLICY).toContain('counted, not paid at a premium');
    expect(PAY_WARNING_HELP.overtime).toContain(OVERTIME_POLICY);
    expect(PAY_WARNING_FIX.overtime).toContain('no premium is applied');
  });

  it('says it on the screens that show overtime hours', () => {
    expect(HOURS_CODE).toContain('OVERTIME_POLICY');
    expect(HOURS_CODE).toContain('(hours only)');
    expect(DETAIL_CODE).toContain('Hours over the threshold (not paid extra)');
    // The old bare "OT 5h 00m" beside estimated pay, with nothing to say the
    // pay is not adjusted, is gone from the detail pane.
    expect(DETAIL_CODE).not.toContain('` · OT ${hoursLabel(selected.overtimeHours)}`');
  });
});

describe('the one period picker', () => {
  it('lands on the period that contains a date, whatever the length', () => {
    // 29 July 2026 is a Wednesday; 15 July is two weeks earlier.
    expect(offsetForDate('weekly', '2026-07-29', { now: NOW })).toBe(0);
    expect(offsetForDate('weekly', '2026-07-15', { now: NOW })).toBe(-2);
    expect(offsetForDate('weekly', '2026-08-05', { now: NOW })).toBe(1);
    expect(offsetForDate('monthly', '2026-03-02', { now: NOW })).toBe(-4);
    expect(offsetForDate('monthly', '2027-01-31', { now: NOW })).toBe(6);
    // A biweekly period is anchored to a fixed fortnight, so a date one week
    // back is still inside the current period.
    expect(offsetForDate('biweekly', '2026-07-29', { now: NOW })).toBe(0);
    expect(offsetForDate('biweekly', '2026-07-01', { now: NOW })).toBe(-2);
  });

  it('refuses to be walked off the end of the calendar by a hand-edited URL', () => {
    expect(offsetForDate('weekly', '1990-01-01', { now: NOW })).toBe(-260);
    expect(offsetForDate('weekly', 'not-a-date', { now: NOW })).toBe(0);
    expect(offsetForDate('custom', '2026-07-15', { now: NOW })).toBe(0);
  });

  it('replaces the duplicated arrows, shortcuts and Go control with one bar', () => {
    expect(PERIOD_BAR_CODE).toContain('offsetForDate');
    expect(PERIOD_BAR_CODE).toContain('Current period');
    expect(PERIOD_BAR_CODE).toContain('Jump to');
    // The quick-filter strip and the custom-range Go button are gone.
    expect(HOURS_CODE).not.toContain('QUICK_PERIODS');
    expect(HOURS_CODE).not.toContain('>Go<');
  });
});

describe('the summary cards, and what leads the page', () => {
  it('shows which card is the filter currently applied', () => {
    expect(HOURS_CODE).toContain('aria-pressed={on}');
    expect(HOURS_CODE).toContain('sameFilter(stat.filter, currentFilter)');
    // Pressing the applied card again goes back to everyone.
    expect(HOURS_CODE).toContain('applyFilter(on ? ALL_FILTER : stat.filter!)');
  });

  it('puts older unpaid money above an empty current period', () => {
    expect(HOURS_CODE).toContain('const owedLeadsHere = outstanding.length > 0 && (rows.length === 0 || totals.unpaidPay === 0)');
    expect(HOURS_CODE).toContain('{owedLeadsHere ? owedStrip : null}');
  });

  it('says what the CSV covers, and describes the payroll file before it is downloaded', () => {
    expect(HOURS_CODE).toContain('Export {visible.length} shown');
    expect(HOURS_CODE).toContain('function prepareForPayroll');
    expect(HOURS_CODE).toContain('Download this file');
    expect(HOURS_CODE).toContain('Total in the file');
  });
});

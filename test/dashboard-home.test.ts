import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectSchedulingIssues, schedulingIssueBreakdown } from '@/lib/scheduling-issues';
import {
  collectedInWindow,
  outstandingInvoices,
  quotesAwaitingApproval,
  scheduledWorkValue,
} from '@/lib/dashboard-money';
import { leadNeedsYouBreakdown, leadSummary } from '@/lib/lead-summary';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');
const SCREEN = read('src', 'app', 'dashboard', 'DashboardHomeScreen.tsx');
/**
 * The screen with its comments stripped, for assertions about what RENDERS.
 *
 * This file explains its own history at length — the comments name "Business
 * snapshot" and quote the buttons that moved — so a bare `toContain` against
 * the raw source matches the explanation of a thing being removed and calls it
 * present. Same treatment PANEL_CODE gets in choice-reminders-panel.test.ts.
 */
const SCREEN_CODE = SCREEN.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
/** ...and with JSX line-wrapping flattened, for assertions about prose. */
const SCREEN_TEXT = SCREEN_CODE.replace(/\s+/g, ' ');
const DATA = read('src', 'lib', 'dashboard-home-data.ts');

const job = (id: string, over: Partial<{ status: string; scheduled_time: string | null }> = {}) => ({
  id,
  status: over.status ?? 'in_progress',
  scheduled_time: over.scheduled_time === undefined ? '09:00' : over.scheduled_time,
});

/**
 * "7 scheduling issues" is a UNION, not a sum.
 *
 * Two independent over-counts made the old rows wrong before anything was added
 * together — see lib/scheduling-issues for both.
 */
describe('scheduling issues are counted per job', () => {
  it('counts a multi-day job once, not once per day', () => {
    // expandScheduledJobs emits one row per calendar day a job occupies, each a
    // full copy carrying the same id. A three-day job with no crew scored three.
    const issues = collectSchedulingIssues({
      windowOccurrences: [job('a'), job('a'), job('a')],
      assignmentsByJob: {},
      unscheduledJobIds: [],
    });
    expect(issues.needsCrew).toEqual(['a']);
    expect(issues.all).toEqual(['a']);
  });

  /**
   * The default state of every newly scheduled job: scheduled_time is created
   * null and crew_assignments starts empty. So this is the common case, not an
   * edge case.
   */
  it('counts a job needing BOTH crew and a time once in the total', () => {
    const issues = collectSchedulingIssues({
      windowOccurrences: [job('a', { scheduled_time: null })],
      assignmentsByJob: {},
      unscheduledJobIds: [],
    });
    expect(issues.needsCrew).toEqual(['a']);
    expect(issues.missingTime).toEqual(['a']);
    expect(issues.all).toEqual(['a']);
    // The headline is smaller than the sum of its reasons, by design.
    expect(issues.all.length).toBeLessThan(issues.needsCrew.length + issues.missingTime.length);
  });

  it('never lets the total exceed the number of distinct jobs', () => {
    const issues = collectSchedulingIssues({
      windowOccurrences: [job('a', { scheduled_time: null }), job('a'), job('b'), job('b')],
      assignmentsByJob: { b: ['crew-1'] },
      unscheduledJobIds: ['c', 'c', 'd'],
    });
    // a: no crew + no time. b: has crew and a time — no issue. c, d: unscheduled.
    expect(issues.all).toEqual(['a', 'c', 'd']);
  });

  /**
   * The three counts did not previously agree with each other: the unscheduled
   * list excluded complete and archived, the other two excluded only archived.
   * So a finished job with no crew recorded was a "scheduling issue" and sent
   * the owner to act on work that was over.
   */
  it('ignores work that is already finished or cancelled', () => {
    const issues = collectSchedulingIssues({
      windowOccurrences: [job('done', { status: 'complete' }), job('gone', { status: 'archived' })],
      assignmentsByJob: {},
      unscheduledJobIds: [],
    });
    expect(issues.all).toEqual([]);
  });

  it('says nothing when there is nothing outstanding', () => {
    const issues = collectSchedulingIssues({ windowOccurrences: [], assignmentsByJob: {}, unscheduledJobIds: [] });
    expect(issues.all).toEqual([]);
    expect(schedulingIssueBreakdown(issues)).toBeNull();
  });

  it('phrases the breakdown as reasons, and admits when they overlap', () => {
    const overlapping = collectSchedulingIssues({
      windowOccurrences: [job('a', { scheduled_time: null })],
      assignmentsByJob: {},
      unscheduledJobIds: ['b'],
    });
    const text = schedulingIssueBreakdown(overlapping) as string;
    expect(text).toContain('1 needs a crew');
    expect(text).toContain('1 needs a start time');
    expect(text).toContain("1 isn't on the calendar");
    // Without this the reader adds 1+1+1, gets 3, and sees a headline of 2.
    expect(text).toContain('some need more than one');
  });

  it('drops the disclaimer when the reasons really do tie', () => {
    const clean = collectSchedulingIssues({
      windowOccurrences: [job('a')],
      assignmentsByJob: {},
      unscheduledJobIds: ['b'],
    });
    expect(clean.all).toHaveLength(2);
    expect(schedulingIssueBreakdown(clean)).not.toContain('more than one');
  });

  it('is what the dashboard headline reads, and the rows are gone', () => {
    expect(DATA).toContain('collectSchedulingIssues({');
    expect(DATA).toContain('const schedulingIssueCount = schedulingIssues.all.length;');
    expect(DATA).toMatch(/label: `\$\{schedulingIssueCount\} scheduling issue/);
    // The three separate priority rows that invited the reader to add up.
    expect(DATA).not.toContain("key: 'crew',");
    expect(DATA).not.toContain("key: 'time',");
    expect(DATA).not.toContain("key: 'unscheduled',");
  });
});

/**
 * The card said "5 leads need your attention" and then explained two of them.
 */
describe('the lead follow-up sentence accounts for every lead in it', () => {
  const leads = (spec: Array<[string, string?]>) => leads_(spec);
  function leads_(spec: Array<[string, string?]>) {
    return spec.map(([status, source]) => ({ status: status as never, source: source ?? 'manual' }));
  }

  it('names new, other-new and contacted', () => {
    const summary = leadSummary(leads([
      ['new', 'website_form'], ['new', 'website_form'], ['new', 'website_form'], ['new', 'website_form'],
      ['contacted'],
    ]));
    expect(summary.needsYou).toBe(5);
    expect(leadNeedsYouBreakdown(summary)).toBe('4 website leads and 1 contacted lead need follow-up.');
  });

  it('separates website leads from the ones that came in another way', () => {
    const summary = leadSummary(leads([['new', 'website_form'], ['new', 'manual'], ['contacted']]));
    const text = leadNeedsYouBreakdown(summary);
    expect(text).toContain('1 website lead');
    expect(text).toContain('1 other new lead');
    expect(text).toContain('1 contacted lead');
  });

  it('agrees the verb with the whole subject, not the last clause', () => {
    expect(leadNeedsYouBreakdown(leadSummary(leads([['contacted']])))).toBe('1 contacted lead needs follow-up.');
    // A compound subject ending in a singular clause still takes the plural.
    expect(leadNeedsYouBreakdown(leadSummary(leads([['new', 'website_form'], ['new', 'website_form'], ['contacted']]))))
      .toBe('2 website leads and 1 contacted lead need follow-up.');
  });

  it('says so plainly when nothing is waiting', () => {
    expect(leadNeedsYouBreakdown(leadSummary([]))).toBe('Nothing waiting on you.');
  });

  it('never counts quoted leads — those are waiting on the customer', () => {
    const summary = leadSummary(leads([['quoted'], ['quoted'], ['new']]));
    expect(summary.needsYou).toBe(1);
    expect(leadNeedsYouBreakdown(summary)).not.toContain('quoted');
  });
});

/**
 * Two of these already had two rival implementations in this codebase. The
 * point of the module is that they now have one each.
 */
describe('the money figures', () => {
  it('nets deposits off what is owed, rather than summing invoice face value', () => {
    // invoices.status only flips to 'paid' at the FULL total, so a $10,000
    // invoice with a $4,000 deposit banked is still 'sent'. Face value tells
    // the owner they are owed $10,000.
    const result = outstandingInvoices(
      [{ id: 'i1', total: 10000, status: 'sent' }],
      [{ amount: 4000, status: 'paid', invoice_id: 'i1' }],
    );
    expect(result.total).toBe(6000);
    expect(result.count).toBe(1);
  });

  it('subtracts refunds from what a payment settled', () => {
    const result = outstandingInvoices(
      [{ id: 'i1', total: 1000, status: 'signed' }],
      [{ amount: 400, refunded_amount: 150, status: 'paid', invoice_id: 'i1' }],
    );
    expect(result.total).toBe(750);
  });

  it('ignores drafts, void and fully settled invoices', () => {
    const result = outstandingInvoices(
      [
        { id: 'a', total: 500, status: 'draft' },
        { id: 'b', total: 500, status: 'void' },
        { id: 'c', total: 500, status: 'paid' },
        { id: 'd', total: 500, status: 'sent' },
      ],
      [],
    );
    expect(result).toEqual({ total: 500, count: 1 });
  });

  /**
   * Over-collection is something to look into, not a credit to hand back
   * against what other customers owe.
   */
  it('never lets an over-paid invoice reduce the total', () => {
    const result = outstandingInvoices(
      [{ id: 'a', total: 100, status: 'sent' }, { id: 'b', total: 500, status: 'sent' }],
      [{ amount: 300, status: 'paid', invoice_id: 'a' }],
    );
    expect(result.total).toBe(500);
    expect(result.count).toBe(1);
  });

  it('counts quotes as priced jobs still at the quote stage', () => {
    const result = quotesAwaitingApproval([
      { id: 'a', status: 'new_lead', quoted_amount: 1200 },
      { id: 'b', status: 'new_lead', quoted_amount: 0 },
      { id: 'c', status: 'in_progress', quoted_amount: 900 },
    ]);
    expect(result).toEqual({ total: 1200, count: 1 });
  });

  /**
   * Booked work is WORK VALUE. An unapproved quote with a pencilled-in date is
   * not booked, and counting it would put the same job in both "out for
   * approval" and "booked".
   */
  it('counts only approved work inside the window as booked', () => {
    const jobs = [
      { id: 'a', status: 'in_progress', quoted_amount: 1000, scheduled_for: '2026-08-15' },
      { id: 'b', status: 'new_lead', quoted_amount: 5000, scheduled_for: '2026-08-15' },
      { id: 'c', status: 'in_progress', quoted_amount: 700, scheduled_for: '2026-10-01' },
      { id: 'd', status: 'complete', quoted_amount: 400, scheduled_for: '2026-08-15' },
    ];
    expect(scheduledWorkValue(jobs, '2026-08-09', '2026-09-08')).toEqual({ total: 1000, count: 1 });
  });

  it('collects net of refunds, end-exclusive', () => {
    const payments = [
      { amount: 500, status: 'paid', paid_at: '2026-08-05T12:00:00.000Z' },
      { amount: 300, refunded_amount: 100, status: 'paid', paid_at: '2026-08-20T12:00:00.000Z' },
      // Exactly the end instant — belongs to next month.
      { amount: 999, status: 'paid', paid_at: '2026-09-01T00:00:00.000Z' },
      { amount: 999, status: 'requested', paid_at: '2026-08-10T12:00:00.000Z' },
    ];
    expect(collectedInWindow(payments, '2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'))
      .toEqual({ total: 700, count: 2 });
  });

  /**
   * Every money figure in insights cuts its boundaries with server-local Date
   * methods. A payment at 5pm on the 31st in Los Angeles has a UTC timestamp in
   * the next month — the owner calls it July, the dashboard says August.
   */
  it('takes its month boundary from the account timezone', () => {
    expect(DATA).toContain("resolvePayPeriod('monthly', 0, { now, timeZone })");
    expect(DATA).toMatch(/const timeZone = \(account\?\.timezone as string\)/);
  });
});

describe('the page answers three questions in order', () => {
  it('renders Act now, Waiting, Next 7 days, Money, Automations', () => {
    // Rendered headings, not bare words — "Money" alone also matches the
    // formatMoney import on line 4.
    const order = ['>Act now<', '>Waiting<', '>Next 7 days<', '>Money<', 'dash-automations-summary'];
    let last = -1;
    for (const marker of order) {
      const at = SCREEN_CODE.indexOf(marker);
      expect(at, `${marker} is missing`).toBeGreaterThan(-1);
      expect(at, `${marker} is out of order`).toBeGreaterThan(last);
      last = at;
    }
  });

  it('replaced Business snapshot, which repeated the page back at itself', () => {
    expect(SCREEN_CODE).not.toContain('Business snapshot');
    // The two figures it duplicated from higher up the page.
    expect(SCREEN_CODE).not.toContain('Open leads');
    expect(SCREEN_CODE).not.toContain('Jobs in the next 7 days');
  });

  it('shows the four money figures', () => {
    for (const label of ['Unpaid invoices', 'Out for approval', 'Booked, next 30 days', 'Collected in ']) {
      expect(SCREEN_CODE, label).toContain(label);
    }
  });

  /**
   * A job with a banked deposit contributes its whole quoted amount to booked
   * work AND that same dollar to collected. Right for two different questions,
   * wrong if either tile claimed to be the other — so the tile says which it is.
   */
  it('calls booked work value, never revenue', () => {
    expect(SCREEN_TEXT).toContain('Work value, not cash');
    expect(SCREEN_CODE).not.toContain('Scheduled revenue');
  });

  it('moved the site buttons out of the money section into Quick links', () => {
    const quicklinks = SCREEN_CODE.indexOf('dash-quicklinks');
    expect(quicklinks).toBeGreaterThan(-1);
    expect(SCREEN_CODE.indexOf('Visit your site')).toBeGreaterThan(quicklinks);
    expect(SCREEN_CODE.indexOf('Online booking page')).toBeGreaterThan(quicklinks);
    // And they are no longer inside the money card.
    const money = SCREEN_CODE.slice(SCREEN_CODE.indexOf('>Money<'), quicklinks);
    expect(money).not.toContain('Visit your site');
  });

  it('compresses automations to one line that opens on demand', () => {
    expect(SCREEN_CODE).toContain('dash-automations-summary');
    expect(SCREEN_CODE).toMatch(/Automations handled \$\{automation\.total\}/);
    expect(SCREEN_CODE).toContain('All systems active');
    // Open by default only when every automation is off — the one case that is
    // genuinely a problem rather than a quiet success.
    expect(SCREEN_CODE).toContain('open={automationsOn === 0}');
  });

  it('points at the automations page, not the old settings anchor', () => {
    expect(SCREEN_CODE).toContain('${basePath}/automations');
    expect(SCREEN_CODE).not.toContain('/settings#reviews');
  });
});

/**
 * The Waiting list is the one .priority-item without a .priority-index.
 *
 * .priority-item is a three-column grid — 34px badge, message, action — so the
 * badge-less row put the message in the 34px track. It rendered as one word per
 * line with the action printed over the top of it. The count of children and
 * the count of columns have to agree, and nothing but a rule says so.
 */
describe('the Waiting rows have as many columns as they have children', () => {
  const CSS = read('src', 'app', 'globals.css')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  it('renders Waiting without a numbered index, unlike Act now', () => {
    const waiting = SCREEN_CODE.indexOf('dash-waiting');
    expect(waiting).toBeGreaterThan(-1);
    // Act now numbers its rows; Waiting deliberately does not.
    expect(SCREEN_CODE.slice(0, waiting)).toContain('priority-index');
    expect(SCREEN_CODE.slice(waiting)).not.toContain('priority-index');
  });

  it('still reserves a badge column for the rows that have a badge', () => {
    // Guards the premise: if this ever stops being a three-column grid the
    // override below is dead weight rather than a fix.
    expect(CSS).toContain('.priority-item {\n  display: grid;\n  grid-template-columns: 34px minmax(0, 1fr) auto;');
  });

  it('gives Waiting two columns instead, so the message gets the 1fr track', () => {
    expect(CSS).toContain('.dash-waiting .priority-item { grid-template-columns: minmax(0, 1fr) auto; }');
  });

  it('stacks Waiting into column 1 on a phone, not the action track', () => {
    // The shared phone layout moves both children to column 2 to clear the
    // badge. With no badge there is no column 2 to move to.
    const mobile = CSS.slice(CSS.indexOf('.dash-waiting .priority-item { grid-template-columns: minmax(0, 1fr); }'));
    expect(mobile.length).toBeGreaterThan(0);
    expect(mobile).toMatch(/\.dash-waiting \.priority-copy,\s*\n\s*\.dash-waiting \.priority-cta \{ grid-column: 1; \}/);
  });
});

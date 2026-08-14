import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { completionBlockers, completionPreflight } from '@/lib/job-badges';
import {
  completeJobNeedsConfirm,
  type CompleteJobWarningInput,
} from '@/lib/job-detail-labels';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const JOB_ACTIONS = read('src', 'app', 'dashboard', 'jobs', 'actions.ts');
const FIELD_ACTIONS = read('src', 'app', 'field', 'jobs', '[id]', 'actions.ts');
const JOB_FEED = read('src', 'lib', 'job-feed.ts');
const JOB_PAGE = read('src', 'app', 'dashboard', 'jobs', '[id]', 'page.tsx');
const START_BUTTON = read('src', 'app', 'dashboard', 'jobs', '[id]', 'StartJobButton.tsx');
// The crew's status write moved out of the field action and into one narrow
// database function, because a crew session may no longer update `jobs` at all.
const CREW_JOB_STATUS = read('src', 'lib', 'crew-job-status.ts');
const SCHEMA = read('schema.sql');

/**
 * Where a quote stops being a quote.
 *
 * "Job started" wrote status: 'in_progress' straight onto a job still at the
 * quote stage — the right end state reached the wrong way. Nothing recorded that
 * the customer had agreed, the lead behind it stayed unwon, and because Insights
 * counts conversions from quote_approved feed rows, the contractor's own
 * conversion rate never saw it. The same bug "Mark won" had, in a different
 * button, and a third time in the crew's field app.
 */

describe('every way out of the quote stage records the acceptance', () => {
  it('names the two new ways in the one definition of accepted', () => {
    expect(JOB_FEED).toContain("| 'work_started'");
    expect(JOB_FEED).toContain("| 'work_completed'");
    expect(JOB_FEED).toContain("work_started: 'Quote accepted (work started)'");
    expect(JOB_FEED).toContain("work_completed: 'Quote accepted (job completed)'");
  });

  it('the owner pressing Job started', () => {
    const action = JOB_ACTIONS.slice(
      JOB_ACTIONS.indexOf('export async function markJobStartedAction('),
      JOB_ACTIONS.indexOf('export async function undoJobStartedAction('),
    );
    expect(action).toContain("if (job.status === 'new_lead') {");
    expect(action).toContain("source: 'work_started'");
    // Before the start is stamped: the acceptance is the earlier fact.
    expect(action.indexOf('applyQuoteAcceptance(')).toBeLessThan(action.indexOf('started_at: startedAt'));
  });

  it('the owner pressing Mark complete', () => {
    const action = JOB_ACTIONS.slice(
      JOB_ACTIONS.indexOf('export async function markJobCompleteAction('),
      JOB_ACTIONS.indexOf('export async function undoJobCompleteAction('),
    );
    expect(action).toContain("source: 'work_completed'");
  });

  it('and the crew pressing either one in the field', () => {
    expect(FIELD_ACTIONS).toContain('applyQuoteAcceptance');
    expect(FIELD_ACTIONS).toContain("current?.status === 'new_lead'");
    expect(FIELD_ACTIONS).toMatch(/source: status === 'complete' \? 'work_completed' : 'work_started'/);
  });

  /**
   * started_at is what every owner-facing surface reads to tell "on the
   * calendar" from "underway" — the badge, the pipeline step, the late-arrival
   * sweep. The field app never set it, so a job the crew had started still
   * showed the owner a "Job started" button to press.
   *
   * IT IS NO LONGER STAMPED IN THIS FILE, and that is the fix rather than a
   * regression. Writing status and started_at together through the crew's own
   * client was refused outright by crew_jobs_update_guard, which permits crew
   * `status` and nothing else — so the press that was supposed to stamp the
   * column raised instead, and the job never started at all. Both facts now
   * happen inside crew_set_job_status(), one statement, in the database.
   */
  it('the field app stamps the start time the owner’s surfaces read', () => {
    expect(FIELD_ACTIONS).toContain('setCrewJobStatus(');
    expect(CREW_JOB_STATUS).toContain("rpc('crew_set_job_status'");
    // Set on the way in and never re-dated, in the SQL and in the fallback the
    // pre-migration deploy window uses.
    expect(SCHEMA).toContain('started_at = coalesce(jobs.started_at, now())');
    expect(CREW_JOB_STATUS).toContain('...(current.started_at ? {} : { started_at: new Date().toISOString() })');
  });

  it('never drags a job backwards, on any path', () => {
    // Promotion is conditional on still being at the quote stage, in the one
    // function; the callers only ever ask when they are there.
    const apply = JOB_FEED.slice(JOB_FEED.indexOf('export async function applyQuoteAcceptance('));
    expect(apply).toMatch(/if \(job\.status === 'new_lead'\) \{/);
  });

  it('is best-effort everywhere — a failed record never blocks the press', () => {
    for (const source of [JOB_ACTIONS, FIELD_ACTIONS]) {
      const at = source.indexOf('applyQuoteAcceptance(');
      expect(source.slice(Math.max(0, at - 400), at)).toContain('try {');
    }
  });
});

describe('and says so before it happens', () => {
  it('the start button asks when the quote is unapproved', () => {
    expect(START_BUTTON).toContain('quoteUnapproved');
    expect(START_BUTTON).toContain('window.confirm');
    // No dialog on an approved job — nothing surprising happens there.
    expect(START_BUTTON).toContain('if (!quoteUnapproved) return;');
    expect(JOB_PAGE).toContain("quoteUnapproved={job.status === 'new_lead'}");
  });

  it('the preflight names what the customer will see', () => {
    const button = read('src', 'app', 'dashboard', 'jobs', '[id]', 'CompleteJobButton.tsx');
    expect(button).toContain('{input.quoteUnapproved ? (');
    expect(button).toContain('This quote was never approved.');
    expect(button).toContain('records that {who} accepted it');
    expect(button).toContain('conversion rate');
  });

  it('and asks at all, which it would not have before', () => {
    const base: CompleteJobWarningInput = {
      clientName: 'Sarah',
      autoReviewRequest: false,
      reviewUrlConfigured: false,
      alreadyRequested: false,
      channel: null,
    };
    expect(completeJobNeedsConfirm(base)).toBe(false);
    expect(completeJobNeedsConfirm({ ...base, quoteUnapproved: true })).toBe(true);
  });
});

/**
 * What is still outstanding when a job is closed.
 *
 * Never a block. Every item is something a contractor can rightly close a job
 * over — the cheque arrives next week, the punch list got done and nobody ticked
 * it — and a hard refusal would teach people to leave jobs open, which is worse:
 * an open job is invisible in every "what's left" count in the app. The failure
 * being fixed is not "they completed a job they shouldn't have", it is "nobody
 * told them $4,200 was unpaid and then the job disappeared".
 */
describe('what is still open on a job being closed', () => {
  it('says nothing about a job with nothing outstanding', () => {
    expect(completionBlockers({ outstandingBalance: 0, openSelections: 0, openTasks: 0 })).toEqual([]);
  });

  it('leads with the money', () => {
    const blockers = completionBlockers({ outstandingBalance: 4200, openSelections: 2, openTasks: 3 });
    expect(blockers[0]).toContain('$4,200');
    expect(blockers[0]).toContain('still unpaid');
  });

  it('distinguishes an unpaid balance from nothing billed at all', () => {
    expect(completionBlockers({ outstandingBalance: 500 })[0]).toContain('still unpaid');
    expect(completionBlockers({ nothingBilled: true })[0]).toBe('nothing has been invoiced or charged yet');
    // Not both — an outstanding balance means something WAS billed.
    expect(completionBlockers({ outstandingBalance: 500, nothingBilled: true })).toHaveLength(1);
  });

  it('counts choices and checklist items separately, and gets the grammar right', () => {
    expect(completionBlockers({ openSelections: 1 })).toEqual(['1 client choice is still waiting']);
    expect(completionBlockers({ openSelections: 2 })).toEqual(['2 client choices are still waiting']);
    expect(completionBlockers({ openTasks: 1 })).toEqual(['1 checklist item is unticked']);
    expect(completionBlockers({ openTasks: 4 })).toEqual(['4 checklist items are unticked']);
  });

  it('ignores nonsense rather than printing it', () => {
    expect(completionBlockers({ openSelections: -3, openTasks: Number.NaN, outstandingBalance: -100 })).toEqual([]);
    expect(completionBlockers({})).toEqual([]);
  });

  /**
   * A LIST WITH SOMEWHERE TO GO, which is the whole reason the confirm box had
   * to become a real screen. "$4,200 is still unpaid" is a different sentence
   * when the thing that fixes it is beside it rather than somewhere on a page
   * you have to go and find.
   */
  it('gives every outstanding item a fix beside it', () => {
    const items = completionPreflight({ outstandingBalance: 4200, openSelections: 1, openTasks: 2 });
    expect(items.map((item) => item.key)).toEqual(['balance', 'selections', 'tasks']);
    expect(items.map((item) => item.text)).toEqual([
      '$4,200 is still unpaid',
      '1 client choice is still waiting',
      '2 checklist items are unticked',
    ]);
    for (const item of items) {
      expect(item.fix.href).toBeTruthy();
      expect(item.fix.label).toBeTruthy();
    }
  });

  /** Relative, so they resolve against whichever job page is showing them and
   *  the function can never be handed the wrong id. */
  it('points each fix at a section that exists on the job page', () => {
    const jobPage = read('src', 'app', 'dashboard', 'jobs', '[id]', 'page.tsx');
    for (const item of completionPreflight({ outstandingBalance: 500, openSelections: 1, openTasks: 1, nothingBilled: true })) {
      expect(item.fix.href.startsWith('#') || item.fix.href.startsWith('?')).toBe(true);
      const anchor = item.fix.href.slice(item.fix.href.indexOf('#') + 1);
      expect(jobPage, anchor).toContain(`id="${anchor}"`);
    }
  });

  it('is explicit that completing does not resolve any of it', () => {
    const button = read('src', 'app', 'dashboard', 'jobs', '[id]', 'CompleteJobButton.tsx');
    expect(button).toContain('Still open on this job');
    expect(button).toContain('doesn&apos;t cancel any of it');
  });

  it('turns the confirm on, and only when there is something to say', () => {
    const base: CompleteJobWarningInput = {
      clientName: 'Sarah',
      autoReviewRequest: false,
      reviewUrlConfigured: false,
      alreadyRequested: false,
      channel: null,
    };
    expect(completeJobNeedsConfirm({ ...base, blockers: [] })).toBe(false);
    expect(completeJobNeedsConfirm({ ...base, blockers: ['$5 is still unpaid'] })).toBe(true);
  });

  it('is wired to the real numbers on the job page', () => {
    expect(JOB_PAGE).toContain('blockers: completionBlockers({');
    expect(JOB_PAGE).toContain('openSelections: selectionStatus.waiting');
    expect(JOB_PAGE).toContain('openTasks: taskStats.total - taskStats.done');
    expect(JOB_PAGE).toContain('outstandingBalance');
  });
});

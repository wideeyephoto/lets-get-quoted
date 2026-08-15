import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isFullyReady,
  isRequestedToday,
  jobBlockers,
  queueRank,
  type ReadinessInput,
} from '@/lib/schedule-readiness';

/**
 * The schedule page's three self-contradictions, and what replaced them.
 *
 * 1. Every job in the queue got the same orange "Schedule" button — including
 *    the ones sitting under a row that said "Quote not approved".
 * 2. The scheduling drawer had no background at all, so the calendar showed
 *    through the panel's own text.
 * 3. The card and the panel each decided for themselves what a job was missing,
 *    and neither mentioned the address.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
const stripJs = (source: string) =>
  source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const stripCss = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '');

const BENCH = stripJs(read('src', 'app', 'dashboard', 'schedule', 'ScheduleWorkbench.tsx'));
const PANEL = stripJs(read('src', 'app', 'dashboard', 'schedule', 'SchedulePanel.tsx'));
const HANDLE = stripJs(read('src', 'app', 'dashboard', 'schedule', 'JobDragHandle.tsx'));
const CSS = stripCss(read('src', 'app', 'globals.css'));

function ruleFor(selector: string): string {
  const start = CSS.search(new RegExp(`^[ \\t]*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{`, 'm'));
  expect(start, `${selector} has no rule`).toBeGreaterThan(-1);
  return CSS.slice(start, CSS.indexOf('}', start));
}

function job(over: Partial<ReadinessInput> = {}): ReadinessInput {
  return {
    id: 'job-1',
    approved: true,
    estimatedHours: 4,
    crewIds: ['crew-1'],
    address: '22 Linden Ct, Royal Oak MI',
    ...over,
  };
}

/* ===========================================================================
   1. What a job is short of
   ======================================================================== */
describe('jobBlockers', () => {
  it('finds nothing on a job that is ready', () => {
    expect(jobBlockers(job())).toEqual([]);
    expect(isFullyReady(job())).toBe(true);
  });

  it('names all four, in the order they matter', () => {
    const blockers = jobBlockers({ id: 'j', approved: false, estimatedHours: null, crewIds: [], address: null });
    expect(blockers.map((b) => b.key)).toEqual(['approval', 'duration', 'crew', 'address']);
  });

  it('treats a whitespace address as no address', () => {
    expect(jobBlockers(job({ address: '   ' })).map((b) => b.key)).toEqual(['address']);
  });

  it('treats a zero duration as no duration', () => {
    // 0 hours is not an estimate, it is the absence of one — and an unestimated
    // job is why a day can read as empty when it is full.
    expect(jobBlockers(job({ estimatedHours: 0 })).map((b) => b.key)).toEqual(['duration']);
  });

  it('points the fixable ones at the job page and leaves crew to the panel', () => {
    const blockers = jobBlockers({ id: 'j7', approved: false, estimatedHours: null, crewIds: [], address: null });
    const byKey = Object.fromEntries(blockers.map((b) => [b.key, b]));
    expect(byKey.approval.href).toBe('/dashboard/jobs/j7');
    expect(byKey.duration.href).toBe('/dashboard/jobs/j7');
    expect(byKey.address.href).toBe('/dashboard/jobs/j7');
    // Crew is assigned in the scheduling panel itself, so sending somebody to
    // another page for it would be sending them away from the control.
    expect(byKey.crew.href).toBeUndefined();
  });

  it('gives every blocker both a chip and a sentence', () => {
    for (const blocker of jobBlockers({ id: 'j', approved: false, estimatedHours: null, crewIds: [], address: null })) {
      expect(blocker.short.length, blocker.key).toBeGreaterThan(0);
      expect(blocker.label.length, blocker.key).toBeGreaterThan(blocker.short.length);
    }
  });
});

/* ===========================================================================
   2. Queue order
   ======================================================================== */
describe('queueRank', () => {
  it('puts approved work above unapproved, whatever else is missing', () => {
    // A sold job missing everything still outranks a quote nobody accepted:
    // one needs filling in, the other might never happen.
    const soldButBare = job({ estimatedHours: null, crewIds: [], address: null });
    const unapprovedButComplete = job({ approved: false });
    expect(queueRank(soldButBare)).toBeLessThan(queueRank(unapprovedButComplete));
  });

  it('within a group, the closest to finishable comes first', () => {
    expect(queueRank(job())).toBeLessThan(queueRank(job({ crewIds: [] })));
    expect(queueRank(job({ crewIds: [] }))).toBeLessThan(queueRank(job({ crewIds: [], estimatedHours: null })));
  });

  it('does not let approval be counted twice', () => {
    // approval is the major key; counting it again among the outstanding items
    // would make an unapproved-but-complete job rank below an unapproved one
    // that is missing a single field.
    expect(queueRank(job({ approved: false }))).toBe(100);
  });
});

describe('isRequestedToday', () => {
  it('is true only for a timestamp on the account’s own today', () => {
    expect(isRequestedToday('2026-08-13T18:04:00.000Z', '2026-08-13')).toBe(true);
    expect(isRequestedToday('2026-08-12T23:59:00.000Z', '2026-08-13')).toBe(false);
    expect(isRequestedToday(null, '2026-08-13')).toBe(false);
  });
});

/* ===========================================================================
   3. The approval contradiction
   ======================================================================== */
describe('an unapproved quote is not offered the same next step as sold work', () => {
  it('approved work keeps the one primary Schedule action', () => {
    expect(BENCH).toContain('{job.approved ? (');
    expect(BENCH).toMatch(/className="btn primary sched-row-go"[\s\S]{0,200}Schedule\s*<\/button>/);
  });

  it('an unapproved one leads with the thing that unblocks it', () => {
    expect(BENCH).toContain('Review quote');
    expect(BENCH).toContain('href={`/dashboard/jobs/${job.id}`}');
  });

  it('and keeps scheduling available, named for what it actually is', () => {
    // The product does allow a date on an unapproved job. Removing that would
    // be taking away a capability rather than fixing a label.
    expect(BENCH).toContain('Tentatively schedule');
    expect(PANEL).toContain("{job.approved ? 'Schedule job' : 'Tentatively schedule'}");
  });

  it('so the word "Schedule" is never the sole action on an unapproved row', () => {
    const unapprovedBranch = BENCH.slice(BENCH.indexOf('{job.approved ? ('));
    const elseBranch = unapprovedBranch.slice(unapprovedBranch.indexOf(') : ('));
    expect(elseBranch).not.toMatch(/>\s*Schedule\s*</);
  });
});

/* ===========================================================================
   4. The drawer that was never opaque
   ======================================================================== */
describe('the scheduling drawer has a background', () => {
  it('does not reference a token this stylesheet has never defined', () => {
    // `--panel` is defined only in feature-wheel-story.css,
    // command-center-deck.css and flagship.module.css — all scoped to marketing
    // components that never render on /dashboard. The declaration was invalid
    // here, so the panel painted transparent over the calendar.
    const rule = ruleFor('.sched-detail');
    expect(rule).not.toContain('var(--panel)');
    expect(rule).toContain('background: rgb(var(--panel-rgb))');
  });

  it('is fully opaque, not merely less transparent', () => {
    // var(--bg-elevated) is rgba(...,0.86); a 14%-transparent drawer over a
    // month grid is the same bug with a smaller number.
    expect(ruleFor('.sched-detail')).not.toMatch(/background:[^;]*rgba/);
  });

  it('holds a stable width instead of tracking the viewport', () => {
    const sheet = CSS.slice(CSS.indexOf('.sched-detail.is-sheet {'));
    expect(sheet).toContain('clamp(440px, 34vw, 520px)');
    expect(sheet).not.toContain('min(26rem, 92vw)');
  });

  it('pins the header and the commit button while the middle scrolls', () => {
    expect(ruleFor('.sched-detail.is-sheet .sched-detail-head')).toContain('position: sticky');
    expect(ruleFor('.sched-detail.is-sheet .sched-step-confirm')).toContain('position: sticky');
    // Both need their own opaque fill, or the scrolling content passes through.
    expect(ruleFor('.sched-detail.is-sheet .sched-detail-head')).toContain('rgb(var(--panel-rgb))');
    expect(ruleFor('.sched-detail.is-sheet .sched-step-confirm')).toContain('rgb(var(--panel-rgb))');
  });

  it('is still a full-width sheet on a phone', () => {
    const sheet = CSS.slice(CSS.indexOf('.sched-detail.is-sheet {'), CSS.indexOf('@media (min-width: 720px)', CSS.indexOf('.sched-detail.is-sheet {')));
    expect(sheet).toContain('inset: auto 0 0 0');
  });
});

/* ===========================================================================
   5. Dates you can act on
   ======================================================================== */
describe('the slot list', () => {
  it('leads with the absolute date and time', () => {
    // "Today" and "In 3 days" alone meant working out which date that was, and
    // a page left open over midnight said "Today" about yesterday.
    expect(PANEL).toContain('{dayLabel(slot.dateKey)} at {clockLabel(slot.time)}');
  });

  it('keeps the relative label as the second line rather than instead', () => {
    expect(PANEL).toContain('relativeLabel(slot.dateKey, context.todayKey)');
    expect(PANEL).not.toContain('relativeLabel(slot.dateKey, context.todayKey) ?? dayLabel(slot.dateKey)');
  });
});

describe('the confirmation says what is still outstanding', () => {
  it('lists it from the shared helper', () => {
    expect(PANEL).toContain('Still outstanding');
    expect(PANEL).toContain('remaining.map((item)');
  });

  it('drops the crew line once crew are ticked in this panel', () => {
    // That one is being answered on screen; repeating it under the button would
    // be the panel arguing with itself.
    expect(PANEL).toContain("blocker.key !== 'crew' || crewIds.length === 0");
  });

  it('does not style any of it as an error, because none of it blocks the save', () => {
    expect(ruleFor('.sched-confirm-todo li')).toContain('var(--mute-i56)');
  });
});

/* ===========================================================================
   6. Clearing the blockers without leaving the page
   ======================================================================== */
describe('the duration is editable in place', () => {
  const ACTIONS = stripJs(read('src', 'app', 'dashboard', 'jobs', 'actions.ts'));

  it('replaced the link that took you off the schedule', () => {
    expect(PANEL).toContain('<DurationField jobId={job.id} hours={job.estimatedHours} />');
    expect(PANEL).not.toContain('Not set — add one');
  });

  it('the action is owner-scoped and filters on the account as well as the id', () => {
    const fn = ACTIONS.slice(ACTIONS.indexOf('export async function setJobEstimatedHoursAction'));
    const body = fn.slice(0, fn.indexOf('\nexport '));
    expect(body).toContain('await requireOwnerContext()');
    expect(body).toContain(".eq('account_id', accountId)");
  });

  it('rejects an impossible duration rather than silently clamping it', () => {
    // Turning a typed 200 into 24 puts a number on the calendar nobody typed.
    const fn = ACTIONS.slice(ACTIONS.indexOf('export async function setJobEstimatedHoursAction'));
    expect(fn).toContain('hours < 0 || hours > 24');
    expect(fn).toContain('Enter a duration between 0 and 24 hours.');
  });

  it('revalidates the schedule, so the capacity ramp picks the new figure up', () => {
    const fn = ACTIONS.slice(ACTIONS.indexOf('export async function setJobEstimatedHoursAction'));
    expect(fn).toContain("revalidatePath('/dashboard/schedule')");
  });

  it('is a real labelled control with a touch target', () => {
    expect(PANEL).toContain('Estimated hours');
    expect(ruleFor('.sched-duration-input')).toContain('min-height: 44px');
  });
});

describe('the crew step recommends before it lists', () => {
  it('marks who is already booked on the chosen day', () => {
    expect(PANEL).toContain('busyOnChosenDay');
    expect(PANEL).toContain('already on {clashes}');
  });

  it('says nothing about conflicts before a day is chosen', () => {
    // "Already booked" is meaningless before there is a date to be booked
    // against, and a count from some other day would be worse than none.
    expect(PANEL).toContain('if (dateKey) {');
  });

  it('warns without blocking — doubling somebody up is sometimes right', () => {
    expect(PANEL).not.toMatch(/disabled=\{[^}]*clashes/);
    expect(ruleFor('.sched-crew-clash')).toContain('var(--gold-ink)');
  });

  it('sorts the free before the busy, stably', () => {
    expect(PANEL).toContain('const visibleCrew = byRole');
    expect(PANEL).toContain('return a.index - b.index;');
  });

  it('offers a role filter only when there is more than one role', () => {
    // A row of one button that cannot change anything is furniture.
    expect(PANEL).toContain('{roles.length > 1 ? (');
    expect(PANEL).toContain('aria-label="Filter crew by role"');
  });

  it('clears the filter when a different job is opened', () => {
    expect(PANEL).toContain('setRoleFilter(null);');
  });

  it('the busy map is built from data the page already had', () => {
    const PAGE = stripJs(read('src', 'app', 'dashboard', 'schedule', 'page.tsx'));
    expect(PAGE).toContain('const busyCrewByDate: Record<string, string[]> = {};');
    // No extra round trip: it reuses assignmentsByJob and scheduledJobs.
    expect(PAGE).toContain('assignmentsByJob[job.id] ?? []');
  });
});

/* ===========================================================================
   7. The rail collapses
   ======================================================================== */
describe('the desktop queue collapses', () => {
  const QUEUE = stripJs(read('src', 'app', 'dashboard', 'schedule', 'UnscheduledQueue.tsx'));

  it('offers the toggle only where the queue is a permanent column', () => {
    // Below 1024 the queue is an overlay and "collapse" is what Back does.
    expect(QUEUE).toContain('const showCollapseToggle = !isOverlay;');
    expect(ruleFor('.sched-queue-collapse')).toContain('display: none');
    expect(CSS).toMatch(/@media \(min-width: 1024px\)[\s\S]{0,200}\.sched-queue-collapse \{ display: inline-flex; \}/);
  });

  it('carries the count, so a closed rail says what is behind it', () => {
    expect(QUEUE).toContain('${count} waiting');
  });

  it('takes the collapsed list out of the tab order but not the toggle', () => {
    // Inerting the wrapper would take the button with it, and a closed rail
    // with no way to reopen it is a rail you have lost.
    expect(QUEUE).toContain('const panelInert = collapsed && showCollapseToggle;');
    expect(QUEUE).toMatch(/const node = panelRef\.current;[\s\S]{0,200}setAttribute\('inert'/);
  });

  it('reclaims the column rather than just hiding the list', () => {
    expect(CSS).toContain('.schedule-workbench:has(.sched-queue.is-collapsed)');
    expect(CSS).toContain('grid-template-columns: auto minmax(0, 1fr);');
  });

  it('the rail is a real column now, so the toggle is not a stray grid item', () => {
    // As display:contents the wrapper vanished and a toggle added here would
    // have been a third item in a two-column grid.
    expect(ruleFor('.sched-queue')).toContain('display: flex');
    expect(ruleFor('.sched-queue-panel')).toContain('display: contents');
  });

  it('is announced as a disclosure', () => {
    expect(QUEUE).toContain('aria-expanded={!collapsed}');
    expect(QUEUE).toContain('aria-controls="sched-queue-panel"');
    expect(QUEUE).toContain('id="sched-queue-panel"');
  });
});

/* ===========================================================================
   8. One glyph, one meaning
   ======================================================================== */
describe('the capacity flags', () => {
  const CAPACITY = stripJs(read('src', 'app', 'dashboard', 'schedule', 'ScheduleMonthCapacity.tsx'));
  const LEGEND = read('src', 'app', 'dashboard', 'schedule', 'CalendarLegend.tsx');

  it('no longer spends the legend’s diamond on a second meaning', () => {
    // ◇ is "quote not approved" in CalendarLegend. It also meant "this day has
    // jobs with no crew" here — one glyph, two unrelated things, on one route.
    expect(LEGEND).toContain("new_lead: '◇'");
    expect(CAPACITY).not.toMatch(/crewless[^>]*>\s*◇/);
    expect(CAPACITY).toContain('∅');
  });

  it('explains all three on hover, since none of them has a visible key', () => {
    for (const phrase of ['Two jobs overlap', 'no crew assigned', 'no duration set']) {
      expect(CAPACITY, phrase).toContain(phrase);
    }
  });
});

/* ===========================================================================
   9. The drag handle stays
   ======================================================================== */
describe('the drag handle', () => {
  it('is not hidden on touch, because it is the only keyboard path', () => {
    // The brief asked for drag handles to be desktop-only. This control is also
    // the tap-to-arm target and the only route to scheduling from a keyboard,
    // so hiding it by pointer type would take it from anybody on a touchscreen
    // laptop. The misleading LABEL was the real complaint and that is fixed.
    const handle = CSS.slice(CSS.indexOf('.schedule-drag-handle {'));
    expect(handle.slice(0, handle.indexOf('}'))).not.toContain('display: none');
  });

  it('no longer leads with a gesture a phone cannot comfortably do', () => {
    expect(HANDLE).toContain('aria-label={armed ? `${jobName} is waiting for a date');
    expect(HANDLE).toContain('`Pick a date for ${jobName}`');
    expect(HANDLE).not.toContain('drag onto a calendar date, or press to pick one');
  });

  /* The written drag instruction under the queue heading was removed on
     request, and its pointer-only half went with it. What is left is the
     handle's title, which a touch device never shows in the first place. */
  it('and the written drag instruction is gone entirely', () => {
    expect(CSS).not.toContain('.schedule-drag-hint');
    expect(BENCH).not.toContain('schedule-drag-hint');
    expect(HANDLE).toContain('title="Tap, then tap a date on the calendar.');
  });
});

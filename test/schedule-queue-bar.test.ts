import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
/** An assertion about ABSENCE must not be defeated by the comment explaining
 *  the absence. */
const stripJs = (source: string) =>
  source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const BAR = stripJs(read('src', 'app', 'dashboard', 'schedule', 'QueueTriggers.tsx'));
const PAGE = stripJs(read('src', 'app', 'dashboard', 'schedule', 'page.tsx'));
const QUEUE = stripJs(read('src', 'app', 'dashboard', 'schedule', 'UnscheduledQueue.tsx'));
const HANDLE = stripJs(read('src', 'app', 'dashboard', 'schedule', 'JobDragHandle.tsx'));
const CSS = read('src', 'app', 'globals.css');

/* ===========================================================================
   FOUR CONTROLS, TWO NUMBERS, ONE DESTINATION
   ---------------------------------------------------------------------------
     "11 need dates"        the summary line under the title
     "+ Schedule 11 jobs"   the primary button
     "11 jobs need dates"   the banner, with its own count badge and arrow
     "11 · Ready to book"   the fourth stat card, linking to the same queue

   Four is not emphasis. Two of them counted every unscheduled job and two
   counted only the approved ones, so the same page printed 11 and 3 for the
   same question with nothing saying why.
   ======================================================================== */
describe('the scheduling prompt is said once', () => {
  it('mounts one bar and none of the four it replaces', () => {
    expect(PAGE).toContain('<ScheduleQueueBar');
    expect(PAGE).not.toContain('<ScheduleJobButton');
    expect(PAGE).not.toContain('<UnscheduledBanner');
    expect(PAGE).not.toContain('Ready to book');
    expect(PAGE).not.toContain('need dates');
  });

  it('and their styles are gone rather than orphaned', () => {
    expect(CSS).not.toContain('.sched-banner {');
    expect(CSS).not.toContain('.sched-primary {');
    expect(CSS).toContain('.sched-queue-bar {');
  });

  /** The banner used to appear only below 1280 on the theory that the desktop
   *  rail said it already — which left the desktop with a button naming a count
   *  and nothing saying what the count was made of. */
  it('renders at every width rather than only on narrow ones', () => {
    const block = CSS.slice(CSS.indexOf('.sched-queue-bar {'), CSS.indexOf('}', CSS.indexOf('.sched-queue-bar {')));
    expect(block).not.toContain('display: none');
  });
});

/* The split is the thing the old controls kept hiding: approved work waiting
   for a date is a scheduling task, an unaccepted quote is a sales one. */
describe('the two populations get two sentences and two buttons', () => {
  it('names each half and drops the half that is zero', () => {
    expect(BAR).toContain("approved > 0 ? `${approved} ${approved === 1 ? 'job' : 'jobs'} ready to schedule` : null,");
    expect(BAR).toContain('unapproved > 0 ? `${unapproved} awaiting approval` : null,');
    expect(BAR).toContain("parts.join(' · ')");
  });

  it('gives the sales task its own control', () => {
    expect(BAR).toContain('Review unapproved job');
    expect(BAR).toContain('Review {unapproved} unapproved');
  });

  /** A quote is reviewed on the job, not in a scheduling queue. */
  it('opens a single unapproved quote directly', () => {
    expect(BAR).toContain('href={`/dashboard/jobs/${firstUnapprovedId}`}');
    expect(PAGE).toContain("const firstUnapprovedId = unscheduledJobs.find((job) => job.status === 'new_lead')?.id ?? null;");
  });

  /** Whichever task is the only one present is the primary one. */
  it('promotes the review button when there is nothing to schedule', () => {
    expect(BAR).toContain("className={`btn ${approved > 0 ? 'secondary' : 'primary'} sched-queue-bar-go`}");
  });

  /**
   * MEASURED IN THE BROWSER: with one population the badge printed "11"
   * immediately followed by "11 jobs ready to schedule" — this bar committing,
   * in miniature, the duplication it exists to remove.
   */
  it('shows the total only when it is not already the first word', () => {
    expect(BAR).toContain("{parts.length > 1 ? <span className=\"sched-queue-bar-count\"");
  });

  /** Booking work is why somebody opens this page; an empty queue still needs a
   *  way in, and it is not "open the empty list". */
  it('turns into a way to make a job when nothing is waiting', () => {
    expect(BAR).toContain('if (total === 0) {');
    expect(BAR).toContain('Everything is scheduled');
    expect(BAR).toContain('href="/dashboard/jobs"');
  });
});

/* The queue sorts approved work above unapproved, so the first card is the
   wrong one to land on for "review the quote". */
describe('the bar lands you on the job it named', () => {
  it('carries the id through the event and the card advertises it', () => {
    expect(BAR).toContain("new CustomEvent(OPEN_SCHEDULE_QUEUE_EVENT, { detail: focusJobId ? { focusJobId } : undefined })");
    expect(HANDLE).toContain('data-queue-job={jobId}');
    expect(QUEUE).toContain('panel.querySelector<HTMLElement>(`[data-queue-job="${CSS.escape(wanted)}"]`)');
  });

  /** Falls back to the first card, which is what "Schedule N jobs" wants. */
  it('still lands somewhere when no id is asked for', () => {
    expect(QUEUE).toContain("?? panel.querySelector<HTMLElement>('[data-queue-job]')");
  });

  /**
   * MEASURED IN THE BROWSER: desktop landed on the job, tablet and phone landed
   * on the panel. Below 1280 the queue is a modal and useModal focuses
   * `[data-autofocus]` on its own timeout, which ran after this and took focus
   * straight back off the card — so "Review the unapproved one" opened a list
   * of nine and pointed at none of them.
   */
  it('aims the modal’s own focus rather than racing it', () => {
    expect(QUEUE).toContain("target.dataset.autofocus = 'true';");
    expect(QUEUE).toContain("for (const previous of panel.querySelectorAll<HTMLElement>('[data-autofocus]')) {");
    // The hook this cooperates with still reads that attribute.
    expect(read('src', 'app', 'dashboard', 'schedule', 'use-modal.ts')).toContain("panel.querySelector<HTMLElement>('[data-autofocus]')");
  });
});

/**
 * ONE JOB, ONE ISSUE.
 *
 * The dashboard needs a single headline number for "how much scheduling work is
 * outstanding", and the obvious way to get one — add the three rows together —
 * is wrong twice over. Both over-counts are silent, and both were live:
 *
 *   1. THE ROWS WERE CALENDAR DAYS, NOT JOBS. The counts reduced over
 *      expandScheduledJobs' output, which emits one row per day a job occupies
 *      (see the `at(job, dateKey)` spread in lib/jobs.ts). A three-day job with
 *      no crew scored three. The card said "3 scheduled jobs need a crew" about
 *      one job, before anything was summed.
 *
 *   2. CREW AND START TIME ARE INDEPENDENT. A job can want both, and that is not
 *      an edge case — it is the state EVERY job is in the moment it lands on the
 *      calendar, because scheduled_time is created null and crew_assignments
 *      starts empty. Such a job was counted once under crew and again under
 *      time.
 *
 * So the headline is the SIZE OF A UNION and never a sum. The per-reason lists
 * stay honest lengths of their own fix lists, which means they will legitimately
 * add up to more than the total — the copy has to say so ("some jobs need more
 * than one"), because "3 + 5 = 8" is exactly the arithmetic this module exists
 * to stop.
 *
 * Pure, no IO, so the rule is testable without a database and the dashboard and
 * the demo cannot drift apart.
 */

export type SchedulingIssueJob = {
  id: string;
  status: string;
  scheduled_time: string | null;
};

export type SchedulingIssues = {
  /** Distinct job ids with at least one issue. The headline is `all.length`. */
  all: string[];
  needsCrew: string[];
  missingTime: string[];
  unscheduled: string[];
};

export type SchedulingIssuesInput = {
  /**
   * Calendar occurrences inside the window. MAY repeat an id once per day —
   * that is the input this module exists to collapse, not a caller mistake.
   */
  windowOccurrences: SchedulingIssueJob[];
  /** job_id -> crew_id[]. A missing key means nobody is assigned. */
  assignmentsByJob: Record<string, string[]>;
  /** Live jobs with no scheduled_for at all. */
  unscheduledJobIds: string[];
};

export function collectSchedulingIssues(input: SchedulingIssuesInput): SchedulingIssues {
  // Collapse to one row per job BEFORE any predicate runs, so a multi-day job is
  // judged once.
  //
  // Finished work is dropped here rather than upstream. It still has to draw on
  // the calendar — the week strip shows what happened — but "assign a crew to a
  // job that is already done" is not a task, and the old counts sent owners to
  // the schedule board to act on work that was over. (The unscheduled list
  // already excluded complete and archived; the other two excluded only
  // archived, so the three did not even agree with each other.)
  const byId = new Map<string, SchedulingIssueJob>();
  for (const job of input.windowOccurrences) {
    if (job.status === 'complete' || job.status === 'archived') continue;
    if (!byId.has(job.id)) byId.set(job.id, job);
  }

  const needsCrew = new Set<string>();
  const missingTime = new Set<string>();
  for (const [id, job] of byId) {
    if ((input.assignmentsByJob[id] ?? []).length === 0) needsCrew.add(id);
    if (!job.scheduled_time) missingTime.add(id);
  }
  const unscheduled = new Set(input.unscheduledJobIds.filter(Boolean));

  // Union, not concatenation. `unscheduled` cannot currently intersect the other
  // two — it is the set with no scheduled_for and they are the set with one —
  // but unioning anyway means a later change to either filter cannot quietly
  // reintroduce the double count this module was written to remove.
  const all = new Set<string>([...needsCrew, ...missingTime, ...unscheduled]);

  const sorted = (set: Set<string>) => [...set].sort();
  return {
    all: sorted(all),
    needsCrew: sorted(needsCrew),
    missingTime: sorted(missingTime),
    unscheduled: sorted(unscheduled),
  };
}

/**
 * "2 need a crew, 1 needs a start time, 4 aren't scheduled"
 *
 * Reasons, never addends. Returns null when there is nothing outstanding.
 */
export function schedulingIssueBreakdown(issues: SchedulingIssues): string | null {
  const parts: string[] = [];
  if (issues.needsCrew.length > 0) parts.push(`${issues.needsCrew.length} need${issues.needsCrew.length === 1 ? 's' : ''} a crew`);
  if (issues.missingTime.length > 0) parts.push(`${issues.missingTime.length} need${issues.missingTime.length === 1 ? 's' : ''} a start time`);
  if (issues.unscheduled.length > 0) parts.push(`${issues.unscheduled.length} ${issues.unscheduled.length === 1 ? 'is' : 'are'}n't on the calendar`);
  if (parts.length === 0) return null;

  const sentence = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  // The disclaimer is load-bearing, not politeness. The reason lines are each a
  // true count of a fix list, so when a job needs two things they add up to more
  // than the headline — and a reader checking our arithmetic deserves to be told
  // why it does not tie rather than concluding the numbers are junk.
  const overlaps = issues.needsCrew.length + issues.missingTime.length + issues.unscheduled.length > issues.all.length;
  return overlaps ? `${sentence} — some need more than one` : sentence;
}

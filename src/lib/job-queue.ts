import type { JobStatus } from '@/lib/jobs';

/**
 * The Jobs queue — stages, search and sort, as arithmetic.
 *
 * The sibling of lib/lead-queue, and here for the same reason: one set of stage
 * words and one set of numbers, so a chip, a row badge and the pane header
 * cannot disagree about what stage a job is in or how many are in it.
 *
 * Pure and free of imports beyond the JobStatus type, so a client component can
 * use it and every rule below is unit-testable.
 */

export type StageFilter = JobStatus | 'all';

export const JOB_STAGES: { id: JobStatus; label: string }[] = [
  { id: 'new_lead', label: 'New request' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'complete', label: 'Complete' },
  { id: 'archived', label: 'Archived' },
];

const STAGE_LABEL: Record<JobStatus, string> = {
  new_lead: 'New request',
  in_progress: 'In progress',
  complete: 'Complete',
  archived: 'Archived',
};

export function jobStageLabel(status: JobStatus): string {
  return STAGE_LABEL[status] ?? status;
}

export type QueueJob = {
  id: string;
  ref: string;
  clientName: string;
  address: string | null;
  status: JobStatus;
  scope: string | null;
  /** The raw date the job starts, 'YYYY-MM-DD', or null when it has none. */
  scheduledFor: string | null;
  quotedAmount: number;
  outstandingAmount: number;
  createdAt: string;
};

export function stageCounts(jobs: QueueJob[]): Record<StageFilter, number> {
  const counts: Record<StageFilter, number> = {
    all: jobs.length,
    new_lead: 0,
    in_progress: 0,
    complete: 0,
    archived: 0,
  };
  for (const job of jobs) counts[job.status] += 1;
  return counts;
}

/**
 * Search across the four things somebody actually remembers about a job: who it
 * is for, what it is, where it is, and its reference.
 *
 * EVERY term must match, not any — typing "royal oak roof" should narrow to
 * roofs in Royal Oak, not widen to everything in either.
 */
export function matchesQuery(job: QueueJob, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = [job.clientName, job.ref, job.scope, job.address].filter(Boolean).join(' ').toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export type QueueSort = 'soonest' | 'owed' | 'value' | 'newest';

export const JOB_SORTS: { id: QueueSort; label: string }[] = [
  { id: 'soonest', label: 'Soonest first' },
  { id: 'owed', label: 'Most owed' },
  { id: 'value', label: 'Highest value' },
  { id: 'newest', label: 'Newest first' },
];

/**
 * "Soonest first" is not the same as sorting the date column ascending.
 *
 * Ascending puts LAST month at the top — a finished job from three weeks ago
 * outranking tomorrow morning, which is the opposite of what the word means.
 * So the day decides which of three groups a job is in, and only then does the
 * date order it:
 *
 *   1. today and later, soonest first — the work that is coming
 *   2. no date yet — a job nobody has booked is a job you have to do something
 *      about, so it beats work that is already behind you
 *   3. before today, most recent first — what just happened
 */
function scheduleRank(job: QueueJob, todayKey: string): number {
  if (!job.scheduledFor) return 1;
  return job.scheduledFor >= todayKey ? 0 : 2;
}

export function sortQueue<T extends QueueJob>(jobs: T[], sort: QueueSort, todayKey: string): T[] {
  const rows = [...jobs];
  rows.sort((a, b) => {
    if (sort === 'owed') {
      return b.outstandingAmount - a.outstandingAmount
        || b.quotedAmount - a.quotedAmount
        || a.clientName.localeCompare(b.clientName);
    }
    if (sort === 'value') {
      return b.quotedAmount - a.quotedAmount || a.clientName.localeCompare(b.clientName);
    }
    if (sort === 'newest') {
      return b.createdAt.localeCompare(a.createdAt) || a.clientName.localeCompare(b.clientName);
    }

    const rankA = scheduleRank(a, todayKey);
    const rankB = scheduleRank(b, todayKey);
    if (rankA !== rankB) return rankA - rankB;
    // Inside the past group, most recent first; everywhere else, earliest first.
    if (a.scheduledFor && b.scheduledFor && a.scheduledFor !== b.scheduledFor) {
      return rankA === 2 ? b.scheduledFor.localeCompare(a.scheduledFor) : a.scheduledFor.localeCompare(b.scheduledFor);
    }
    return a.clientName.localeCompare(b.clientName) || a.ref.localeCompare(b.ref);
  });
  return rows;
}

/**
 * What a row says about when a job runs, relative to today. The date itself is
 * already on the row — this is the word beside it that says whether it matters
 * this morning.
 *
 * STATUS COMES FIRST, and it did not use to. This read only the date, so a job
 * finished this morning that had been booked for next Tuesday still said
 * "Upcoming" — the row announced work that was already done. Finishing early is
 * ordinary in this trade (the crew got a cancellation, the materials landed
 * sooner), so it is worth naming rather than papering over: "Done early" tells
 * the owner the date on the row is not a promise anybody is still waiting on.
 *
 * "Needs a date" goes too. A completed job that never got scheduled does not
 * need one; it needs nothing, and a row nagging for it is a to-do that can
 * never be discharged.
 */
export function scheduleNote(job: QueueJob, todayKey: string): string {
  if (job.status === 'archived') return 'Cancelled';
  if (job.status === 'complete') {
    if (!job.scheduledFor) return 'Done';
    return job.scheduledFor > todayKey ? 'Done early' : 'Done';
  }
  if (!job.scheduledFor) return 'Needs a date';
  if (job.scheduledFor === todayKey) return 'Today';
  if (job.scheduledFor > todayKey) return 'Upcoming';
  return 'Past';
}

/** Today as a date key, from a Date. Local, never UTC. */
export function todayKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

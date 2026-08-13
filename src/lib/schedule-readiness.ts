// What a job waiting for a date is still short of.
//
// PURE, and shared by the queue card and the scheduling panel on purpose. Both
// surfaces used to decide this for themselves: the card showed "No duration"
// and "No crew" as greyed-out facts, the panel showed "Not set — add one" in a
// definition list, and neither mentioned the address or agreed on what counted
// as unready. One list, read twice, cannot drift.
//
// NONE OF THESE BLOCK SCHEDULING. A contractor can put a date on a job with no
// crew, no duration and no address, and often should — the date is frequently
// the first thing that is known. These are outstanding work, stated so nobody
// has to rediscover them on the morning of the job.

export type BlockerKey = 'approval' | 'duration' | 'crew' | 'address';

export type Blocker = {
  key: BlockerKey;
  /** The queue card's chip. Two words where possible. */
  short: string;
  /** The panel's line. A phrase, not a label. */
  label: string;
  /** Where it gets fixed, when that is somewhere other than this panel. */
  href?: string;
};

/** What jobBlockers needs. A subset of QueueJob, so either shape can be passed. */
export type ReadinessInput = {
  id: string;
  approved: boolean;
  estimatedHours: number | null;
  crewIds: string[];
  address: string | null;
};

/**
 * In the order they matter.
 *
 * Approval first because it is the only one that is about whether the work
 * exists at all; the other three are about how well it is described. Address
 * last because it is the one the crew can most easily work around on the day.
 */
export function jobBlockers(job: ReadinessInput): Blocker[] {
  const out: Blocker[] = [];
  const jobHref = `/dashboard/jobs/${job.id}`;

  if (!job.approved) {
    out.push({
      key: 'approval',
      short: 'Approval pending',
      label: 'The quote has not been approved yet',
      href: jobHref,
    });
  }
  if (!job.estimatedHours) {
    out.push({
      key: 'duration',
      short: 'Duration needed',
      // Named as a consequence rather than as a missing field: an unestimated
      // job is why a day can read as empty when it is full.
      label: 'No duration set, so this job does not count towards a day being full',
      href: jobHref,
    });
  }
  if (job.crewIds.length === 0) {
    out.push({ key: 'crew', short: 'Crew needed', label: 'Nobody is assigned yet' });
  }
  if (!job.address || !job.address.trim()) {
    out.push({
      key: 'address',
      short: 'Address missing',
      label: 'No address on file, so it cannot be routed or mapped',
      href: jobHref,
    });
  }
  return out;
}

/** True when nothing is outstanding. */
export function isFullyReady(job: ReadinessInput): boolean {
  return jobBlockers(job).length === 0;
}

/**
 * Queue order: what to do next, first.
 *
 * Approved work outranks unapproved — it is sold, and a date is the only thing
 * between it and being done. Within each group, the job that is closest to
 * ready comes first, because it is the one that can be finished in a single
 * pass rather than opened, discovered to be missing three things, and closed
 * again.
 *
 * The rank is deliberately coarse. Sorting a queue too cleverly means the card
 * an owner remembers being third is now seventh for a reason nobody can see.
 */
export function queueRank(job: ReadinessInput): number {
  const approval = job.approved ? 0 : 100;
  // Only the description-quality blockers; approval is already the major key.
  const outstanding = jobBlockers(job).filter((blocker) => blocker.key !== 'approval').length;
  return approval + outstanding;
}

/** A job created today, in the account's own timezone-shifted day key. */
export function isRequestedToday(createdAt: string | null | undefined, todayKey: string): boolean {
  return Boolean(createdAt) && (createdAt as string).slice(0, 10) === todayKey;
}

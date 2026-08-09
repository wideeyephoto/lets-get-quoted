/**
 * The Smoothie lead queue: one set of stages, one set of counts, one sort.
 *
 * Pure and structurally typed on purpose. The server page computes the waiting
 * labels (a clock read during render is a hydration mismatch waiting to happen)
 * and the client view does the filtering and ordering, so both sides need this
 * module and neither may drag @/lib/leads — which reaches the database — into a
 * browser bundle.
 *
 * The reason this exists at all: the Leads page could show a stage chip reading
 * "Needs response", a row badge on the same lead reading "New request", and a
 * sidebar counting something else again. Three names for one thing. Smoothie
 * asks THIS module for every stage word and every stage number, so the chip,
 * the badge, the queue header and the detail pane cannot disagree.
 */

export type QueueStatus = 'new' | 'contacted' | 'quoted' | 'won' | 'lost';

/** The only lead shape this module needs. Structural, so it costs no imports. */
export type QueueLead = {
  id: string;
  name: string;
  status: QueueStatus;
  detail: string;
  address: string | null;
  location: string | null;
  city: string | null;
  createdAt: string;
  score: 'hot' | 'warm' | 'low';
  estimate: { min: number; max: number } | null;
  isUrgent: boolean;
};

/**
 * The canonical pipeline.
 *
 * `new` is "Needs response" for every lead, not only website forms. The old
 * label switched on the SOURCE, so a lead phoned in an hour ago sat in the
 * Needs-response bucket while its own badge said "New request" — the counts
 * were right and the words disagreed with them.
 */
export const QUEUE_STAGES: { id: QueueStatus; label: string; short: string }[] = [
  { id: 'new', label: 'Needs response', short: 'Needs response' },
  { id: 'contacted', label: 'Contacted', short: 'Contacted' },
  { id: 'quoted', label: 'Quote sent', short: 'Quote sent' },
  { id: 'won', label: 'Won', short: 'Won' },
  { id: 'lost', label: 'Lost', short: 'Lost' },
];

const STAGE_LABEL: Record<QueueStatus, string> = QUEUE_STAGES.reduce(
  (map, stage) => ({ ...map, [stage.id]: stage.label }),
  {} as Record<QueueStatus, string>,
);

export function queueStageLabel(status: QueueStatus): string {
  return STAGE_LABEL[status] ?? status;
}

export type StageFilter = QueueStatus | 'all';

/**
 * How many leads sit in each stage, plus the total.
 *
 * Computed from the same array the queue renders, so a chip can never claim a
 * lead the list is not showing. Every stage appears in the result even at zero
 * — a filter that vanishes when it empties is a filter you cannot tell is
 * empty from one that never existed.
 */
export function stageCounts<T extends QueueLead>(leads: T[]): Record<StageFilter, number> {
  const counts: Record<StageFilter, number> = { all: leads.length, new: 0, contacted: 0, quoted: 0, won: 0, lost: 0 };
  for (const lead of leads) counts[lead.status] += 1;
  return counts;
}

/**
 * Search across the three things somebody actually remembers about a lead: who
 * they are, what they want, and where they are.
 *
 * Every term has to match somewhere, so "royal oak roof" finds the roof job in
 * Royal Oak rather than everything in either.
 */
export function matchesQuery(lead: QueueLead, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = [lead.name, lead.detail, lead.address, lead.location, lead.city]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export type QueueSort = 'priority' | 'waiting' | 'newest' | 'value';

export const QUEUE_SORTS: { id: QueueSort; label: string }[] = [
  { id: 'priority', label: 'Highest priority' },
  { id: 'waiting', label: 'Longest waiting' },
  { id: 'newest', label: 'Newest first' },
  { id: 'value', label: 'Highest estimated value' },
];

const SCORE_RANK: Record<QueueLead['score'], number> = { hot: 0, warm: 1, low: 2 };

const time = (iso: string): number => {
  const at = new Date(iso).getTime();
  return Number.isFinite(at) ? at : 0;
};

/**
 * Order the queue. Never mutates the input.
 *
 * "Highest priority" is heat, then whether anybody has answered, then how long
 * they have waited — a hot lead nobody has replied to for four days outranks a
 * hot lead that came in this morning. Every sort falls back to the id so two
 * leads that tie cannot swap places between renders.
 */
// Generic so the caller gets its OWN row type back. Typed as QueueLead[] it
// would silently narrow a list of full lead rows down to the six fields this
// module happens to need, and the queue could no longer render a price.
export function sortQueue<T extends QueueLead>(leads: T[], sort: QueueSort): T[] {
  const rows = [...leads];
  rows.sort((a, b) => {
    if (sort === 'priority') {
      if (SCORE_RANK[a.score] !== SCORE_RANK[b.score]) return SCORE_RANK[a.score] - SCORE_RANK[b.score];
      if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
      if (time(a.createdAt) !== time(b.createdAt)) return time(a.createdAt) - time(b.createdAt);
    } else if (sort === 'waiting') {
      if (time(a.createdAt) !== time(b.createdAt)) return time(a.createdAt) - time(b.createdAt);
    } else if (sort === 'newest') {
      if (time(a.createdAt) !== time(b.createdAt)) return time(b.createdAt) - time(a.createdAt);
    } else if (sort === 'value') {
      // No estimate sorts last rather than as zero: "we don't know" is not the
      // same as "it's worth nothing", and a page of unestimated leads above the
      // $8k one would be actively misleading.
      const av = a.estimate?.max ?? -1;
      const bv = b.estimate?.max ?? -1;
      if (av !== bv) return bv - av;
    }
    return a.id.localeCompare(b.id);
  });
  return rows;
}

/**
 * How long they have been waiting, in words.
 *
 * The list used to print "94h", which is a number nobody converts in their head
 * and which reads like a code. This says "3 days waiting" — and `short` says
 * "3d waiting", because even in a dense row the unit needs a noun next to it.
 *
 * `now` is a parameter so this is testable and so the SERVER can compute it.
 * Rendering a clock in a client component produces different markup on the two
 * sides of hydration and React throws the server's away.
 */
export type Waiting = { long: string; short: string; hours: number };

export function waitingLabel(createdAt: string, now: Date = new Date()): Waiting {
  const start = new Date(createdAt).getTime();
  if (!Number.isFinite(start)) return { long: 'Waiting time unknown', short: 'Unknown', hours: 0 };
  const minutes = Math.max(0, Math.round((now.getTime() - start) / 60000));
  const hours = minutes / 60;

  if (minutes < 60) {
    const m = Math.max(1, minutes);
    return { long: `${m} minute${m === 1 ? '' : 's'} waiting`, short: `${m}m waiting`, hours };
  }
  if (minutes < 60 * 48) {
    const h = Math.round(minutes / 60);
    return { long: `${h} hour${h === 1 ? '' : 's'} waiting`, short: `${h}h waiting`, hours };
  }
  const d = Math.round(minutes / (60 * 24));
  return { long: `${d} day${d === 1 ? '' : 's'} waiting`, short: `${d}d waiting`, hours };
}

/**
 * The waiting clock, but only for somebody who is actually waiting.
 *
 * Returns null for a won or lost lead. `waitingLabel` measures from created_at
 * and never stops, so a lead closed months ago still read "12 minutes waiting" —
 * beside a Won badge, in a column the queue sorts by. A terminal lead is not
 * waiting on anything and must not appear in a list of people who are.
 *
 * Null rather than an empty string so every render site has to decide what to
 * show instead, rather than silently printing a blank where a duration was.
 * `ageLabel` is already on every view item for the sites that want to say
 * something — "Won · 12m old" is true; "12m waiting" is not.
 */
export function waitingFor(
  lead: { status: QueueStatus; createdAt: string },
  now: Date = new Date(),
): Waiting | null {
  if (lead.status === 'won' || lead.status === 'lost') return null;
  return waitingLabel(lead.createdAt, now);
}

/**
 * What the communication buttons should do, given how the homeowner asked to be
 * contacted.
 *
 * A lead who ticked "text only" and then gets phoned is a lead you have already
 * annoyed, so the preference decides which button is primary rather than
 * sitting in a chip beside four equally-weighted actions. Call is never removed
 * — it is relabelled, because sometimes you do have to ring.
 */
export type ContactPlan = {
  /** 'text' | 'call' — which action gets the primary treatment. */
  primary: 'text' | 'call';
  /** The sentence shown next to the buttons. */
  note: string;
  /** What the Call button says. */
  callLabel: string;
};

export function contactPlan(input: { textOnly: boolean; hasPhone: boolean; hasEmail: boolean }): ContactPlan {
  if (input.textOnly) {
    return {
      primary: 'text',
      note: 'They asked to be texted, not called.',
      callLabel: 'Call only if needed',
    };
  }
  if (!input.hasPhone) {
    return {
      primary: 'text',
      note: input.hasEmail ? 'No phone on file — email is the only way to reach them.' : 'No phone or email on file.',
      callLabel: 'Call only if needed',
    };
  }
  return { primary: 'call', note: 'No contact preference given — a call is fine.', callLabel: 'Call' };
}

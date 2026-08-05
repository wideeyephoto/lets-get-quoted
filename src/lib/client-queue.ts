import { BAND_LABEL, FOLLOW_UP_BANDS, bandFor, type FollowUpBand, type FollowUpClient } from '@/lib/client-followup';

/**
 * The Clients queue — the filter chips and the sort, as arithmetic.
 *
 * The sibling of lib/lead-queue and lib/job-queue. The stages are NOT invented
 * here: they are the four follow-up bands the page already has, so the chip
 * along the top, the row's own word and the Follow-up view cannot disagree
 * about whether somebody is drifting. One set of words, one set of numbers.
 *
 * A customer has no status column — nothing about a person says "in progress".
 * What they have is silence, and that is what these bands measure.
 */

export type StageFilter = FollowUpBand | 'all';

export const CLIENT_STAGES: { id: FollowUpBand; label: string }[] = FOLLOW_UP_BANDS.map((band) => ({
  id: band,
  label: BAND_LABEL[band],
}));

export type QueueClient = FollowUpClient & {
  initials: string;
  isRepeat: boolean;
  phoneLabel: string | null;
  address: string | null;
  jobsLabel: string;
  totalLabel: string;
  lastLabel: string;
  /** Pre-lowercased name + phone + email + address, built server-side. */
  search: string;
};

export function stageCounts(clients: QueueClient[], todayKey: string): Record<StageFilter, number> {
  const counts: Record<StageFilter, number> = {
    all: clients.length,
    booked: 0,
    recent: 0,
    drifting: 0,
    unbooked: 0,
  };
  for (const client of clients) counts[bandFor(client, todayKey)] += 1;
  return counts;
}

/**
 * EVERY term must match, not any — "smith 555" should find a Smith with a 555
 * number, not everybody called Smith plus everybody with a 555 number.
 *
 * Reads the pre-built `search` string rather than re-joining the fields: it is
 * already lowercased on the server and it is what the other four views match
 * against, so a search here cannot find a different set than a search there.
 */
export function matchesQuery(client: QueueClient, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  return terms.every((term) => client.search.includes(term));
}

export type QueueSort = 'silence' | 'name' | 'billed' | 'jobs';

export const CLIENT_SORTS: { id: QueueSort; label: string }[] = [
  { id: 'silence', label: 'Longest since seen' },
  { id: 'name', label: 'Name A–Z' },
  { id: 'billed', label: 'Most billed' },
  { id: 'jobs', label: 'Most jobs' },
];

/**
 * "Longest since seen" is the default because it is the only order that makes a
 * customer drifting away look different from a happy one — every other view on
 * this page sorts by name or by money, which is exactly the complaint
 * client-followup was written to answer.
 *
 * Somebody booked is never "long since seen", whatever their last visit says:
 * you are seeing them Thursday. They sort to the back, soonest first.
 */
export function sortQueue<T extends QueueClient>(clients: T[], sort: QueueSort, todayKey: string): T[] {
  const rows = [...clients];
  rows.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'billed') return b.totalValue - a.totalValue || a.name.localeCompare(b.name);
    if (sort === 'jobs') return b.jobCount - a.jobCount || b.totalValue - a.totalValue || a.name.localeCompare(b.name);

    const bandA = bandFor(a, todayKey);
    const bandB = bandFor(b, todayKey);
    const rank = (band: FollowUpBand) => (band === 'drifting' ? 0 : band === 'unbooked' ? 1 : band === 'recent' ? 2 : 3);
    if (rank(bandA) !== rank(bandB)) return rank(bandA) - rank(bandB);
    if (bandA === 'booked') return (a.nextJobAt ?? '').localeCompare(b.nextJobAt ?? '');
    // Oldest visit first inside the quiet bands; an empty date is "never", which
    // is the longest silence there is, so it leads.
    return (a.lastVisitAt ?? '').localeCompare(b.lastVisitAt ?? '') || b.totalValue - a.totalValue;
  });
  return rows;
}

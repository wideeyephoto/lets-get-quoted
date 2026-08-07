// The Clients page, sorted by who needs calling.
//
// Every other view on that page answers "show me my customers" and orders by
// name or by money. This one orders by SILENCE: how long since you were last at
// their address, and whether anything is booked. A customer drifting away looks
// exactly like a happy one in an alphabetical list, which is the whole problem.
//
// WHICH DATE. Not `lastJobAt` — that is when the job RECORD was created, so a
// book imported in one sitting gives every customer the same value and the
// bands come out meaningless. This reads `scheduled_for`: the day you were, or
// will be, at their house.
//
// Pure and clock-free: the caller passes today as a 'YYYY-MM-DD' key in the
// account's own zone.

export type FollowUpBand = 'booked' | 'recent' | 'drifting' | 'unbooked';

export const FOLLOW_UP_BANDS: FollowUpBand[] = ['booked', 'recent', 'drifting', 'unbooked'];

export const BAND_LABEL: Record<FollowUpBand, string> = {
  booked: 'On the calendar',
  recent: 'Just done',
  drifting: 'Going quiet',
  unbooked: 'Nothing on the books',
};

export const BAND_NOTE: Record<FollowUpBand, string> = {
  booked: 'Work ahead of you. Nothing to chase.',
  recent: 'Finished in the last two weeks — a good moment to ask for a review.',
  drifting: 'No visit in a while and nothing booked.',
  unbooked: 'No date on the calendar, ever or currently.',
};

/**
 * How recent counts as recent.
 *
 * Two weeks rather than one: a contractor who works Monday to Friday would
 * otherwise watch people fall out of "just done" over a weekend, which teaches
 * them the band means nothing.
 */
export const RECENT_DAYS = 14;

export type FollowUpClient = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  jobCount: number;
  totalValue: number;
  nextJobAt: string | null;
  lastVisitAt: string | null;
  unscheduledJobs: number;
};

export function daysBetweenKeys(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

/**
 * Which band this customer belongs in.
 *
 * Booked wins over everything: somebody you are seeing on Thursday is not
 * drifting, however long it has been since the last visit.
 */
export function bandFor(client: FollowUpClient, todayKey: string): FollowUpBand {
  if (client.nextJobAt) return 'booked';
  if (!client.lastVisitAt) return 'unbooked';
  return daysBetweenKeys(client.lastVisitAt, todayKey) <= RECENT_DAYS ? 'recent' : 'drifting';
}

/**
 * What whenLabel is going to be ABOUT for this customer.
 *
 * whenLabel answers two different questions depending on the record: when you
 * are next at their house, or when you last were. The Clients panel printed it
 * under a hardcoded "Next visit", so a customer with nothing booked read
 * "Next visit: 18 days ago" — a date in the past, under a heading promising the
 * future. It looked like a bug in the scheduler rather than an empty diary.
 *
 * The heading has to come from the same branch the value does, so pair them.
 */
export function whenHeading(client: FollowUpClient): string {
  return client.nextJobAt ? 'Next visit' : 'Last visit';
}

/** "Today" / "In 6 days" / "12 days ago" / "Never been out". Pairs with whenHeading. */
export function whenLabel(client: FollowUpClient, todayKey: string): string {
  if (client.nextJobAt) {
    const days = daysBetweenKeys(todayKey, client.nextJobAt);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return `In ${days} days`;
  }
  if (!client.lastVisitAt) return client.jobCount > 0 ? 'Job with no date on it' : 'Never been out';
  const days = daysBetweenKeys(client.lastVisitAt, todayKey);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 31) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months === 1 ? 'About a month ago' : `About ${months} months ago`;
}

/**
 * Something true about this record worth saying out loud, or null.
 *
 * Every one of these is a FACT the data supports, never a guess about what the
 * owner meant. "No phone or email" is checkable; "looks like a test entry" is
 * an opinion about somebody's customer, and being confidently wrong about that
 * on screen is worse than saying nothing.
 */
export type FollowUpFlag = { text: string; tone: 'warn' | 'info' };

export function flagsFor(
  client: FollowUpClient,
  context: { duplicateNames: Set<string>; topUnbookedId: string | null },
): FollowUpFlag[] {
  const flags: FollowUpFlag[] = [];
  if (client.id === context.topUnbookedId && client.totalValue > 0) {
    flags.push({ text: `Your largest unbooked quote`, tone: 'warn' });
  }
  // Only worth a flag when there is MORE than one, because a single undated job
  // is already what the row's own "Job with no date on it" line says — and a
  // badge repeating the sentence above it just makes both easier to ignore.
  if (client.unscheduledJobs > 1 && !client.nextJobAt && !client.lastVisitAt) {
    flags.push({ text: `${client.unscheduledJobs} jobs, none scheduled`, tone: 'warn' });
  }
  if (duplicateKey(client.name) && context.duplicateNames.has(duplicateKey(client.name))) {
    flags.push({ text: 'Same name as another customer', tone: 'info' });
  }
  if (!client.phone && !client.email) {
    flags.push({ text: 'No phone or email', tone: 'info' });
  }
  return flags;
}

function duplicateKey(name: string): string {
  return name.trim().toLowerCase();
}

export type FollowUpGroup = {
  band: FollowUpBand;
  label: string;
  note: string;
  clients: Array<FollowUpClient & { when: string; flags: FollowUpFlag[] }>;
};

/**
 * The whole page, banded.
 *
 * Order within a band is the order that makes the band useful, and it differs:
 * booked work reads soonest-first because that is the diary, everything else
 * reads by value because when you have ten calls to make you make the
 * expensive ones.
 */
export function groupByFollowUp(clients: FollowUpClient[], todayKey: string): FollowUpGroup[] {
  const seen = new Map<string, number>();
  for (const client of clients) {
    const key = duplicateKey(client.name);
    if (key) seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const duplicateNames = new Set([...seen.entries()].filter(([, count]) => count > 1).map(([key]) => key));

  const unbooked = clients.filter((client) => bandFor(client, todayKey) === 'unbooked');
  const topUnbooked = unbooked.reduce<FollowUpClient | null>(
    (best, client) => (client.totalValue > (best?.totalValue ?? 0) ? client : best),
    null,
  );
  const context = { duplicateNames, topUnbookedId: topUnbooked?.id ?? null };

  return FOLLOW_UP_BANDS.map((band) => {
    const inBand = clients.filter((client) => bandFor(client, todayKey) === band);
    inBand.sort((a, b) => {
      if (band === 'booked') return (a.nextJobAt ?? '').localeCompare(b.nextJobAt ?? '');
      if (band === 'drifting') {
        // Longest silence first — the person you are closest to losing.
        return (a.lastVisitAt ?? '').localeCompare(b.lastVisitAt ?? '') || b.totalValue - a.totalValue;
      }
      return b.totalValue - a.totalValue || a.name.localeCompare(b.name);
    });
    return {
      band,
      label: BAND_LABEL[band],
      note: BAND_NOTE[band],
      clients: inBand.map((client) => ({
        ...client,
        when: whenLabel(client, todayKey),
        flags: flagsFor(client, context),
      })),
    };
  });
}

/** "3 going quiet" — the one line worth putting at the top of the view. */
export function followUpHeadline(groups: FollowUpGroup[]): string | null {
  const drifting = groups.find((group) => group.band === 'drifting')?.clients.length ?? 0;
  const unbooked = groups.find((group) => group.band === 'unbooked')?.clients.filter((c) => c.totalValue > 0).length ?? 0;
  const parts: string[] = [];
  if (drifting > 0) parts.push(`${drifting} going quiet`);
  if (unbooked > 0) parts.push(`${unbooked} quoted with nothing booked`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

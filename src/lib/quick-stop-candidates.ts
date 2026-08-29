// Which of the account's OWN leads and jobs would have qualified as an Extra
// Stop.
//
// The page could say what a Quick Stop is and it could show requests that had
// already arrived, and nothing in between: an owner with no requests yet had no
// way to tell whether that meant the feature was broken, their customers hadn't
// noticed it, or their trade simply doesn't produce that kind of work.
//
// Running the real screener over work they've already done answers all three at
// once. It shows the demand that was there ("nine of your last forty jobs were
// this shape"), and — more useful — it teaches by counter-example: seeing
// "Repipe galvanized supply lines → Large replacement" next to "Clear a kitchen
// drain → 45 min" explains the boundary in a way a list of rules doesn't.
//
// PURE. It reuses screenHardExclusions, which is the same deterministic pass a
// live request goes through first, so the verdicts here can't drift from the
// ones customers actually get. What it deliberately does NOT do is the AI pass:
// that judges complexity on a single request and costs a call, and firing it
// over ninety days of history to decorate a panel would be absurd. So this is
// honest about being the first half — see `needsAiCheck`.

import { QUICK_STOP_EXCLUSIONS, screenHardExclusions } from './quick-stop-exclusions';
import { looksLikeTestRecord } from './test-data-markers';

export type CandidateSource = 'lead' | 'job';

/**
 * How many rows the caller may hand over per table.
 *
 * Exported so the page's `.limit()` and the panel's own description of what it
 * read cannot drift apart. They already had: the queries capped at 200 rows each
 * while the headline said "your last 90 days", so an account with 600 recent
 * jobs was told a number about a quarter it had not actually looked at.
 */
export const CANDIDATE_QUERY_LIMIT = 200;

export type CandidateInput = {
  id: string;
  source: CandidateSource;
  /** "J-1031", or how the lead arrived. */
  label: string;
  clientName: string;
  /** What the customer or the owner said the work is. */
  text: string;
  createdAt: string;
  estimatedHours: number | null;
  href: string;
  /**
   * Leads only: `leads.converted_job`, the job this lead turned into.
   *
   * ONE customer action writes BOTH rows — see createBooking in src/lib/booking.ts,
   * which creates the lead, creates the job, and links them. Without this field
   * every online booking in the account's history was counted as two separate
   * pieces of demand and monetised twice.
   */
  convertedJobId?: string | null;
  /** Jobs only: the job reference, which is where the demo-seed marker lives. */
  ref?: string | null;
  /** Contact details, read ONLY to spot the account's own test bookings. */
  clientEmail?: string | null;
  clientPhone?: string | null;
};

export type Candidate = CandidateInput & {
  /**
   * Passed every rule AND has a recorded length inside the limit.
   *
   * This is the only bucket that gets multiplied by money, so it is the strict
   * reading: a record with no estimate at all is not eligible, it is unjudged on
   * length — see `unknownLength`.
   */
  eligible: boolean;
  /** Matched an unsafe rule — never a Quick Stop, and worth saying why. */
  unsafe: boolean;
  /** Human labels of every rule that ruled it out. */
  blockedBy: string[];
  /** Known to run longer than a single short visit. */
  tooLong: boolean;
  /** A usable estimate was recorded. False means "nobody wrote one down". */
  lengthKnown: boolean;
  /** "About 45 min" / "Over your 60 min limit" / "No length recorded". */
  lengthNote: string;
};

/** What was dropped before screening, and why. Always shown, never silent. */
export type CandidateRemovals = {
  /** Leads whose job is also in the batch — one customer action, one record. */
  duplicates: number;
  /** Already taken as a Quick Stop, so not a missed one. */
  alreadyQuickStop: number;
  /** Looked like the account's own test data. */
  testData: number;
};

export type CandidateReport = {
  /** Newest first — recent work is the more convincing argument. */
  eligible: Candidate[];
  /**
   * Passed every rule but has no recorded length. Counted and listed, NEVER
   * priced.
   *
   * No automated creation path in this codebase sets estimated_hours — not the
   * public lead form, not online booking, not the missed-call capture — so in
   * practice this is most of an account's history. Those rows used to land in
   * `eligible`, where the card printed "No length recorded" and the headline
   * directly above it multiplied that same row by the floor fee. One screen said
   * both "we don't know how long this is" and "this is worth $100".
   */
  unknownLength: Candidate[];
  excluded: Candidate[];
  /** Had nothing written down to judge. Counted, never guessed at. */
  unjudged: number;
  /** Distinct real records actually screened, including the unjudged. */
  screened: number;
  /** Rows handed in, before anything was dropped. */
  received: number;
  removed: CandidateRemovals;
  /** Why work gets ruled out here, most common first. */
  topReasons: { label: string; count: number }[];
};

/** Below this there is no description, just a name or a phone number. */
const MIN_TEXT = 12;

const TOO_LONG_LABEL = 'Longer than one short visit';

function lengthNote(estimatedHours: number | null, maxVisitMinutes: number): string {
  if (estimatedHours == null || !Number.isFinite(estimatedHours) || estimatedHours <= 0) return 'No length recorded';
  const minutes = Math.round(estimatedHours * 60);
  if (minutes > maxVisitMinutes) return `${minutes} min — over your ${maxVisitMinutes} min limit`;
  return `About ${minutes} min`;
}

/** A recorded, positive, finite estimate — anything else is "not written down". */
function usableHours(estimatedHours: number | null | undefined): number | null {
  if (estimatedHours == null || !Number.isFinite(estimatedHours) || estimatedHours <= 0) return null;
  return estimatedHours;
}

/**
 * Screen a batch of past work.
 *
 * `maxVisitMinutes` is the account's own setting, so the same job can qualify
 * for one contractor and not another — which is right, because it's their van
 * and their day.
 *
 * `quickStopJobIds` is `extra_stop_requests.job_id` for the account: the jobs
 * that exist BECAUSE a Quick Stop was accepted. Every one of them is by
 * construction under the visit limit and matches no exclusion, so each one was
 * being presented back to the owner as a Quick Stop they'd missed — and
 * re-monetised at the floor fee, on top of the real fee the earnings figure
 * already counts. Matched on the id and not on the "Quick Stop — " scope prefix
 * the action writes, because a prefix is a string an owner can edit while
 * renaming a job, and the day they do, the double count comes back silently.
 *
 * The caller hands in rows; every decision about what counts is made here, so
 * the page and the tests cannot disagree about the answer.
 */
export function screenQuickStopCandidates(
  items: CandidateInput[],
  opts: { maxVisitMinutes: number; quickStopJobIds?: Iterable<string> },
): CandidateReport {
  const maxVisitMinutes = Math.max(1, Math.round(opts.maxVisitMinutes));
  const eligible: Candidate[] = [];
  const unknownLength: Candidate[] = [];
  const excluded: Candidate[] = [];
  const reasonCounts = new Map<string, number>();
  let unjudged = 0;
  const removed: CandidateRemovals = { duplicates: 0, alreadyQuickStop: 0, testData: 0 };

  const quickStopJobIds = new Set<string>(opts.quickStopJobIds ?? []);
  const jobIdsInBatch = new Set<string>(items.filter((item) => item.source === 'job').map((item) => item.id));

  for (const item of items) {
    // The account's own trial run of its own booking form. Dropped first so a
    // test record can't be counted under some other heading, and counted so the
    // panel can say out loud what it left out — see src/lib/test-data-markers.ts.
    if (looksLikeTestRecord({ name: item.clientName, email: item.clientEmail, phone: item.clientPhone, ref: item.ref })) {
      removed.testData += 1;
      continue;
    }

    // Already taken, so not missed. Checked on the lead as well: if the lead's
    // converted job is a Quick Stop job, dropping only the job would leave the
    // lead standing in for it and the double count would survive the fix.
    if (item.source === 'job' && quickStopJobIds.has(item.id)) {
      removed.alreadyQuickStop += 1;
      continue;
    }
    if (item.source === 'lead' && item.convertedJobId && quickStopJobIds.has(item.convertedJobId)) {
      removed.alreadyQuickStop += 1;
      continue;
    }

    // One customer action, one row. The job wins over the lead it became: it
    // carries the owner's own scope and whatever estimate exists, which is
    // strictly more than the lead has.
    //
    // Unlike getMapPins in src/lib/map-pins.ts — which skips any converted lead
    // outright, because a missing pin is invisible and harmless — this only
    // drops the lead when the job is actually in the batch. The job may have
    // fallen outside the window, past the row cap, or been archived, and
    // dropping the lead anyway would quietly shrink a count the owner is being
    // asked to trust.
    if (item.source === 'lead' && item.convertedJobId && jobIdsInBatch.has(item.convertedJobId)) {
      removed.duplicates += 1;
      continue;
    }

    const text = (item.text ?? '').trim();
    if (text.length < MIN_TEXT) {
      unjudged += 1;
      continue;
    }

    const screen = screenHardExclusions(text);
    const hours = usableHours(item.estimatedHours);
    // Only claim it's too long when a length was actually recorded. An unset
    // estimate is a missing number, not a short job, and counting it either way
    // would put a made-up verdict in a panel whose whole job is to be trusted.
    const tooLong = hours != null && Math.round(hours * 60) > maxVisitMinutes;

    const blockedBy = [...screen.labels, ...(tooLong ? [TOO_LONG_LABEL] : [])];
    const candidate: Candidate = {
      ...item,
      text,
      eligible: blockedBy.length === 0 && hours != null,
      unsafe: screen.unsafe,
      blockedBy,
      tooLong,
      lengthKnown: hours != null,
      lengthNote: lengthNote(item.estimatedHours, maxVisitMinutes),
    };

    if (blockedBy.length > 0) {
      excluded.push(candidate);
      for (const label of blockedBy) reasonCounts.set(label, (reasonCounts.get(label) ?? 0) + 1);
    } else if (hours == null) {
      // Passed every rule, but nothing here says it fits in a gap in the day.
      unknownLength.push(candidate);
    } else {
      eligible.push(candidate);
    }
  }

  const byNewest = (a: Candidate, b: Candidate) => b.createdAt.localeCompare(a.createdAt);
  eligible.sort(byNewest);
  unknownLength.sort(byNewest);
  excluded.sort(byNewest);

  return {
    eligible,
    unknownLength,
    excluded,
    unjudged,
    screened: eligible.length + unknownLength.length + excluded.length + unjudged,
    received: items.length,
    removed,
    topReasons: [...reasonCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
  };
}

/**
 * The rules as a reference list, split the way they actually differ.
 *
 * Unsafe work isn't "not a fit" — it's work nobody should be booking online at
 * all, and the customer gets safety instructions instead of a price. Flattening
 * the two into one list of things that don't qualify loses that.
 */
export function quickStopRuleReference(): { unsafe: string[]; outOfScope: string[] } {
  return {
    unsafe: QUICK_STOP_EXCLUSIONS.filter((rule) => rule.unsafe).map((rule) => rule.label),
    outOfScope: QUICK_STOP_EXCLUSIONS.filter((rule) => !rule.unsafe).map((rule) => rule.label),
  };
}

/**
 * The customer's own words, without the intake wizard's appended notes.
 *
 * A lead's `message` from the Instant Estimate is the description followed by a
 * blank line and a block of machine notes — "AI estimate shown to the customer:
 * $150-$300. Timing: Needed ASAP. Location given: 48072." Screening that whole
 * string is harmless, but PRINTING it turns a one-line problem description into
 * a paragraph of internal bookkeeping, and the panel is meant to be read at a
 * glance. When there was no description at all the notes are the entire message,
 * and the honest answer is that there is nothing to judge.
 */
export function customerWords(message: string | null | undefined): string {
  const raw = (message ?? '').toString().trim();
  if (!raw) return '';
  const [first] = raw.split(/\n\s*\n/);
  const head = (first ?? '').trim();
  if (!head) return '';
  return /^(AI estimate|Timing:|Location given:)/i.test(head) ? '' : head;
}

/** Said once, near the numbers: this is the deterministic half, not the verdict. */
export const CANDIDATE_AI_NOTE =
  'A real request also gets an AI read of how involved the work is, plus your day limit and how far off-route it is. This list is the first check only, so treat it as “worth a look”, not a promise.';

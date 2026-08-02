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

import { QUICK_STOP_EXCLUSIONS, screenHardExclusions } from './quick-stop-qualify';

export type CandidateSource = 'lead' | 'job';

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
};

export type Candidate = CandidateInput & {
  eligible: boolean;
  /** Matched an unsafe rule — never a Quick Stop, and worth saying why. */
  unsafe: boolean;
  /** Human labels of every rule that ruled it out. */
  blockedBy: string[];
  /** Known to run longer than a single short visit. */
  tooLong: boolean;
  /** "About 45 min" / "Over your 60 min limit" / "No length recorded". */
  lengthNote: string;
};

export type CandidateReport = {
  /** Newest first — recent work is the more convincing argument. */
  eligible: Candidate[];
  excluded: Candidate[];
  /** Had nothing written down to judge. Counted, never guessed at. */
  unjudged: number;
  /** Everything looked at, including the unjudged. */
  screened: number;
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

/**
 * Screen a batch of past work.
 *
 * `maxVisitMinutes` is the account's own setting, so the same job can qualify
 * for one contractor and not another — which is right, because it's their van
 * and their day.
 */
export function screenQuickStopCandidates(
  items: CandidateInput[],
  opts: { maxVisitMinutes: number },
): CandidateReport {
  const maxVisitMinutes = Math.max(1, Math.round(opts.maxVisitMinutes));
  const eligible: Candidate[] = [];
  const excluded: Candidate[] = [];
  const reasonCounts = new Map<string, number>();
  let unjudged = 0;

  for (const item of items) {
    const text = (item.text ?? '').trim();
    if (text.length < MIN_TEXT) {
      unjudged += 1;
      continue;
    }

    const screen = screenHardExclusions(text);
    // Only claim it's too long when a length was actually recorded. An unset
    // estimate is a missing number, not a short job, and counting it either way
    // would put a made-up verdict in a panel whose whole job is to be trusted.
    const tooLong =
      item.estimatedHours != null &&
      Number.isFinite(item.estimatedHours) &&
      item.estimatedHours > 0 &&
      Math.round(item.estimatedHours * 60) > maxVisitMinutes;

    const blockedBy = [...screen.labels, ...(tooLong ? [TOO_LONG_LABEL] : [])];
    const candidate: Candidate = {
      ...item,
      text,
      eligible: blockedBy.length === 0,
      unsafe: screen.unsafe,
      blockedBy,
      tooLong,
      lengthNote: lengthNote(item.estimatedHours, maxVisitMinutes),
    };

    if (candidate.eligible) {
      eligible.push(candidate);
    } else {
      excluded.push(candidate);
      for (const label of blockedBy) reasonCounts.set(label, (reasonCounts.get(label) ?? 0) + 1);
    }
  }

  const byNewest = (a: Candidate, b: Candidate) => b.createdAt.localeCompare(a.createdAt);
  eligible.sort(byNewest);
  excluded.sort(byNewest);

  return {
    eligible,
    excluded,
    unjudged,
    screened: items.length,
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

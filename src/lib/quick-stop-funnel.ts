/**
 * "0 of 3" — AND THE OTHER FIFTY-ONE RECORDS.
 *
 * The demand panel had every number it needed and made the reader assemble
 * them. What it printed, on one account, was a headline of "0 of 3", a
 * parenthetical about a 90-day window capped at 200 rows, a sentence about 48
 * records that looked like test data, another about one row with no duration,
 * and two cards whose description was a phone number. All true. Between them
 * they answer "why is this empty?", but only if you read all five and do the
 * subtraction yourself.
 *
 * A funnel is the same facts in the order they happened:
 *
 *   54 read  →  48 set aside  →  6 screened  →  3 judged  →  0 matched
 *
 * Every step says what left and why, and the steps that a person could DO
 * something about carry the thing to do. The rule that excluded a record is
 * already on the record; what was missing was the shape that makes a zero
 * legible.
 *
 * Pure, no IO. Derived entirely from CandidateReport — this adds no facts, it
 * only orders the ones already counted.
 */

import type { CandidateReport } from './quick-stop-candidates';

export type FunnelStep = {
  key: 'read' | 'screened' | 'judged' | 'matched';
  /** The count AT this step — a running total, not a delta. */
  count: number;
  label: string;
  /** What happened between the previous step and this one. Null on the first. */
  detail: string | null;
  /** Something the owner can actually do about this step, when there is one. */
  action: { label: string; href: string } | null;
  /** The step the eye should land on: the biggest single drop. */
  isBiggestDrop: boolean;
};

/** "1 record" / "3 records" — the unit this panel counts in throughout. */
function records(n: number): string {
  return `${n} record${n === 1 ? '' : 's'}`;
}

function list(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export function quickStopFunnel(report: CandidateReport): FunnelStep[] {
  const setAside = report.removed.duplicates + report.removed.alreadyQuickStop + report.removed.testData;

  const setAsideParts: string[] = [];
  if (report.removed.testData > 0) setAsideParts.push(`${report.removed.testData} that look like test data`);
  if (report.removed.duplicates > 0) {
    setAsideParts.push(`${report.removed.duplicates} ${report.removed.duplicates === 1 ? 'lead that had' : 'leads that had'} already become a job`);
  }
  if (report.removed.alreadyQuickStop > 0) {
    setAsideParts.push(`${report.removed.alreadyQuickStop} already booked as a Quick Stop`);
  }

  /* Ruled out by a rule, versus not readable at all. These are different
     problems with different answers — one is the screen working, the other is
     an empty description field — and the old panel reported them in two
     unrelated sentences a screen apart. */
  const ruledOut = report.excluded.length;
  const judgedParts: string[] = [];
  if (ruledOut > 0) {
    const top = report.topReasons[0];
    judgedParts.push(
      top && report.topReasons.length === 1
        ? `${ruledOut} ruled out — all of them: ${top.label.toLowerCase()}`
        : top
          ? `${ruledOut} ruled out, most often: ${top.label.toLowerCase()}`
          : `${ruledOut} ruled out by a rule`,
    );
  }
  if (report.unjudged > 0) {
    judgedParts.push(
      `${report.unjudged} with nothing written down to judge — a name or a phone number and no description`,
    );
  }

  const steps: FunnelStep[] = [
    {
      key: 'read',
      count: report.received,
      label: 'read',
      detail: null,
      action: null,
      isBiggestDrop: false,
    },
    {
      key: 'screened',
      /* `report.screened`, not `received - setAside`, even though the two are
         equal by construction. If they ever stop being equal the screener has
         grown a fourth way to drop a row, and this should show the number that
         was actually judged rather than a subtraction that hides it. */
      count: report.screened,
      label: 'screened',
      detail: setAside > 0 ? `${records(setAside)} set aside: ${list(setAsideParts)}` : 'Nothing set aside',
      action: null,
      isBiggestDrop: false,
    },
    {
      key: 'judged',
      count: report.eligible.length + report.unknownLength.length,
      label: 'passed every rule',
      detail: judgedParts.length > 0 ? list(judgedParts) : 'Nothing ruled out',
      action: null,
      isBiggestDrop: false,
    },
    {
      key: 'matched',
      count: report.eligible.length,
      label: 'countable',
      /* THE ONE THAT LOOKS LIKE A BUG AND IS NOT. Nothing in this app writes
         estimated_hours automatically, so on most accounts every record reaches
         the last step and stops here — the panel reports zero while the rows
         above it are perfectly good work. */
      detail:
        report.unknownLength.length > 0
          ? `${records(report.unknownLength.length)} passed but ${report.unknownLength.length === 1 ? 'has' : 'have'} no length recorded, so ${report.unknownLength.length === 1 ? 'it cannot' : 'they cannot'} be measured against your visit limit`
          : null,
      action:
        report.unknownLength.length > 0
          ? { label: 'Add lengths on these jobs', href: '#quick-stop-unknown' }
          : null,
      isBiggestDrop: false,
    },
  ];

  /* Where the eye should go: the single biggest fall, and only if it is a real
     one. Every step at the same count means nothing dropped anywhere, and
     highlighting "the biggest of five zeroes" would be pointing at noise. */
  let biggest = 0;
  let biggestAt = -1;
  for (let i = 1; i < steps.length; i += 1) {
    const drop = steps[i - 1].count - steps[i].count;
    if (drop > biggest) {
      biggest = drop;
      biggestAt = i;
    }
  }
  if (biggestAt > -1) steps[biggestAt].isBiggestDrop = true;

  return steps;
}

/**
 * The funnel in one sentence, for a screen reader and for the collapsed state.
 *
 * A row of five numbers with arrows between them is a picture; read aloud
 * unaided it is "54 48 6 3 0", which is not the same information.
 */
export function quickStopFunnelSentence(steps: FunnelStep[]): string {
  return steps.map((step) => `${step.count} ${step.label}`).join(', then ');
}

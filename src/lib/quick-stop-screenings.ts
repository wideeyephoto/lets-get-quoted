// The record of who ASKED for a Quick Stop, including everyone we said no to.
//
// A refusal used to leave no trace, which meant an empty queue was ambiguous in
// the worst possible way: "nobody asked" and "everybody asked and we refused
// them all" looked identical, and they need opposite responses.
//
// Writing is best-effort by design. A booking must never fail because we
// couldn't write a note about it.

import type { SupabaseClient } from '@supabase/supabase-js';

const MISSING_TABLE = '42P01';

/** Enough to recognise the job. Longer than this is a paragraph, not a label. */
const ISSUE_MAX = 240;

export type ScreeningOutcome = 'accepted' | 'not_a_fit' | 'unsafe';

export type ScreeningInput = {
  outcome: ScreeningOutcome;
  exclusions?: string[];
  reason?: string | null;
  issue?: string | null;
  visitMinutes?: number | null;
};

/**
 * Record one screening.
 *
 * Takes the ADMIN client: this runs from the public booking page, where there
 * is no session to carry. Never throws — a swallowed log is a lesser failure
 * than a customer being told their booking failed.
 */
export async function recordQuickStopScreening(
  admin: SupabaseClient,
  accountId: string,
  input: ScreeningInput,
): Promise<void> {
  try {
    await admin.from('extra_stop_screenings').insert({
      account_id: accountId,
      outcome: input.outcome,
      exclusions: input.exclusions ?? [],
      reason: input.reason ? String(input.reason).slice(0, 400) : null,
      // No name, phone, email or address reaches this table — see the migration.
      issue: input.issue ? String(input.issue).replace(/\s+/g, ' ').trim().slice(0, ISSUE_MAX) : null,
      visit_minutes: Number.isFinite(input.visitMinutes) ? input.visitMinutes : null,
    });
  } catch (error) {
    console.error('Quick Stop screening log failed:', error instanceof Error ? error.message : error);
  }
}

export type ScreeningSummary = {
  /** False until the migration has run — the panel then just omits this half. */
  available: boolean;
  asked: number;
  accepted: number;
  turnedAway: number;
  unsafe: number;
  /** Why they were turned away, most common first. */
  reasons: { label: string; count: number }[];
  /** A few of the actual jobs, so the number has something behind it. */
  examples: { issue: string; label: string; at: string }[];
};

const EMPTY: ScreeningSummary = {
  available: false,
  asked: 0,
  accepted: 0,
  turnedAway: 0,
  unsafe: 0,
  reasons: [],
  examples: [],
};

/** What the booking page has been asked for, and how it answered, since `sinceIso`. */
export async function loadScreeningSummary(
  supabase: SupabaseClient,
  accountId: string,
  sinceIso: string,
): Promise<ScreeningSummary> {
  const { data, error } = await supabase
    .from('extra_stop_screenings')
    .select('outcome, exclusions, reason, issue, created_at')
    .eq('account_id', accountId)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    if (error.code === MISSING_TABLE) return EMPTY;
    throw new Error(error.message);
  }

  const rows = (data ?? []) as ScreeningRow[];

  return summariseScreenings(rows);
}

export type ScreeningRow = {
  outcome: string;
  exclusions: string[] | null;
  reason?: string | null;
  issue: string | null;
  created_at: string;
};

/**
 * Turn the raw rows into the numbers the panel states.
 *
 * Pure, and split out because the counting has an easy mistake in it: an
 * accepted request is not a refusal with no reason, and a refusal with no
 * exclusions still needs a reason to be counted under. Both were only reachable
 * through the database before this.
 */
export function summariseScreenings(rows: ScreeningRow[]): ScreeningSummary {
  const counts = new Map<string, number>();
  const examples: ScreeningSummary['examples'] = [];
  let accepted = 0;
  let unsafe = 0;

  for (const row of rows) {
    if (row.outcome === 'accepted') {
      accepted += 1;
      continue;
    }
    if (row.outcome === 'unsafe') unsafe += 1;

    // An unsafe refusal is its own reason whatever else matched — it is the one
    // outcome where the customer was told to call 911 rather than shown a price,
    // and filing it under "large replacement" would lose that.
    const labels =
      row.outcome === 'unsafe'
        ? ['Unsafe — sent to emergency help']
        : row.exclusions?.length
          ? row.exclusions
          : ['Not a short single-visit job'];
    for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);

    if (row.issue && examples.length < 4) {
      examples.push({ issue: row.issue, label: labels[0], at: row.created_at });
    }
  }

  return {
    available: true,
    asked: rows.length,
    accepted,
    turnedAway: rows.length - accepted,
    unsafe,
    reasons: [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    examples,
  };
}

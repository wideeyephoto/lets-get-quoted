import type { SupabaseClient } from '@supabase/supabase-js';

// The decisions about a day that aren't times yet — currently just which stop
// the contractor means to finish on.
//
// Every read tolerates the table not existing: before the migration runs the
// preference is simply never remembered, which is exactly how it behaved
// before. A plan page that 500s because a nice-to-have table is missing would
// be a bad trade.

/** Postgres: relation does not exist. The migration hasn't been applied. */
const MISSING_TABLE = '42P01';
/** Postgres: unique violation — another tab inserted the same row first. */
const UNIQUE_VIOLATION = '23505';

export type DayPlanPrefs = {
  /** Job uuid or 'rs:<uuid>'. Null when nothing is set. */
  preferredLastId: string | null;
};

export const NO_PREFS: DayPlanPrefs = { preferredLastId: null };

export async function getDayPlanPrefs(
  supabase: SupabaseClient,
  accountId: string,
  dateKey: string,
  crewId: string | null,
): Promise<DayPlanPrefs> {
  const base = supabase.from('day_plan_prefs').select('preferred_last_id').eq('account_id', accountId).eq('plan_date', dateKey);
  // A day with no crew filter is stored with a NULL crew_id, and NULL can't be
  // matched with .eq() — it needs .is().
  const { data, error } = await (crewId ? base.eq('crew_id', crewId) : base.is('crew_id', null)).maybeSingle();

  if (error) {
    if (error.code !== MISSING_TABLE) console.error('Day plan prefs read failed:', error.message);
    return NO_PREFS;
  }
  return { preferredLastId: (data?.preferred_last_id as string) ?? null };
}

/**
 * Set (or clear) the stop this day should end on.
 *
 * Update-then-insert rather than upsert. The unique index has to coalesce a
 * null crew_id to a sentinel (in Postgres two NULLs are distinct, so a plain
 * index would store the business-wide preference twice) — and PostgREST's
 * on_conflict can't target an expression index. So the race is handled here
 * instead: whoever loses the insert re-runs the update over the winner's row.
 */
export async function savePreferredLast(
  supabase: SupabaseClient,
  accountId: string,
  dateKey: string,
  crewId: string | null,
  preferredLastId: string | null,
): Promise<void> {
  const scope = <T extends { eq: (column: string, value: string) => T; is: (column: string, value: null) => T }>(query: T): T =>
    crewId ? query.eq('crew_id', crewId) : query.is('crew_id', null);

  // Clearing removes the row rather than storing a null — a day with no
  // preference and a day that never had one are the same thing.
  if (!preferredLastId) {
    const { error } = await scope(
      supabase.from('day_plan_prefs').delete().eq('account_id', accountId).eq('plan_date', dateKey),
    );
    if (error && error.code !== MISSING_TABLE) console.error('Day plan pref clear failed:', error.message);
    return;
  }

  const patch = { preferred_last_id: preferredLastId, updated_at: new Date().toISOString() };

  async function update() {
    return scope(
      supabase.from('day_plan_prefs').update(patch).eq('account_id', accountId).eq('plan_date', dateKey),
    ).select('id');
  }

  const first = await update();
  if (first.error) {
    if (first.error.code === MISSING_TABLE) throw missing();
    throw failed(first.error.message);
  }
  if ((first.data ?? []).length > 0) return;

  const { error: insertError } = await supabase
    .from('day_plan_prefs')
    .insert({ account_id: accountId, plan_date: dateKey, crew_id: crewId, ...patch });
  if (!insertError) return;
  if (insertError.code === MISSING_TABLE) throw missing();

  if (insertError.code === UNIQUE_VIOLATION) {
    // Another tab got there between our update and our insert. Its row is the
    // one that exists now, so write over it.
    const retry = await update();
    if (!retry.error) return;
    throw failed(retry.error.message);
  }
  throw failed(insertError.message);
}

function missing(): Error {
  return new Error('Remembering a last stop needs the day-plan-prefs migration. Your route order is unaffected.');
}

function failed(message: string): Error {
  console.error('Day plan pref write failed:', message);
  return new Error('Could not save that last stop.');
}

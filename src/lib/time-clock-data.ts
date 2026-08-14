import type { SupabaseClient } from '@supabase/supabase-js';
import { createCost } from './jobs';
import { resolveCrewBurdenPct } from './cost-truth-data';
import { normalizeTimeClockMode, shiftHours, type OpenShift, type TimeClockMode } from './time-clock';

// Server side of the time clock.
//
// EVERY read here is written to survive the migration not having been run yet.
// A missing table or column comes back as a PostgREST error, not as null, so
// each one is caught and answered with "off" / empty. That means the feature is
// simply invisible until 2026-07-30-time-clock.sql is applied, rather than
// throwing on the field app — which is the screen a crew member opens standing
// on a roof.

/**
 * The account's clock setting.
 *
 * OWNER-SCOPED. `accounts` has no crew select policy — it holds Stripe ids,
 * plan and billing state — so calling this with a crew member's own client
 * returns no row, no error, and therefore 'off'. That is not a hypothetical:
 * the field app did exactly that, and an owner who had set clocking to
 * REQUIRED got crew screens offering the manual hours box instead, because
 * "off" is also what a missing migration looks like and the two were
 * indistinguishable here.
 *
 * The field app reads the mode off CrewContext (see lib/crew-auth), which
 * resolves it with the admin client in the read it was already doing. Pass this
 * an owner-scoped or admin client only.
 */
export async function getTimeClockMode(supabase: SupabaseClient, accountId: string): Promise<TimeClockMode> {
  try {
    const { data, error } = await supabase.from('accounts').select('time_clock_mode').eq('id', accountId).maybeSingle();
    if (error) return 'off';
    return normalizeTimeClockMode(data?.time_clock_mode);
  } catch {
    return 'off';
  }
}

/**
 * Whether the time clock exists in this database yet.
 *
 * getTimeClockMode answers 'off' both when the migration hasn't run AND when
 * the owner has genuinely switched it off, which is right for behavior and
 * useless for explaining. This separates the two so the settings control can
 * say "run the migration" instead of silently refusing to save.
 */
export async function isTimeClockAvailable(supabase: SupabaseClient, accountId: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('accounts').select('time_clock_mode').eq('id', accountId).maybeSingle();
    return !error;
  } catch {
    return false;
  }
}

export async function setTimeClockMode(supabase: SupabaseClient, accountId: string, mode: TimeClockMode): Promise<void> {
  const { error } = await supabase.from('accounts').update({ time_clock_mode: mode }).eq('id', accountId);
  // Surfaced, not swallowed: the owner just asked for this, so a failure has to
  // reach them rather than silently doing nothing.
  if (error) throw new Error('Could not save the time clock setting. The time clock migration may not have been run yet.');
}

export type TimeEntryRow = {
  id: string;
  account_id: string;
  crew_id: string;
  job_id: string;
  started_at: string;
  ended_at: string | null;
  rate: number | string;
  note: string | null;
  cost_id: string | null;
  closed_by_owner: boolean;
};

/** The crew member's currently running shift, if any. */
export async function getOpenShift(
  supabase: SupabaseClient,
  accountId: string,
  crewId: string,
): Promise<TimeEntryRow | null> {
  try {
    const { data, error } = await supabase
      .from('time_entries')
      .select('*')
      .eq('account_id', accountId)
      .eq('crew_id', crewId)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return (data as TimeEntryRow) ?? null;
  } catch {
    return null;
  }
}

/**
 * Start a shift.
 *
 * The database holds the real guarantee — a partial unique index on
 * (crew_id) where ended_at is null — so two taps that race each other end with
 * one row and one rejection rather than two shifts. The pre-check here is for a
 * decent message, not for correctness.
 */
export async function clockIn(
  supabase: SupabaseClient,
  accountId: string,
  crewId: string,
  jobId: string,
  rate: number,
  /**
   * When the shift actually started, for a clock-in that was queued offline and
   * is only now reaching the server. Omitted for the ordinary case, where the
   * column default (now()) is the honest answer. Callers are responsible for
   * bounding it — see resolveOfflineTime.
   */
  startedAt?: string,
): Promise<TimeEntryRow> {
  const existing = await getOpenShift(supabase, accountId, crewId);
  if (existing) {
    throw new Error(
      existing.job_id === jobId
        ? "You're already clocked in on this job."
        : "You're already clocked in on another job. Clock out of that one first.",
    );
  }

  const { data, error } = await supabase
    .from('time_entries')
    .insert({ account_id: accountId, crew_id: crewId, job_id: jobId, rate, ...(startedAt ? { started_at: startedAt } : {}) })
    .select('*')
    .single();

  if (error) {
    // 23505 = the one-open-shift index fired, i.e. we lost a race.
    if (error.code === '23505') throw new Error("You're already clocked in. Pull to refresh.");
    throw new Error('Could not clock in.');
  }
  return data as TimeEntryRow;
}

/**
 * Close a shift and turn it into a labor cost.
 *
 * The cost row is what every existing rollup reads, so this is the moment the
 * shift joins Hours & pay, Labor by job and the job's margin. Order matters:
 * the cost is created first and the shift is stamped second, because a shift
 * marked closed with no cost behind it is invisible work, whereas a cost with
 * an unstamped shift is caught by the next close attempt.
 */
export async function clockOut(
  supabase: SupabaseClient,
  accountId: string,
  entry: TimeEntryRow,
  options: {
    endedAt: string;
    crewName: string;
    note?: string | null;
    closedByOwner?: boolean;
    round?: (hours: number) => number;
    /** Cost category override — travel shifts cost out under 'Travel' so they
     *  stay separable from time spent on the work itself. */
    category?: string;
  },
): Promise<{ hours: number }> {
  const hours = shiftHours(entry.started_at, options.endedAt, options.round);
  const rate = Number(entry.rate) || 0;

  // A shift that rounds to nothing (clocked in and straight back out) closes
  // without creating a zero-hour cost row — that row would show up in Hours &
  // pay as an "incomplete time" entry needing review, which is a chore
  // manufactured out of a mis-tap.
  let costId: string | null = null;
  if (hours > 0) {
    const description = options.note?.trim() || `${options.crewName} — clocked shift`;
    // Burden is resolved HERE and snapshotted onto the cost row. Deriving it at
    // read time from whatever the settings say later would move the margin on
    // every job already closed.
    const burdenPct = await resolveCrewBurdenPct(supabase, accountId, entry.crew_id);
    const cost = await createCost(supabase, accountId, entry.job_id, {
      type: 'labor',
      description,
      crewId: entry.crew_id,
      hours,
      rate,
      // The only source that means "the app watched this happen".
      source: 'clocked',
      burdenPct,
      ...(options.category ? { category: options.category } : {}),
    });
    costId = cost.id;
  }

  const { error } = await supabase
    .from('time_entries')
    .update({
      ended_at: options.endedAt,
      cost_id: costId,
      closed_by_owner: options.closedByOwner ?? false,
      ...(options.note ? { note: options.note } : {}),
    })
    .eq('account_id', accountId)
    .eq('id', entry.id)
    // Only close a shift that is still open, so a double submit can't overwrite
    // an end time that's already been recorded (and double-bill the labor).
    .is('ended_at', null);

  if (error) throw new Error('Could not clock out.');
  return { hours };
}

/** Every running shift on the account — the owner's view of who's on the clock. */
export async function listOpenShifts(supabase: SupabaseClient, accountId: string): Promise<OpenShift[]> {
  try {
    const { data, error } = await supabase
      .from('time_entries')
      .select('id, crew_id, job_id, started_at, rate')
      .eq('account_id', accountId)
      .is('ended_at', null)
      .order('started_at', { ascending: true });
    if (error || !data || data.length === 0) return [];

    const crewIds = [...new Set(data.map((row) => row.crew_id as string))];
    const jobIds = [...new Set(data.map((row) => row.job_id as string))];
    const [{ data: crew }, { data: jobs }] = await Promise.all([
      supabase.from('crew').select('id, name').eq('account_id', accountId).in('id', crewIds),
      supabase.from('jobs').select('id, ref, client_name').eq('account_id', accountId).in('id', jobIds),
    ]);
    const crewById = new Map((crew ?? []).map((row) => [row.id as string, row.name as string]));
    const jobById = new Map((jobs ?? []).map((row) => [row.id as string, `${row.ref} · ${row.client_name}`]));

    return data.map((row) => ({
      id: row.id as string,
      crewId: row.crew_id as string,
      crewName: crewById.get(row.crew_id as string) ?? 'Crew member',
      jobId: row.job_id as string,
      jobLabel: jobById.get(row.job_id as string) ?? 'Job',
      startedAt: row.started_at as string,
      rate: Number(row.rate) || 0,
    }));
  } catch {
    return [];
  }
}

export async function getTimeEntry(
  supabase: SupabaseClient,
  accountId: string,
  entryId: string,
): Promise<TimeEntryRow | null> {
  const { data, error } = await supabase
    .from('time_entries')
    .select('*')
    .eq('account_id', accountId)
    .eq('id', entryId)
    .maybeSingle();
  if (error) return null;
  return (data as TimeEntryRow) ?? null;
}

/**
 * Clock times for a set of labor costs, so Hours & pay can show a shift's start
 * and end beside the hours it produced. Keyed by cost_id.
 */
export async function shiftTimesForCosts(
  supabase: SupabaseClient,
  accountId: string,
  costIds: string[],
): Promise<Map<string, { startedAt: string; endedAt: string | null; closedByOwner: boolean }>> {
  const map = new Map<string, { startedAt: string; endedAt: string | null; closedByOwner: boolean }>();
  if (costIds.length === 0) return map;
  try {
    const { data, error } = await supabase
      .from('time_entries')
      .select('cost_id, started_at, ended_at, closed_by_owner')
      .eq('account_id', accountId)
      .in('cost_id', costIds);
    if (error || !data) return map;
    for (const row of data) {
      if (!row.cost_id) continue;
      map.set(row.cost_id as string, {
        startedAt: row.started_at as string,
        endedAt: (row.ended_at as string | null) ?? null,
        closedByOwner: Boolean(row.closed_by_owner),
      });
    }
    return map;
  } catch {
    return map;
  }
}

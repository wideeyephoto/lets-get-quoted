import type { SupabaseClient } from '@supabase/supabase-js';
import { clockOut, type TimeEntryRow } from '@/lib/time-clock-data';

// Drive time, clocked automatically from "on my way" to "arrived".
//
// Opt-in per account, because switching it on changes the margin on work that
// was already quoted — a contractor should be the one to decide their jobs now
// carry travel cost.
//
// Travel is a real labor cost (somebody was paid to be in that van) so it lands
// in margin like any other, but under category 'Travel' so anything that wants
// the split has it. It is NOT a new cost_type: that enum is read by every
// report, export and rollup in the app, and widening it to answer one question
// would be a change with no edges.

export const TRAVEL_CATEGORY = 'Travel';

/**
 * Open a travel shift.
 *
 * Best-effort throughout. Somebody tapping "I'm on my way" is telling a
 * customer they're coming; a bookkeeping side effect must never be the reason
 * that fails. Every failure below returns null and the arrival proceeds.
 *
 * The existing one-open-shift-per-crew index is doing real work here: a tech
 * who is already clocked in on a job gets no travel shift, which is correct —
 * they're being paid for the work, not the drive.
 */
export async function openTravelShift(
  admin: SupabaseClient,
  input: { accountId: string; crewId: string; jobId: string; rate: number },
): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from('time_entries')
      .insert({
        account_id: input.accountId,
        crew_id: input.crewId,
        job_id: input.jobId,
        rate: input.rate,
        kind: 'travel',
      })
      .select('id')
      .single();
    // 23505 is the one-open-shift index: they're already on the clock, so there
    // is nothing to open and nothing to complain about.
    if (error) return null;
    return (data?.id as string) ?? null;
  } catch {
    return null;
  }
}

/**
 * Close the travel shift for this crew member, turning it into a Travel cost.
 *
 * Matched on the crew member rather than the job: a tech who set off for one
 * address and ended up at another still drove, and stranding an open shift is
 * how somebody's next clock-in starts failing for reasons they can't see.
 */
export async function closeTravelShift(
  admin: SupabaseClient,
  input: { accountId: string; crewId: string; crewName: string; endedAt?: string },
): Promise<number | null> {
  try {
    const { data } = await admin
      .from('time_entries')
      .select('*')
      .eq('account_id', input.accountId)
      .eq('crew_id', input.crewId)
      .eq('kind', 'travel')
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;

    const { hours } = await clockOut(admin, input.accountId, data as TimeEntryRow, {
      endedAt: input.endedAt ?? new Date().toISOString(),
      crewName: input.crewName,
      note: `${input.crewName} — travel to site`,
      category: TRAVEL_CATEGORY,
    });
    return hours;
  } catch (error) {
    console.error('Closing a travel shift failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

/** Is drive-time clocking switched on for this account? */
export function travelClockEnabled(account: Record<string, unknown> | null | undefined): boolean {
  return account?.arrival_clock_travel === true;
}

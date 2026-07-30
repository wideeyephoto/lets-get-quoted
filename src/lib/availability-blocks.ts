import type { SupabaseClient } from '@supabase/supabase-js';

// Owner-declared time off / blocked days — a date range that drops out of online
// booking (see src/lib/booking.ts) and shows as blocked on the schedule calendar.
export type AvailabilityBlock = {
  id: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  reason: string | null;
  created_at: string;
};

// Blocks whose range hasn't fully passed yet, soonest first.
export async function listUpcomingBlocks(supabase: SupabaseClient, accountId: string, todayKey: string): Promise<AvailabilityBlock[]> {
  const { data, error } = await supabase
    .from('availability_blocks')
    .select('id, start_date, end_date, reason, created_at')
    .eq('account_id', accountId)
    .gte('end_date', todayKey)
    .order('start_date', { ascending: true });
  if (error || !data) return [];
  return data as AvailabilityBlock[];
}

// Create a block. Normalizes the range so start <= end; a single day passes the
// same value for both. Throws a user-facing message on invalid input.
export async function createAvailabilityBlock(
  supabase: SupabaseClient,
  accountId: string,
  input: { startDate: string; endDate?: string | null; reason?: string | null },
): Promise<void> {
  const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const start = (input.startDate ?? '').trim();
  const rawEnd = (input.endDate ?? '').trim() || start;
  if (!isDate(start) || !isDate(rawEnd)) throw new Error('Pick valid start and end dates.');
  const [startDate, endDate] = start <= rawEnd ? [start, rawEnd] : [rawEnd, start];
  const reason = (input.reason ?? '').trim() || null;
  const { error } = await supabase.from('availability_blocks').insert({ account_id: accountId, start_date: startDate, end_date: endDate, reason });
  if (error) throw new Error('Could not save that block. Please try again.');
}

export async function deleteAvailabilityBlock(supabase: SupabaseClient, accountId: string, id: string): Promise<void> {
  await supabase.from('availability_blocks').delete().eq('account_id', accountId).eq('id', id);
}

// --- Recurring time off ---------------------------------------------------
//
// Expanded into ordinary one-day blocks rather than stored as a rule. Every
// consumer (the booking engine, the calendar, the blocked list) already
// understands a plain date range, so a repeat needs no new column, no schema
// migration, and no second code path that could disagree with the first about
// whether a given day is free.
//
// The trade is that a repeat is a fixed run of dates, not an open-ended rule —
// so it needs a horizon, and the owner picks how many occurrences to lay down.

export type RepeatFrequency = 'weekly' | 'biweekly' | 'monthly';
export const MAX_REPEAT_OCCURRENCES = 52;

function toKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * The dates a repeat lays down, starting ON `startDate` (which is always
 * included, whatever weekday it falls on). Pure — exported for testing.
 */
export function expandRepeatDates(startDate: string, frequency: RepeatFrequency, occurrences: number): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return [];
  const count = Math.min(MAX_REPEAT_OCCURRENCES, Math.max(1, Math.round(occurrences)));
  const start = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return [];

  const dates: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const date = new Date(start);
    if (frequency === 'monthly') {
      // Same day-of-month each month. Feb 30th doesn't exist, so a start date
      // past the 28th is clamped to that month's last day rather than rolling
      // into the next month — Jan 31 + 1 month is Feb 28, not Mar 3.
      const target = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
      date.setFullYear(target.getFullYear(), target.getMonth(), Math.min(start.getDate(), lastDay));
    } else {
      date.setDate(start.getDate() + i * (frequency === 'biweekly' ? 14 : 7));
    }
    dates.push(toKey(date));
  }
  return dates;
}

// Lay down a repeat as individual one-day blocks, skipping any date already
// blocked so re-running it can't stack duplicates on the same day.
export async function createRecurringAvailabilityBlocks(
  supabase: SupabaseClient,
  accountId: string,
  input: { startDate: string; frequency: RepeatFrequency; occurrences: number; reason?: string | null },
): Promise<number> {
  const dates = expandRepeatDates(input.startDate, input.frequency, input.occurrences);
  if (dates.length === 0) throw new Error('Pick a valid start date for the repeat.');

  const { data: existing } = await supabase
    .from('availability_blocks')
    .select('start_date, end_date')
    .eq('account_id', accountId)
    .gte('end_date', dates[0])
    .lte('start_date', dates[dates.length - 1]);

  const covered = (existing ?? []) as Array<{ start_date: string; end_date: string }>;
  const fresh = dates.filter((d) => !covered.some((b) => d >= b.start_date && d <= b.end_date));
  if (fresh.length === 0) return 0;

  const reason = (input.reason ?? '').trim() || null;
  const { error } = await supabase
    .from('availability_blocks')
    .insert(fresh.map((d) => ({ account_id: accountId, start_date: d, end_date: d, reason })));
  if (error) throw new Error('Could not save that repeat. Please try again.');
  return fresh.length;
}

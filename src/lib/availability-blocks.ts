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

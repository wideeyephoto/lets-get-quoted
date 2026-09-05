import type { SupabaseClient } from '@supabase/supabase-js';
import type { LaborEntry } from './labor';

// Reads for the Crew & Labor page. Kept apart from labor.ts so that module
// stays pure and client-safe — the rollups are imported by client components.

const LABOR_COLUMNS = 'id, crew_id, crew_name, crew_role_label, job_id, description, hours, rate, amount, created_at';

// A period can only ever cover so much; past that the page is a report, not a
// screen. Caps the worst case (an account with years of entries and a hand-
// edited custom range) rather than shipping 50k rows to a laptop.
const MAX_ENTRIES = 4000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

export async function listLaborEntries(
  supabase: SupabaseClient,
  accountId: string,
  options: { startIso: string; endIso: string; crewId?: string | null },
): Promise<LaborEntry[]> {
  let query = supabase
    .from('costs')
    .select(LABOR_COLUMNS)
    .eq('account_id', accountId)
    .eq('type', 'labor')
    .gte('created_at', options.startIso)
    .lt('created_at', options.endIso)
    .order('created_at', { ascending: false })
    .limit(MAX_ENTRIES);

  if (options.crewId && isUuid(options.crewId)) {
    query = query.eq('crew_id', options.crewId);
  }

  const { data, error } = await query;
  // Never 500 the page on a read error — an empty period is recoverable, a
  // crash on the screen someone opened to pay their crew is not.
  if (error) {
    console.error('Labor entry read failed:', error.message);
    return [];
  }
  return (data ?? []) as LaborEntry[];
}

/**
 * Hours per crew member for the current period, for the roster rows.
 *
 * One query for the whole roster rather than one per member — a 20-person crew
 * would otherwise cost 20 round trips to render a list.
 * Selects only crew_id, hours, and amount rather than all columns.
 */
export async function laborTotalsByCrew(
  supabase: SupabaseClient,
  accountId: string,
  options: { startIso: string; endIso: string },
): Promise<Map<string, { hours: number; pay: number }>> {
  const { data, error } = await supabase
    .from('costs')
    .select('crew_id, hours, amount')
    .eq('account_id', accountId)
    .eq('type', 'labor')
    .gte('created_at', options.startIso)
    .lt('created_at', options.endIso)
    .limit(MAX_ENTRIES);

  if (error) {
    console.error('Labor totals read failed:', error.message);
    return new Map();
  }

  const totals = new Map<string, { hours: number; pay: number }>();
  for (const entry of data ?? []) {
    if (!entry.crew_id) continue;
    const bucket = totals.get(entry.crew_id) ?? { hours: 0, pay: 0 };
    bucket.hours += Number(entry.hours) || 0;
    bucket.pay += Number(entry.amount) || 0;
    totals.set(entry.crew_id, bucket);
  }
  for (const [id, bucket] of totals) {
    totals.set(id, { hours: Math.round(bucket.hours * 100) / 100, pay: Math.round(bucket.pay * 100) / 100 });
  }
  return totals;
}

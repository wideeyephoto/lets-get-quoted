import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveBurdenPct } from '@/lib/cost-truth';

/**
 * The burden percentage to apply to one crew member's hours right now.
 *
 * Read at the moment a cost is recorded and then SNAPSHOTTED onto that row.
 * Deriving it later from the current settings would silently rewrite every
 * historical margin the day an owner adjusted their comp rate — a job that
 * closed at 32% would quietly become a job that closed at 28%, and the P&L for
 * a finished year would move.
 *
 * Defensive throughout: an un-migrated database, a missing crew member or a
 * failed read all mean 0% rather than a thrown error. Burden is an improvement
 * to a cost figure, not a precondition for recording one — refusing to save a
 * shift because a settings column is missing would be a much worse failure.
 */
export async function resolveCrewBurdenPct(
  supabase: SupabaseClient,
  accountId: string,
  crewId: string | null | undefined,
): Promise<number> {
  try {
    const [{ data: account }, crewRow] = await Promise.all([
      supabase.from('accounts').select('default_burden_pct').eq('id', accountId).maybeSingle(),
      crewId
        ? supabase.from('crew').select('burden_pct').eq('account_id', accountId).eq('id', crewId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    return resolveBurdenPct(
      (crewRow as { data: { burden_pct?: unknown } | null } | null)?.data?.burden_pct as number | null | undefined,
      account?.default_burden_pct as number | null | undefined,
    );
  } catch (error) {
    console.error('Burden lookup failed; costing at 0%:', error instanceof Error ? error.message : error);
    return 0;
  }
}

/** The owner's minimum-margin floor, as a percentage. 0 means "don't warn me". */
export async function getMinMarginPct(supabase: SupabaseClient, accountId: string): Promise<number> {
  const { data } = await supabase.from('accounts').select('min_margin_pct').eq('id', accountId).maybeSingle();
  const n = Number(data?.min_margin_pct);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

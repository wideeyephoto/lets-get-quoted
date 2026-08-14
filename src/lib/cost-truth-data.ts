import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { DEFAULT_MIN_MARGIN_PCT, resolveBurdenPct } from '@/lib/cost-truth';

/**
 * The burden percentage to apply to one crew member's hours right now.
 *
 * Read at the moment a cost is recorded and then SNAPSHOTTED onto that row.
 * Deriving it later from the current settings would silently rewrite every
 * historical margin the day an owner adjusted their comp rate — a job that
 * closed at 32% would quietly become a job that closed at 28%, and the P&L for
 * a finished year would move.
 *
 * THE ACCOUNT DEFAULT IS READ ADMIN-SIDE. It lives on `accounts`, and crew hold
 * no select policy there — so called with a crew member's own client (which is
 * exactly what the field app does, on every clock-out and every logged hour)
 * the read returned no row, no error, and the default resolved to 0%. Hours
 * logged from a phone were costed bare while identical hours keyed in by the
 * owner carried burden, and the job's margin depended on who typed it. Same
 * shape as the time-clock bug: an owner-only table read through a crew client,
 * answering "unset" instead of failing. The account id is server-resolved by
 * every caller, so there is nothing here for a request to point somewhere else.
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
      createAdminClient().from('accounts').select('default_burden_pct').eq('id', accountId).maybeSingle(),
      // The crew row stays on the caller's client: a crew member can read their
      // own (crew_self_read), an owner can read all, and neither should be able
      // to reach one they aren't entitled to just because this helper could.
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

/**
 * A representative loaded cost for an hour of crew time, for pricing work that
 * hasn't happened yet.
 *
 * The MEDIAN wage rather than the mean: one owner paying themselves $150/hr on
 * paper drags an average of five $28/hr crew somewhere neither figure lives, and
 * every quote after that is checked against a rate nobody works at.
 *
 * Returns 0 when there's no crew or no rates on file, which reads downstream as
 * "we can't estimate labour cost" rather than as "labour is free".
 */
export async function accountLoadedHourlyRate(supabase: SupabaseClient, accountId: string): Promise<number> {
  try {
    const [{ data: crew }, { data: account }] = await Promise.all([
      supabase.from('crew').select('hourly_rate, burden_pct').eq('account_id', accountId),
      supabase.from('accounts').select('default_burden_pct').eq('id', accountId).maybeSingle(),
    ]);
    const rates = (crew ?? [])
      .map((member) => ({
        wage: Number(member.hourly_rate) || 0,
        burden: resolveBurdenPct(member.burden_pct as number | null, account?.default_burden_pct as number | null),
      }))
      .filter((entry) => entry.wage > 0)
      .sort((a, b) => a.wage - b.wage);
    if (rates.length === 0) return 0;
    const middle = rates[Math.floor(rates.length / 2)];
    return Math.round(middle.wage * (1 + middle.burden / 100) * 100) / 100;
  } catch (error) {
    console.error('Loaded rate lookup failed:', error instanceof Error ? error.message : error);
    return 0;
  }
}

/**
 * The owner's minimum-margin floor, as a percentage. 0 means "don't warn me" —
 * a real choice, so a stored 0 is honoured. The default only applies when there
 * is no row at all to read.
 */
export async function getMinMarginPct(supabase: SupabaseClient, accountId: string): Promise<number> {
  const { data } = await supabase.from('accounts').select('min_margin_pct').eq('id', accountId).maybeSingle();
  const n = Number(data?.min_margin_pct);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : DEFAULT_MIN_MARGIN_PCT;
}

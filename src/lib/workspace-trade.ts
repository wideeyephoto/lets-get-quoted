import type { SupabaseClient } from '@supabase/supabase-js';
import { getSiteContent } from './site-content';

/**
 * Authoritative trade resolution: site content -> account trade -> null.
 * Requires an admin client because `sites` and `accounts` are owner-only under session RLS.
 */
export async function getAuthoritativeTrade(admin: SupabaseClient, accountId: string): Promise<string | null> {
  if (!accountId || typeof accountId !== 'string') return null;
  try {
    const [{ data: site }, { data: account }] = await Promise.all([
      admin.from('sites').select('content').eq('account_id', accountId).limit(1).maybeSingle(),
      admin.from('accounts').select('trade').eq('id', accountId).maybeSingle(),
    ]);

    const siteTrade = getSiteContent(site?.content as Record<string, unknown> | null).trade.trim();
    if (siteTrade) return siteTrade;

    const accountTrade = (account?.trade as string | null)?.trim();
    return accountTrade || null;
  } catch (err) {
    console.error('Failed to resolve authoritative trade for workspace:', err);
    return null;
  }
}

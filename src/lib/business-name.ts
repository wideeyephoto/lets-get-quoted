import type { SupabaseClient } from '@supabase/supabase-js';
import { PLACEHOLDER_BUSINESS_NAME } from '@/lib/terms';

/**
 * Whose name goes on a text, an email, an invoice, a receipt.
 *
 * THE BUG THIS EXISTS TO KILL. A business name lives in two places:
 *
 *   accounts.business_name  — written once, at signup, as the placeholder
 *                             "My Business", and almost never touched again
 *   sites.company_name      — what the owner actually typed in the builder,
 *                             and renames after that only ever land here
 *
 * Measured on the live database, every account still reads "My Business" while
 * their sites say BrokePipes, Chelsea's Cleaning Service, and so on. Around
 * twenty-five call sites read `accounts.business_name` on its own, so every
 * automated text those sites send introduced the contractor to their own
 * customer as "My Business" — and when even that was blank, as "Let's Get
 * Quoted contractor", which is our name, not theirs.
 *
 * A homeowner who booked BrokePipes and gets a text from "My Business" does not
 * think "ah, a placeholder". They think it is spam, or a scam, and they do not
 * reply.
 *
 * THE LADDER. Site first, because it is the name the owner maintains. The
 * account name second, but only when it is a name somebody chose — the
 * placeholder is treated as absent, because it is. The fallback last, and it
 * never names Let's Get Quoted: a customer reading a text about their own
 * appointment should see the contractor they hired or a neutral word, never the
 * software that sent it.
 */

export const BUSINESS_NAME_FALLBACK = 'Your contractor';

type AccountLike = { business_name?: string | null } | null | undefined;
type SiteLike = { company_name?: string | null } | null | undefined;

/** Pure: the two rows in, the customer-facing name out. */
export function pickBusinessName(
  site: SiteLike,
  account: AccountLike,
  fallback: string = BUSINESS_NAME_FALLBACK,
): string {
  const fromSite = (site?.company_name ?? '').trim();
  if (fromSite && fromSite !== PLACEHOLDER_BUSINESS_NAME) return fromSite;
  const fromAccount = (account?.business_name ?? '').trim();
  if (fromAccount && fromAccount !== PLACEHOLDER_BUSINESS_NAME) return fromAccount;
  return fallback;
}

/**
 * Load it for one account.
 *
 * Two queries rather than one join because `sites` is one-per-account by
 * convention and not by constraint, and a join that silently returns two rows
 * is a worse failure than an extra round trip. `maybeSingle` on both: an
 * account with no site yet is normal, and a missing row must fall through the
 * ladder rather than throw inside whatever this was called from — these are all
 * best-effort notification paths, and none of them should fail a job update
 * because a name lookup did.
 *
 * Works with a user-scoped client (RLS keeps it to their own rows) and with the
 * admin client, so webhook and cron paths use the same ladder as the dashboard.
 */
export async function loadBusinessName(
  client: SupabaseClient,
  accountId: string,
  fallback: string = BUSINESS_NAME_FALLBACK,
): Promise<string> {
  const [{ data: site }, { data: account }] = await Promise.all([
    client.from('sites').select('company_name').eq('account_id', accountId).limit(1).maybeSingle(),
    client.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
  ]);
  return pickBusinessName(site as SiteLike, account as AccountLike, fallback);
}

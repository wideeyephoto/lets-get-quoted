import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { removeDomainFromVercel } from '@/lib/vercel-domains';

/**
 * Handing a custom domain back when the workspace holding it goes away.
 *
 * The builder already releases a domain the owner replaces or clears, because
 * that path runs an UPDATE it can hook. Deletion had no such hook: `sites` is
 * removed by cascade when the account row goes, so by the time anything knows
 * the account is gone the domain it held is unreadable. The binding then
 * outlives the customer — our project keeps answering for a hostname nobody
 * here owns any more, and, because Vercel will not let two projects claim the
 * same domain, whoever buys or re-points that name next cannot attach it and
 * gets no explanation.
 *
 * Hence two calls rather than one: read the domains while the rows still
 * exist, delete, and release only once the delete is CONFIRMED. Releasing
 * first would strand a live website on a failed deletion — and the account
 * delete genuinely does fail, routinely, on the retained-ledger foreign keys.
 */

/** Every custom domain this account still holds. Call BEFORE the delete. */
export async function readAccountCustomDomains(
  admin: SupabaseClient,
  accountId: string,
): Promise<string[]> {
  const { data, error } = await admin
    .from('sites')
    .select('custom_domain')
    .eq('account_id', accountId);
  if (error) throw new Error(`Could not read custom domains: ${error.message}`);
  return ((data ?? []) as Array<{ custom_domain: string | null }>)
    .map((row) => row.custom_domain)
    .filter((domain): domain is string => Boolean(domain?.trim()));
}

export type CustomDomainReleaseResult = {
  released: string[];
  failed: string[];
};

/**
 * Detach each domain from the project. Call AFTER the delete is confirmed.
 *
 * Never throws: this runs after the destructive step, and an unreachable
 * provider must not turn a completed deletion into a reported failure. A domain
 * that could not be detached is returned so the caller can record it — that is
 * a binding a human has to remove by hand, and silence about it is how a leak
 * becomes permanent.
 */
export async function releaseCustomDomains(domains: string[]): Promise<CustomDomainReleaseResult> {
  const result: CustomDomainReleaseResult = { released: [], failed: [] };
  for (const domain of [...new Set(domains)]) {
    // removeDomainFromVercel returns false when unconfigured or on any provider
    // error, and logs its own reason.
    if (await removeDomainFromVercel(domain)) result.released.push(domain);
    else result.failed.push(domain);
  }
  if (result.failed.length) {
    console.error(
      `[custom-domain-release] still attached to the project after deletion: ${result.failed.join(', ')}`,
    );
  }
  return result;
}

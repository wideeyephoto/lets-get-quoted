/**
 * Portal URL helpers — the ONE place that knows the shape of customer-facing URLs.
 *
 * Before this, `/portal/view/${token}` and `/client/jobs/${jobId}` were assembled
 * by template literal in a dozen call sites. When T23 asked for consolidation,
 * the answer was not to merge two pages that do different things, but to stop
 * every file from independently guessing the path.
 */

/** The account-level portal landing page for a customer. */
export function portalViewUrl(token: string): string {
  return `/portal/view/${token}`;
}

/** The single-job detail page a customer reaches from their portal or an SMS link. */
export function clientJobUrl(jobIdOrToken: string): string {
  return `/client/jobs/${jobIdOrToken}`;
}

/**
 * A fully qualified portal URL with origin.
 * Uses NEXT_PUBLIC_APP_URL when available, falls back to the provided origin.
 */
export function portalViewUrlFull(token: string, origin?: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || origin || 'https://app.letsgetquoted.com').replace(/\/$/, '');
  return `${base}${portalViewUrl(token)}`;
}

/**
 * A fully qualified client job URL with origin.
 */
export function clientJobUrlFull(jobIdOrToken: string, origin?: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || origin || 'https://app.letsgetquoted.com').replace(/\/$/, '');
  return `${base}${clientJobUrl(jobIdOrToken)}`;
}

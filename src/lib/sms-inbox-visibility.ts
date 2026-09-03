/**
 * Result shape shared by Supabase select/update builders once awaited.
 *
 * Kept structural so this helper does not erase each caller's inferred row or
 * count type.
 */
type QueryResult = { error: unknown };

/**
 * Run a customer-inbox query with `inbox_visible = true`.
 *
 * There is deliberately no pre-migration compatibility retry. Returning no
 * customer transcript during a coordinated pre-column window is safer than
 * retrying an unfiltered query that can expose owner/crew field commands or
 * platform notifications. The release runbook deliberately deploys and drains
 * these fail-closed readers before backfilling visibility, then re-enables the
 * inbound worker after the matching RPC migration is present.
 */
export async function runSmsInboxVisibleQuery<Result extends QueryResult>(
  buildQuery: (includeVisibilityFilter: boolean) => PromiseLike<Result>,
): Promise<Result> {
  return buildQuery(true);
}

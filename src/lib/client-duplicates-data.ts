import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The duplicate suggestions this account has already turned down.
 *
 * Its own module so client-duplicates.ts stays pure — every rule in there is a
 * function over a list of records, which is what makes the whole finder
 * testable without a database.
 *
 * DEGRADES TO "NONE". This ships ahead of its migration, and a customer book
 * that refuses to render because a suggestions table is missing would be a far
 * worse outcome than a suggestion reappearing. See
 * migrations/2026-08-16-duplicate-dismissals.sql — the WRITE says so out loud
 * instead, because a dismiss button that silently does nothing is the failure
 * worth naming.
 */
export async function listDuplicateDismissals(supabase: SupabaseClient, accountId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('client_duplicate_dismissals')
    .select('member_key')
    .eq('account_id', accountId);

  if (error || !data) return new Set();
  return new Set(data.map((row) => String((row as { member_key: string }).member_key)));
}

import type { SupabaseClient } from '@supabase/supabase-js';
import { assertQuickStopTransition, type QuickStopStatus } from '@/lib/quick-stop';

/** Validate the lifecycle and claim the exact version read before side effects.
 * Transactional offer/refund RPCs apply the same lifecycle in the database.
 */
export async function transitionQuickStopRequest(
  client: SupabaseClient,
  input: {
    accountId: string;
    requestId: string;
    from: QuickStopStatus;
    to: QuickStopStatus;
    patch?: Record<string, unknown>;
    expected?: Record<string, string | number | boolean | null>;
  },
): Promise<boolean> {
  assertQuickStopTransition(input.from, input.to);
  let query = client.from('extra_stop_requests')
    .update({ ...input.patch, status: input.to })
    .eq('account_id', input.accountId)
    .eq('id', input.requestId)
    .eq('status', input.from);
  for (const [field, value] of Object.entries(input.expected ?? {})) {
    query = value === null ? query.is(field, null) : query.eq(field, value);
  }
  const { data, error } = await query.select('id').maybeSingle();
  if (error) throw new Error(`Quick Stop transition failed: ${error.message}`);
  return Boolean(data);
}

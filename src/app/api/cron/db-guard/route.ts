import { cronRoute } from '@/lib/cron-runs';
import { createAdminClient } from '@/lib/auth';
import { runDatabasePoolGuard } from '@/lib/ai-operator/db-guard';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function runDbGuardCronBatch(admin?: SupabaseClient) {
  const client = admin || createAdminClient();
  const result = await runDatabasePoolGuard(client);
  return {
    // The worker collects an `errors` array and this summary used to drop it, so
    // `cronSummaryHasFailures` had nothing to match on and every run recorded ok:
    // true no matter what the sweep could not do. A health badge that cannot go red
    // is not monitoring. The count is what the matcher keys on; the samples are for
    // whoever reads the run row afterwards.
    ok: result.errors.length === 0,
    longRunningQueries: result.longRunningQueriesCount,
    canceledQueries: result.canceledQueriesCount,
    status: result.status,
    errors: result.errors.length,
    errorSamples: result.errors.slice(0, 5),
  };
}

export const GET = cronRoute('db-guard', () => runDbGuardCronBatch());

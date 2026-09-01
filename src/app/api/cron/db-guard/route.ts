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
    ok: true,
    longRunningQueries: result.longRunningQueriesCount,
    canceledQueries: result.canceledQueriesCount,
    status: result.status,
  };
}

export const GET = cronRoute('db-guard', () => runDbGuardCronBatch());

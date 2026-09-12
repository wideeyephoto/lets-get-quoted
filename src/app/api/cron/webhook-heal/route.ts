import { cronRoute } from '@/lib/cron-runs';
import { createAdminClient } from '@/lib/auth';
import { runWebhookAutoHealer } from '@/lib/ai-operator/webhook-healer';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function runWebhookHealCronBatch(admin?: SupabaseClient) {
  const client = admin || createAdminClient();
  const result = await runWebhookAutoHealer(client);
  return {
    // The worker collects an `errors` array and this summary used to drop it, so
    // `cronSummaryHasFailures` had nothing to match on and every run recorded ok:
    // true no matter what the sweep could not do. A health badge that cannot go red
    // is not monitoring. The count is what the matcher keys on; the samples are for
    // whoever reads the run row afterwards.
    ok: result.errors.length === 0,
    totalUnresolved: result.totalUnresolved,
    replayed: result.replayedCount,
    autoResolved: result.autoResolvedCount,
    escalatedToHitl: result.escalatedToHitlCount,
    errors: result.errors.length,
    errorSamples: result.errors.slice(0, 5),
  };
}

export const GET = cronRoute('webhook-heal', () => runWebhookHealCronBatch());

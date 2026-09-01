import { cronRoute } from '@/lib/cron-runs';
import { createAdminClient } from '@/lib/auth';
import { runSmartDunningSweep } from '@/lib/ai-operator/smart-dunning';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function runSmartDunningCronBatch(admin?: SupabaseClient) {
  const client = admin || createAdminClient();
  const result = await runSmartDunningSweep(client);
  return {
    ok: true,
    totalDunning: result.totalDunningAccounts,
    retriesOptimized: result.retriesOptimized,
    gracePeriodsApplied: result.gracePeriodsApplied,
    cardUpdateLinksDispatched: result.cardUpdateLinksDispatched,
  };
}

export const GET = cronRoute('smart-dunning', () => runSmartDunningCronBatch());

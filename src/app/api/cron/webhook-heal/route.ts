import { cronRoute } from '@/lib/cron-runs';
import { createAdminClient } from '@/lib/auth';
import { runWebhookAutoHealer } from '@/lib/ai-operator/webhook-healer';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function runWebhookHealCronBatch(admin?: SupabaseClient) {
  const client = admin || createAdminClient();
  const result = await runWebhookAutoHealer(client);
  return {
    ok: true,
    totalUnresolved: result.totalUnresolved,
    replayed: result.replayedCount,
    autoResolved: result.autoResolvedCount,
    escalatedToHitl: result.escalatedToHitlCount,
  };
}

export const GET = cronRoute('webhook-heal', () => runWebhookHealCronBatch());

import { cronRoute } from '@/lib/cron-runs';
import { createAdminClient } from '@/lib/auth';
import { expireHoldsAndCascade } from '@/lib/cancellation-waitlist-data';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function runWaitlistSweepCron(admin?: SupabaseClient) {
  const client = admin || createAdminClient();
  const result = await expireHoldsAndCascade(client);
  return {
    success: true,
    expiredCount: result.expiredCount,
    cascadedCount: result.cascadedCount,
    timestamp: new Date().toISOString(),
  };
}

export const GET = cronRoute('waitlist-sweep', () => runWaitlistSweepCron(createAdminClient()));

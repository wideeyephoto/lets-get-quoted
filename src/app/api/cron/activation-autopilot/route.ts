import { cronRoute } from '@/lib/cron-runs';
import { createAdminClient } from '@/lib/auth';
import { runActivationAutopilotSweep } from '@/lib/ai-operator/activation-nudge';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function runActivationAutopilotCronBatch(admin?: SupabaseClient) {
  const client = admin || createAdminClient();
  const result = await runActivationAutopilotSweep(client);
  return {
    ok: true,
    scanned: result.accountsScanned,
    welcomeNudges: result.welcomeNudgesSent,
    stripeReminders: result.stripeRemindersSent,
    phoneSetupNudges: result.phoneSetupNudgesSent,
    skippedQuietHours: result.skippedQuietHours,
  };
}

export const GET = cronRoute('activation-autopilot', () => runActivationAutopilotCronBatch());

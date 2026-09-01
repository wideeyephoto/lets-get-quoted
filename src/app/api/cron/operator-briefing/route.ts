import { cronRoute } from '@/lib/cron-runs';
import { createAdminClient } from '@/lib/auth';
import { runAutonomousOperatorCycle } from '@/lib/ai-operator/engine';
import { dispatchExecutiveBriefingDigest } from '@/lib/ai-operator/digest';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function runOperatorMorningBriefingCron(admin?: SupabaseClient) {
  const client = admin || createAdminClient();
  const report = await runAutonomousOperatorCycle(client, { adminUserId: 'cron-operator-7am' });
  const digestResult = await dispatchExecutiveBriefingDigest(report.briefing);

  return {
    cycleId: report.cycleId,
    timestamp: report.timestamp,
    mrrEstimated: report.briefing.revenue.mrrEstimated,
    totalContractors: report.briefing.contractors.totalActive,
    safeActionsExecuted: report.safeActionsExecuted,
    digestDelivered: digestResult.success,
    deliveredVia: digestResult.deliveredVia,
  };
}

export const GET = cronRoute('operator-briefing', () => runOperatorMorningBriefingCron(createAdminClient()));

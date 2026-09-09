import { cronRoute } from '@/lib/cron-runs';
import { createAdminClient } from '@/lib/auth';
import { runAutonomousOperatorCycle } from '@/lib/ai-operator/engine';
import { flushOperatorWrites } from '@/lib/ai-operator/audit';
import { dispatchExecutiveBriefingDigest } from '@/lib/ai-operator/digest';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function runOperatorMorningBriefingCron(admin?: SupabaseClient) {
  const client = admin || createAdminClient();
  const report = await runAutonomousOperatorCycle(client, { adminUserId: 'cron-operator-7am' });
  const digestResult = await dispatchExecutiveBriefingDigest(report.briefing);

  // Land the audit rows before the lambda is frozen, otherwise this run leaves no trace.
  await flushOperatorWrites();

  return {
    cycleId: report.cycleId,
    timestamp: report.timestamp,
    mrrEstimated: report.briefing.revenue.mrrEstimated,
    totalContractors: report.briefing.contractors.totalActive,
    safeActionsExecuted: report.safeActionsExecuted,
    onboardingNudgeCandidates: report.onboardingNudgeCandidates,
    digestDelivered: digestResult.success,
    deliveredVia: digestResult.deliveredVia,
  };
}

export const GET = cronRoute('operator-briefing', () => runOperatorMorningBriefingCron(createAdminClient()));

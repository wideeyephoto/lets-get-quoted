import { cronRoute } from '@/lib/cron-runs';
import { createAdminClient } from '@/lib/auth';
import { runHaloPacingWorker } from '@/lib/billing/halo-pacing-worker';

export const dynamic = 'force-dynamic';

export const GET = cronRoute('halo-pacing', async () => {
  const admin = createAdminClient();
  const res = await runHaloPacingWorker(admin);
  return {
    processed: res.processed,
    advanced: res.advanced,
    completed: res.completed,
    killed: res.killed,
    totalDailySpendDollars: res.totalDailySpendDollars.toFixed(2),
    summary: res.summary,
  };
});

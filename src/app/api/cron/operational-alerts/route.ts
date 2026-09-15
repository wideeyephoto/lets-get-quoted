import { cronRoute } from '@/lib/cron-runs';
import { createAdminClient } from '@/lib/supabase-admin';
import {
  runOperationalMonitor,
  sendMonitorFailure,
  sendMonitorRecovery,
  recordDurableFailure,
} from '@/lib/operational-monitor.mjs';
import configuration from '../../../../../vercel.json';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export const GET = cronRoute('operational-alerts', async () => {
  const admin = createAdminClient();
  const source = 'vercel';
  const deploymentId = process.env.VERCEL_GIT_COMMIT_SHA || null;

  try {
    const result: any = await runOperationalMonitor({
      admin,
      crons: configuration.crons,
    });

    if (result.failed) {
      await sendMonitorFailure({
        stateInfo: { last_failed_stage: 'delivery_record', consecutive_failures: 1 },
        source,
        deploymentId,
      });
    } else if (result.wasOutage) {
      try {
        await sendMonitorRecovery({
          admin,
          result,
          source,
          deploymentId,
        });
      } catch (recoveryErr) {
        console.error('[operational-alerts] recovery notification failed:', recoveryErr);
      }
    }

    return result;
  } catch (error: any) {
    let stateInfo: any = null;
    try {
      stateInfo = await recordDurableFailure(admin, error, { source, deploymentId });
    } catch (stateErr) {
      console.error('[operational-alerts] could not record durable failure:', stateErr);
    }

    // Only send emergency alert if failure escalated to 'outage'
    // (e.g. 2 consecutive runs failed, stale >= 10m, or fatal permissions).
    // Degraded interruptions (single failure with recent success) are retained without urgent emails.
    if (!stateInfo || stateInfo.should_alert) {
      try {
        await sendMonitorFailure({
          error,
          stateInfo,
          source,
          deploymentId,
        });
      } catch {
        console.error('[operational-alerts] fallback notification failed');
      }
    }

    throw error;
  }
});

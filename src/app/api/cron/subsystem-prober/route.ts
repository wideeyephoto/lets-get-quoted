import { NextResponse } from 'next/server';
import { cronRoute } from '@/lib/cron-runs';
import { createAdminClient } from '@/lib/supabase-admin';
import { getCronTrouble } from '@/lib/cron-runs';
import { dispatchOnCallPage } from '@/lib/on-call-paging';
import { getApmSummary } from '@/lib/apm-telemetry';

export const GET = cronRoute('subsystem-prober', async () => {
  const admin = createAdminClient();
  const trouble = await getCronTrouble(admin);
  
  // 1. Check failing money crons
  const moneyCrons = trouble.filter(t => t.health === 'failing' || t.health === 'stale');
  let paged = 0;
  for (const item of moneyCrons) {
    // Only page if it's 'money' importance
    // Wait, getCronTrouble doesn't return importance directly, but we can import CRON_JOBS
    // For now, let's just page if consequence implies money or we lookup CRON_JOBS.
    // Actually we can just page for any trouble, or specifically money ones.
  }
  
  // Actually let's import CRON_JOBS
  const { CRON_JOBS } = await import('@/lib/cron-jobs');
  
  for (const item of trouble) {
    const spec = CRON_JOBS.find(j => j.job === item.job);
    if (spec?.importance === 'money') {
      await dispatchOnCallPage({
        title: `CRITICAL: Money Cron Failed (${item.job})`,
        incidentType: 'cron_failure',
        severity: 'P2_HIGH',
        actionRequired: item.consequence,
        summary: 'Money cron failed', details: {
          job: item.job,
          health: item.health,
          lastSuccess: item.lastSuccessAt
        }
      });
      paged++;
    }
  }

  // 2. Wire APM and Sentry (Persist APM buffer implicitly or via Sentry)
  const apm = getApmSummary();
  if (apm.errorRatePct > 5) {
    await dispatchOnCallPage({
      title: `High Error Rate: ${apm.errorRatePct}%`,
      incidentType: 'uptime',
      severity: 'P2_HIGH',
      summary: 'High APM Error Rate', details: apm as any
    });
    paged++;
  }

  return { ok: true, paged, apmHealthy: apm.healthy };
});

import { cronRoute } from '@/lib/cron-runs';
import { createAdminClient } from '@/lib/supabase-admin';
import { runOperationalMonitor, sendMonitorFailure } from '@/lib/operational-monitor.mjs';
import configuration from '../../../../../vercel.json';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export const GET = cronRoute('operational-alerts', async () => {
  try {
    const result = await runOperationalMonitor({ admin: createAdminClient(), crons: configuration.crons });
    if (result.failed) await sendMonitorFailure();
    return result;
  } catch (error) {
    try { await sendMonitorFailure(); } catch { console.error('[operational-alerts] fallback notification failed'); }
    throw error;
  }
});

import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import {
  runOperationalMonitor,
  sendMonitorFailure,
  sendMonitorRecovery,
  recordDurableFailure,
} from '../src/lib/operational-monitor.mjs';

const env = process.env;
let admin;
try {
  admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, init) => fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(15000) }) },
  });
} catch {
  console.error('Database client configuration invalid');
}

try {
  const { crons } = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const source = 'github-watchdog';

  // Run the operational monitor with safe retries and durable state coordination
  const result = await runOperationalMonitor({
    admin,
    crons,
    source,
  });

  console.log(JSON.stringify(result));

  // If monitoring previously suffered an outage and now succeeded, send recovery notification
  if (result.wasOutage) {
    try {
      await sendMonitorRecovery({
        admin,
        result,
        source,
      });
    } catch (recoveryErr) {
      console.error('Watchdog recovery notification failed:', recoveryErr);
    }
  }
} catch (error) {
  console.error('Operational monitor watchdog failed. Check configuration, database and delivery evidence.', error?.message || error);

  let stateInfo = null;
  if (admin) {
    try {
      stateInfo = await recordDurableFailure(admin, error, { source: 'github-watchdog' });
    } catch (stateErr) {
      console.error('Watchdog could not record durable failure:', stateErr);
    }
  }

  // Only dispatch alert if failure reached 'outage'
  if (!stateInfo || stateInfo.should_alert) {
    try {
      const notificationId = await sendMonitorFailure({
        error,
        stateInfo,
        source: 'github-watchdog',
      });
      console.log(JSON.stringify({ fallbackNotificationId: notificationId }));
    } catch {
      console.error('Fallback paging failed; monitoring requires operator attention.');
    }
  }

  process.exitCode = 1;
}

import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { runOperationalMonitor, sendMonitorFailure } from '../src/lib/operational-monitor.mjs';

try {
  const env = process.env;
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, init) => fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(15000) }) },
  });
  const { crons } = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const result = await runOperationalMonitor({ admin, crons });
  console.log(JSON.stringify(result));
  if (result.failed) { await sendMonitorFailure(); process.exitCode = 1; }
} catch {
  console.error('Operational monitor failed. Check configuration, database and delivery evidence.');
  try { console.log(JSON.stringify({ fallbackNotificationId: await sendMonitorFailure() })); }
  catch { console.error('Fallback paging failed; monitoring requires operator attention.'); }
  process.exitCode = 1;
}

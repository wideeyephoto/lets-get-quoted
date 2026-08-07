import { cronRoute } from '@/lib/cron-runs';
import { runDunningRetries } from '@/lib/dunning';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Daily sweep (scheduled in vercel.json) that retries failed recurring saved-card
// charges whose backoff is due, marking recovered/exhausted and notifying as it
// goes. Idempotency keys make a re-run safe. cronRoute supplies the CRON_SECRET
// check and writes the run to cron_runs.
export const GET = cronRoute('dunning', runDunningRetries);

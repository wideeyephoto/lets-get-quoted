import { createAdminClient } from '@/lib/auth';
import { cronRoute } from '@/lib/cron-runs';
import { runOwnerEventNotices } from '@/lib/owner-event-notices';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;
export const GET = cronRoute('owner-event-notices', async () => {
  if (process.env.LGQ_OWNER_EVENT_NOTICES_ENABLED !== 'true') return { skipped: true, reason: 'Owner notice background sending is disabled.' };
  return runOwnerEventNotices(createAdminClient());
});

import { createAdminClient } from '@/lib/auth';
import { cronRoute } from '@/lib/cron-runs';
import { runPlatformEventNotices } from '@/lib/platform-event-notices';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;
export const GET = cronRoute('platform-event-notices', async () => {
  if (process.env.LGQ_PLATFORM_EVENT_NOTICES_ENABLED !== 'true') return { skipped: true, reason: 'Platform notice background sending is disabled.' };
  const admin = createAdminClient();
  const notices = await runPlatformEventNotices(admin);
  return notices;
});

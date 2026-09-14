import { createAdminClient } from '@/lib/auth';
import { cronRoute } from '@/lib/cron-runs';
import { runPlatformEventNotices } from '@/lib/platform-event-notices';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;
export const GET = cronRoute('platform-event-notices', async () => {
  const admin = createAdminClient();
  const notices = await runPlatformEventNotices(admin);
  return notices;
});
